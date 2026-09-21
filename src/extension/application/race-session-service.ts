import type {
  IntegrationStatus,
  RaceSession,
  RaceSessionConnection,
  ServiceState,
} from "../../domain";
import { createDefaultIntegrationStatus } from "../../replicants/defaults";
import type { NodeCGLogger, Replicant } from "../../types/nodecg";
import type { RaceTimeClient } from "../integrations/racetime/client";
import { describeRaceTimeError, RaceTimeError } from "../integrations/racetime/errors";
import { jsonEquals } from "../integrations/racetime/equality";
import { canonicalizeRaceUrl, type CanonicalRaceUrl } from "../integrations/racetime/url";
import {
  RaceWatcher,
  type RaceWatcherLogEvent,
  type RaceWatcherScheduler,
  type RaceWatcherState,
  type WebSocketFactory,
} from "../integrations/racetime/watcher";

export type RaceSessionRole = "draft" | "active";

export const RACE_SESSION_ROLES: readonly RaceSessionRole[] = ["draft", "active"];

export type RaceSessionLoadFailureReason =
  | "invalid_url"
  | "not_found"
  | "timeout"
  | "network_error"
  | "http_error"
  | "invalid_payload"
  | "aborted"
  | "unknown";

export type RaceSessionLoadResult =
  | { ok: true; session: RaceSession }
  | { ok: false; reason: RaceSessionLoadFailureReason; message: string };

export type RaceSessionChangeListener = (role: RaceSessionRole, session: RaceSession) => void;

function toFailureReason(error: unknown): RaceSessionLoadFailureReason {
  if (error instanceof RaceTimeError) {
    switch (error.code) {
      case "invalid_url":
      case "not_found":
      case "timeout":
      case "network_error":
      case "http_error":
      case "invalid_payload":
      case "aborted":
        return error.code;
      default:
        return "unknown";
    }
  }
  return "unknown";
}

export type RaceSessionServiceOptions = {
  client: RaceTimeClient;
  webSocketFactory: WebSocketFactory;
  scheduler: RaceWatcherScheduler;
  log: NodeCGLogger;
  sessions: Record<RaceSessionRole, Replicant<RaceSession>>;
  integrationStatus: Replicant<IntegrationStatus>;
  backoffMs?: number[];
};

function createEmptySession(): RaceSession {
  return {
    revision: 0,
    canonicalUrl: null,
    connection: { state: "disconnected", message: null },
    race: null,
  };
}

function connectionEquals(a: RaceSessionConnection, b: RaceSessionConnection): boolean {
  return a.state === b.state && a.message === b.message;
}

function formatFieldValue(value: unknown): string {
  if (value instanceof Error) {
    return describeRaceTimeError(value);
  }
  return String(value);
}

/**
 * Owns the draft and active race sessions. Both roles use the same
 * implementation; they only differ in which replicant they write to.
 */
export class RaceSessionService {
  private readonly client: RaceTimeClient;
  private readonly webSocketFactory: WebSocketFactory;
  private readonly scheduler: RaceWatcherScheduler;
  private readonly log: NodeCGLogger;
  private readonly replicants: Record<RaceSessionRole, Replicant<RaceSession>>;
  private readonly integrationStatus: Replicant<IntegrationStatus>;
  private readonly backoffMs: number[] | undefined;

  private readonly sessions = new Map<RaceSessionRole, RaceSession>();
  private readonly watchers = new Map<RaceSessionRole, RaceWatcher>();
  private sessionChangeListener: RaceSessionChangeListener | null = null;

  constructor(options: RaceSessionServiceOptions) {
    this.client = options.client;
    this.webSocketFactory = options.webSocketFactory;
    this.scheduler = options.scheduler;
    this.log = options.log;
    this.replicants = options.sessions;
    this.integrationStatus = options.integrationStatus;
    this.backoffMs = options.backoffMs;
  }

  /**
   * Load a race for the given role. The initial fetch happens before any
   * existing watcher is stopped, so a failed load leaves the previous session
   * untouched.
   */
  async loadRace(role: RaceSessionRole, url: string): Promise<RaceSessionLoadResult> {
    this.logEvent("racetime.session.load.started", { role, url });

    let canonical: CanonicalRaceUrl;
    try {
      canonical = canonicalizeRaceUrl(url);
    } catch (error) {
      this.logEvent("racetime.session.load.failed", { role, url, error });
      return { ok: false, reason: "invalid_url", message: describeRaceTimeError(error) };
    }

    const hadCurrent = this.watchers.has(role);
    if (!hadCurrent) {
      this.applyWatcherState(role, {
        race: null,
        canonicalUrl: null,
        connection: { state: "connecting", message: null },
      });
    }

    const watcher = this.createWatcher(role, canonical);
    try {
      const initial = await watcher.start();

      const previous = this.watchers.get(role);
      if (previous && previous !== watcher) {
        previous.stop();
      }
      this.watchers.set(role, watcher);
      this.applyWatcherState(role, initial);

      const session = this.sessions.get(role);
      this.logEvent("racetime.session.load.completed", {
        role,
        url: canonical.canonicalUrl,
        raceId: initial.race?.raceId,
        revision: session?.revision,
      });
      if (!session) {
        return { ok: false, reason: "unknown", message: "Race session was not created." };
      }
      return { ok: true, session };
    } catch (error) {
      watcher.stop();
      this.logEvent("racetime.session.load.failed", {
        role,
        url: canonical.canonicalUrl,
        error,
      });
      if (!hadCurrent) {
        this.applyWatcherState(role, {
          race: null,
          canonicalUrl: null,
          connection: { state: "error", message: describeRaceTimeError(error) },
        });
      }
      return {
        ok: false,
        reason: toFailureReason(error),
        message: describeRaceTimeError(error),
      };
    }
  }

  /**
   * Register a listener invoked whenever a role's session value changes. Used
   * by the draft workflow to detect RaceTime-side structural changes.
   */
  setSessionChangeListener(listener: RaceSessionChangeListener | null): void {
    this.sessionChangeListener = listener;
  }

  stopRace(role: RaceSessionRole): void {
    const watcher = this.watchers.get(role);
    if (watcher) {
      watcher.stop();
      this.watchers.delete(role);
    }

    const previous = this.sessions.get(role);
    if (!previous) {
      return;
    }
    if (previous.connection.state === "disconnected" && previous.connection.message === null) {
      return;
    }

    const next: RaceSession = {
      ...previous,
      connection: { state: "disconnected", message: null },
    };
    this.sessions.set(role, next);
    this.replicants[role].value = next;
    this.updateIntegrationStatus();
  }

  stopAll(): void {
    for (const role of RACE_SESSION_ROLES) {
      this.stopRace(role);
    }
  }

  getSession(role: RaceSessionRole): RaceSession | undefined {
    return this.sessions.get(role);
  }

  private createWatcher(role: RaceSessionRole, canonical: CanonicalRaceUrl): RaceWatcher {
    const holder: { watcher: RaceWatcher | null } = { watcher: null };

    const watcher = new RaceWatcher({
      client: this.client,
      canonical,
      webSocketFactory: this.webSocketFactory,
      scheduler: this.scheduler,
      backoffMs: this.backoffMs,
      log: (event, fields) => this.logWatcherEvent(role, canonical, event, fields),
      onUpdate: (state) => {
        // Only the watcher currently installed for this role may update state.
        if (holder.watcher === null || this.watchers.get(role) !== holder.watcher) {
          return;
        }
        this.applyWatcherState(role, state);
      },
    });

    holder.watcher = watcher;
    return watcher;
  }

  private applyWatcherState(role: RaceSessionRole, state: RaceWatcherState): void {
    const previous = this.sessions.get(role) ?? createEmptySession();

    const raceChanged = !jsonEquals(previous.race, state.race);
    const urlChanged = previous.canonicalUrl !== state.canonicalUrl;
    const connectionChanged = !connectionEquals(previous.connection, state.connection);
    if (!raceChanged && !urlChanged && !connectionChanged) {
      return;
    }

    const next: RaceSession = {
      revision: raceChanged || urlChanged ? previous.revision + 1 : previous.revision,
      canonicalUrl: state.canonicalUrl,
      connection: state.connection,
      race: state.race,
    };
    this.sessions.set(role, next);
    this.replicants[role].value = next;
    this.updateIntegrationStatus();
    this.sessionChangeListener?.(role, next);
  }

  private updateIntegrationStatus(): void {
    const states = [...this.sessions.values()].map((session) => session.connection.state);

    let state: ServiceState;
    if (states.includes("connected")) {
      state = "connected";
    } else if (states.includes("connecting")) {
      state = "connecting";
    } else if (states.includes("error")) {
      state = "error";
    } else {
      state = "disconnected";
    }

    const current = this.integrationStatus.value ?? createDefaultIntegrationStatus();
    if (current.racetime.state === state && current.racetime.message === null) {
      return;
    }
    this.integrationStatus.value = { ...current, racetime: { state, message: null } };
  }

  private logWatcherEvent(
    role: RaceSessionRole,
    canonical: CanonicalRaceUrl,
    event: RaceWatcherLogEvent,
    fields: Record<string, unknown>,
  ): void {
    this.logEvent(event, {
      role,
      url: canonical.canonicalUrl,
      revision: this.sessions.get(role)?.revision,
      raceId: fields.raceId,
      version: fields.version,
      delayMs: fields.delayMs,
      reason: fields.reason,
      error: fields.error,
    });
  }

  private logEvent(event: string, fields: Record<string, unknown>): void {
    const parts: string[] = [];
    for (const [key, value] of Object.entries(fields)) {
      if (value === undefined) {
        continue;
      }
      parts.push(`${key}=${formatFieldValue(value)}`);
    }
    const message = parts.length > 0 ? `[${event}] ${parts.join(" ")}` : `[${event}]`;

    if (event.endsWith(".failed")) {
      this.log.error(message);
    } else if (
      event.endsWith(".disconnected") ||
      event.endsWith(".scheduled") ||
      event.endsWith(".stopped")
    ) {
      this.log.warn(message);
    } else {
      this.log.info(message);
    }
  }
}
