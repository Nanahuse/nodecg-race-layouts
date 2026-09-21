import type { RaceTimeClient } from "../../src/extension/integrations/racetime/client";
import type {
  RaceTimeEntrantDto,
  RaceTimeRaceDto,
} from "../../src/extension/integrations/racetime/types";
import type { CanonicalRaceUrl } from "../../src/extension/integrations/racetime/url";
import type {
  RaceWatcherScheduler,
  WebSocketFactory,
  WebSocketLike,
} from "../../src/extension/integrations/racetime/watcher";

export function makeEntrantDto(overrides: Partial<RaceTimeEntrantDto> = {}): RaceTimeEntrantDto {
  return {
    userId: "user-1",
    name: "Runner One",
    twitchLogin: "runner_one",
    status: "ready",
    finishTime: null,
    place: null,
    ...overrides,
  };
}

export function makeRaceDto(overrides: Partial<RaceTimeRaceDto> = {}): RaceTimeRaceDto {
  return {
    version: 1,
    name: "ootr/example-race-1234",
    slug: "example-race-1234",
    status: "open",
    url: "/ootr/example-race-1234",
    dataUrl: "/ootr/example-race-1234/data",
    websocketUrl: "/ws/race/example-race-1234",
    categorySlug: "ootr",
    categoryName: "Ocarina of Time Randomizer",
    goal: "Defeat Ganon",
    entrants: [
      makeEntrantDto({ userId: "user-1", name: "Runner One", twitchLogin: "runner_one" }),
      makeEntrantDto({
        userId: "user-2",
        name: "Runner Two",
        twitchLogin: null,
        status: "not_ready",
      }),
    ],
    ...overrides,
  };
}

export class FakeRaceTimeClient implements RaceTimeClient {
  readonly calls: CanonicalRaceUrl[] = [];
  handler: (canonical: CanonicalRaceUrl, signal?: AbortSignal) => Promise<RaceTimeRaceDto> =
    async () => makeRaceDto();

  fetchRaceDetail(canonical: CanonicalRaceUrl, signal?: AbortSignal): Promise<RaceTimeRaceDto> {
    this.calls.push(canonical);
    return this.handler(canonical, signal);
  }

  reset(): void {
    this.calls.length = 0;
  }
}

export class FakeScheduler implements RaceWatcherScheduler {
  private nextHandle = 1;
  private timers: { handle: number; callback: () => void; delayMs: number }[] = [];

  setTimeout(callback: () => void, delayMs: number): unknown {
    const handle = this.nextHandle;
    this.nextHandle += 1;
    this.timers.push({ handle, callback, delayMs });
    return handle;
  }

  clearTimeout(handle: unknown): void {
    this.timers = this.timers.filter((timer) => timer.handle !== handle);
  }

  get pending(): number {
    return this.timers.length;
  }

  get delays(): number[] {
    return this.timers.map((timer) => timer.delayMs);
  }

  runNext(): void {
    const timer = this.timers.shift();
    timer?.callback();
  }
}

export class FakeWebSocket implements WebSocketLike {
  onopen: ((event: unknown) => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: ((event: unknown) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  closed = false;
  readonly url: string;

  constructor(url: string) {
    this.url = url;
  }

  close(): void {
    this.closed = true;
  }

  emitOpen(): void {
    this.onopen?.({});
  }

  emitMessage(message: unknown): void {
    this.onmessage?.({ data: typeof message === "string" ? message : JSON.stringify(message) });
  }

  emitClose(): void {
    this.onclose?.({});
  }

  emitError(): void {
    this.onerror?.({});
  }
}

export class FakeWebSocketFactory {
  readonly sockets: FakeWebSocket[] = [];
  readonly create: WebSocketFactory = (url) => {
    const socket = new FakeWebSocket(url);
    this.sockets.push(socket);
    return socket;
  };

  get last(): FakeWebSocket | undefined {
    return this.sockets[this.sockets.length - 1];
  }
}

export async function flushPromises(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}
