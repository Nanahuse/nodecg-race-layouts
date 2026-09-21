import type { RaceSessionConnection, RaceSessionRace } from "../../../domain";
import type { RaceTimeClient } from "./client";
import { describeRaceTimeError, isAbortedError } from "./errors";
import { jsonEquals } from "./equality";
import { mapRaceDetail } from "./mapper";
import type { RaceTimeRaceDto } from "./types";
import { resolveWebSocketUrl, type CanonicalRaceUrl } from "./url";

const DEFAULT_BACKOFF_MS = [1000, 2000, 5000, 10000, 30000];

export type WebSocketLike = {
  onopen: ((event: unknown) => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: ((event: unknown) => void) | null;
  onerror: ((event: unknown) => void) | null;
  close(): void;
};

export type WebSocketFactory = (url: string) => WebSocketLike;

export type RaceWatcherScheduler = {
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
};

export type RaceWatcherLogEvent =
  | "racetime.session.load.started"
  | "racetime.session.load.completed"
  | "racetime.session.load.failed"
  | "racetime.websocket.connecting"
  | "racetime.websocket.connected"
  | "racetime.websocket.disconnected"
  | "racetime.refresh.started"
  | "racetime.refresh.completed"
  | "racetime.refresh.failed"
  | "racetime.reconnect.scheduled"
  | "racetime.session.stopped";

export type RaceWatcherLog = (event: RaceWatcherLogEvent, fields: Record<string, unknown>) => void;

export type RaceWatcherState = {
  race: RaceSessionRace | null;
  canonicalUrl: string | null;
  connection: RaceSessionConnection;
};

export type RaceWatcherOptions = {
  client: RaceTimeClient;
  canonical: CanonicalRaceUrl;
  webSocketFactory: WebSocketFactory;
  scheduler: RaceWatcherScheduler;
  log: RaceWatcherLog;
  onUpdate: (state: RaceWatcherState) => void;
  backoffMs?: number[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Watches a single RaceTime.gg race.
 *
 * The WebSocket is treated purely as an invalidation signal: a `race.data`
 * message triggers a full Race Detail re-fetch, and the normalized snapshot is
 * replaced. WebSocket payloads are never applied as deltas.
 */
export class RaceWatcher {
  private readonly client: RaceTimeClient;
  private readonly canonical: CanonicalRaceUrl;
  private readonly webSocketFactory: WebSocketFactory;
  private readonly scheduler: RaceWatcherScheduler;
  private readonly log: RaceWatcherLog;
  private readonly onUpdate: (state: RaceWatcherState) => void;
  private readonly backoffMs: number[];

  private race: RaceSessionRace | null = null;
  private connection: RaceSessionConnection = { state: "connecting", message: null };

  private active = false;
  private socket: WebSocketLike | null = null;
  private socketOpen = false;
  private refreshing = false;
  private refreshPending = false;
  private reconnectTimer: unknown = null;
  private backoffIndex = 0;
  private fetchController: AbortController | null = null;

  constructor(options: RaceWatcherOptions) {
    this.client = options.client;
    this.canonical = options.canonical;
    this.webSocketFactory = options.webSocketFactory;
    this.scheduler = options.scheduler;
    this.log = options.log;
    this.onUpdate = options.onUpdate;
    this.backoffMs = options.backoffMs ?? DEFAULT_BACKOFF_MS;
  }

  /**
   * Perform the initial Race Detail fetch and start watching. Rejects (without
   * scheduling a reconnect) when the race cannot be loaded, so callers can keep
   * an existing session intact.
   */
  async start(): Promise<RaceWatcherState> {
    this.active = true;
    this.log("racetime.session.load.started", {});

    let dto: RaceTimeRaceDto;
    try {
      dto = await this.fetchDetail();
    } catch (error) {
      this.active = false;
      if (!isAbortedError(error)) {
        this.log("racetime.session.load.failed", { error });
      }
      throw error;
    }

    if (!this.active) {
      throw new Error("RaceWatcher was stopped during its initial load.");
    }

    this.race = mapRaceDetail(dto);
    this.log("racetime.session.load.completed", { raceId: this.race.raceId, version: dto.version });
    this.connectWebSocket(dto.websocketUrl);
    return this.snapshot();
  }

  getState(): RaceWatcherState {
    return this.snapshot();
  }

  stop(): void {
    if (!this.active) {
      return;
    }
    this.active = false;
    this.socketOpen = false;

    if (this.reconnectTimer !== null) {
      this.scheduler.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.fetchController?.abort();
    this.fetchController = null;

    const socket = this.socket;
    this.socket = null;
    if (socket) {
      socket.onopen = null;
      socket.onmessage = null;
      socket.onclose = null;
      socket.onerror = null;
      try {
        socket.close();
      } catch {
        // ignore close errors on teardown
      }
    }

    this.log("racetime.session.stopped", {});
  }

  private snapshot(): RaceWatcherState {
    return {
      race: this.race,
      canonicalUrl: this.canonical.canonicalUrl,
      connection: this.connection,
    };
  }

  private emit(): void {
    this.onUpdate(this.snapshot());
  }

  private setConnection(connection: RaceSessionConnection): void {
    if (
      this.connection.state === connection.state &&
      this.connection.message === connection.message
    ) {
      return;
    }
    this.connection = connection;
    this.emit();
  }

  private applyDto(dto: RaceTimeRaceDto): void {
    const race = mapRaceDetail(dto);
    if (jsonEquals(this.race, race)) {
      return;
    }
    this.race = race;
    this.emit();
  }

  private async fetchDetail(): Promise<RaceTimeRaceDto> {
    const controller = new AbortController();
    this.fetchController = controller;
    try {
      return await this.client.fetchRaceDetail(this.canonical, controller.signal);
    } finally {
      if (this.fetchController === controller) {
        this.fetchController = null;
      }
    }
  }

  private connectWebSocket(rawUrl: string): void {
    let url: string;
    try {
      url = resolveWebSocketUrl(rawUrl);
    } catch (error) {
      this.setConnection({ state: "error", message: describeRaceTimeError(error) });
      this.scheduleReconnect();
      return;
    }

    this.log("racetime.websocket.connecting", { url });
    this.setConnection({ state: "connecting", message: null });

    let socket: WebSocketLike;
    try {
      socket = this.webSocketFactory(url);
    } catch (error) {
      this.setConnection({ state: "error", message: describeRaceTimeError(error) });
      this.scheduleReconnect();
      return;
    }

    this.socket = socket;
    socket.onopen = () => {
      if (!this.isCurrent(socket)) {
        return;
      }
      this.socketOpen = true;
      this.backoffIndex = 0;
      this.log("racetime.websocket.connected", {});
      this.setConnection({ state: "connected", message: null });
    };
    socket.onmessage = (event) => {
      if (!this.isCurrent(socket)) {
        return;
      }
      this.handleSocketMessage(event.data);
    };
    socket.onclose = () => {
      if (!this.isCurrent(socket)) {
        return;
      }
      this.socket = null;
      this.socketOpen = false;
      this.log("racetime.websocket.disconnected", {});
      this.setConnection({ state: "connecting", message: "Connection lost; reconnecting." });
      this.scheduleReconnect();
    };
    socket.onerror = () => {
      if (!this.isCurrent(socket)) {
        return;
      }
      this.log("racetime.websocket.disconnected", { reason: "error" });
    };
  }

  private isCurrent(socket: WebSocketLike): boolean {
    return this.active && this.socket === socket;
  }

  private handleSocketMessage(data: unknown): void {
    if (typeof data !== "string") {
      return;
    }
    let message: unknown;
    try {
      message = JSON.parse(data);
    } catch {
      return;
    }
    if (!isRecord(message)) {
      return;
    }
    // `race.data` is the race-state invalidation signal (see racetime-app
    // RaceConsumer.race_update). Chat/other events are ignored.
    if (message.type === "race.data") {
      this.scheduleRefresh();
    }
  }

  private scheduleRefresh(): void {
    if (!this.active) {
      return;
    }
    if (this.refreshing) {
      this.refreshPending = true;
      return;
    }
    void this.runRefresh();
  }

  private async runRefresh(): Promise<void> {
    this.refreshing = true;
    this.log("racetime.refresh.started", {});

    try {
      const dto = await this.fetchDetail();
      if (!this.active) {
        return;
      }
      this.applyDto(dto);
      if (this.socketOpen && this.connection.state !== "connected") {
        this.setConnection({ state: "connected", message: null });
      }
      this.log("racetime.refresh.completed", { raceId: this.race?.raceId, version: dto.version });
    } catch (error) {
      if (!this.active || isAbortedError(error)) {
        return;
      }
      this.log("racetime.refresh.failed", { error });
      this.setConnection({ state: "error", message: describeRaceTimeError(error) });
    } finally {
      this.refreshing = false;
    }

    if (this.refreshPending) {
      this.refreshPending = false;
      this.scheduleRefresh();
    }
  }

  private scheduleReconnect(): void {
    if (!this.active || this.reconnectTimer !== null) {
      return;
    }
    const index = Math.min(this.backoffIndex, this.backoffMs.length - 1);
    const delayMs =
      this.backoffMs[index] ?? DEFAULT_BACKOFF_MS[DEFAULT_BACKOFF_MS.length - 1] ?? 30000;
    this.backoffIndex += 1;
    this.log("racetime.reconnect.scheduled", { delayMs });
    this.reconnectTimer = this.scheduler.setTimeout(() => {
      this.reconnectTimer = null;
      void this.reconnect();
    }, delayMs);
  }

  private async reconnect(): Promise<void> {
    if (!this.active) {
      return;
    }
    this.log("racetime.refresh.started", { reason: "reconnect" });

    try {
      const dto = await this.fetchDetail();
      if (!this.active) {
        return;
      }
      this.applyDto(dto);
      this.log("racetime.refresh.completed", { raceId: this.race?.raceId, version: dto.version });
      this.connectWebSocket(dto.websocketUrl);
    } catch (error) {
      if (!this.active || isAbortedError(error)) {
        return;
      }
      this.log("racetime.refresh.failed", { error });
      this.setConnection({ state: "error", message: describeRaceTimeError(error) });
      this.scheduleReconnect();
    }
  }
}
