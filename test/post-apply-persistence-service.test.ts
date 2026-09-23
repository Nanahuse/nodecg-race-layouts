import { describe, expect, it } from "vitest";

import type {
  PostApplyPersistenceItem,
  PostApplyPersistenceState,
  PlayerMapping,
  RaceHistoryPayload,
  IntegrationStatus,
} from "../src/domain";
import { persistenceItemFromConfig } from "../src/domain";
import { PostApplyPersistenceService } from "../src/extension/application/post-apply-persistence-service";
import { SpreadsheetOperationStatusCoordinator } from "../src/extension/application/spreadsheet-status-coordinator";
import type { RaceHistoryRepository } from "../src/extension/integrations/spreadsheet/race-history-repository";
import { createDefaultIntegrationStatus } from "../src/replicants/defaults";
import type { Replicant } from "../src/types/nodecg";
import { makeActiveConfig } from "./factories";
import { createFakeLogger, TrackingReplicant } from "./support/fakes";

type Deferred<T> = {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(error: unknown): void;
};

function deferred<T>(): Deferred<T> {
  let resolvePromise: (value: T) => void = () => undefined;
  let rejectPromise: (error: unknown) => void = () => undefined;
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return { promise, resolve: resolvePromise, reject: rejectPromise };
}

class FakePlayersPersistence {
  readonly events: string[];
  readonly saved: PlayerMapping[][] = [];
  save: (players: readonly PlayerMapping[]) => Promise<void> = async () => undefined;

  constructor(events: string[]) {
    this.events = events;
  }

  async savePlayers(players: readonly PlayerMapping[]): Promise<void> {
    this.events.push(`players:${this.revisionFor(players)}`);
    this.saved.push([...players]);
    await this.save(players);
  }

  private revisionFor(players: readonly PlayerMapping[]): number {
    return Number(players[0]?.manualDisplayName?.match(/revision-(\d+)/)?.[1] ?? 0);
  }
}

class FakeRaceHistoryRepository implements RaceHistoryRepository {
  readonly events: string[];
  readonly saved: { history: RaceHistoryPayload; revision: number; appliedAt: string }[] = [];
  upsertOperation: () => Promise<void> = async () => undefined;

  constructor(events: string[]) {
    this.events = events;
  }

  async upsert(history: RaceHistoryPayload, activeRevision: number, appliedAt: string) {
    this.events.push(`history:${activeRevision}`);
    this.saved.push({ history, revision: activeRevision, appliedAt });
    await this.upsertOperation();
  }
}

function item(revision: number): PostApplyPersistenceItem {
  const config = makeActiveConfig({
    revision,
    players: Object.fromEntries(
      Object.entries(makeActiveConfig().players).map(([id, player]) => [
        id,
        { ...player, manualDisplayName: `revision-${revision}` },
      ]),
    ),
  });
  return persistenceItemFromConfig(config, `2026-09-23T07:00:0${revision}.000Z`);
}

function initialState(queue: PostApplyPersistenceItem[] = []): PostApplyPersistenceState {
  return {
    state: queue.length ? "pending" : "idle",
    queue,
    lastSavedActiveRevision: null,
    message: null,
  };
}

function waitForState(
  replicant: TrackingReplicant<PostApplyPersistenceState>,
  predicate: (state: PostApplyPersistenceState) => boolean,
): Promise<PostApplyPersistenceState> {
  return new Promise((resolve) => {
    replicant.on("change", (next) => {
      if (predicate(next)) resolve(next);
    });
  });
}

function persistenceEvents(events: readonly string[]): string[] {
  return events.filter((event) => !event.startsWith("set:"));
}

function setup(
  options: {
    queue?: PostApplyPersistenceItem[];
    coordinator?: SpreadsheetOperationStatusCoordinator | null;
  } = {},
) {
  const events: string[] = [];
  const state = new TrackingReplicant(
    "post-apply-persistence",
    initialState(options.queue),
    events,
  );
  const players = new FakePlayersPersistence(events);
  const history = new FakeRaceHistoryRepository(events);
  const fakeLogger = createFakeLogger();
  const service = new PostApplyPersistenceService(
    state as Replicant<PostApplyPersistenceState>,
    players,
    history,
    fakeLogger.logger,
    () => new Date("2026-09-23T07:00:00.000Z"),
    options.coordinator,
  );
  return { service, state, players, history, events, fakeLogger };
}

describe("PostApplyPersistenceService", () => {
  it("flushes Players then RaceHistory and clears the completed item", async () => {
    const { service, state, players, history, events } = setup({ queue: [item(1)] });

    const result = await service.flush();

    expect(persistenceEvents(events)).toEqual(["players:1", "history:1"]);
    expect(players.saved).toHaveLength(1);
    expect(history.saved).toHaveLength(1);
    expect(state.value).toEqual({
      state: "idle",
      queue: [],
      lastSavedActiveRevision: 1,
      message: null,
    });
    expect(result).toEqual({ ok: true, processed: 1, remaining: 0 });
  });

  it("processes queued revisions in FIFO order", async () => {
    const { service, state, events } = setup({ queue: [item(1), item(2)] });

    await service.flush();

    expect(persistenceEvents(events)).toEqual(["players:1", "history:1", "players:2", "history:2"]);
    expect(state.value.queue).toEqual([]);
    expect(state.value.lastSavedActiveRevision).toBe(2);
    expect(state.value.state).toBe("idle");
  });

  it("keeps a failed Players item and does not write RaceHistory", async () => {
    const { service, state, players, history, events } = setup({ queue: [item(1)] });
    players.save = async () => {
      throw new Error("Players sheet down");
    };

    const result = await service.flush();

    expect(result).toEqual({
      ok: false,
      reason: "persistence_failed",
      message: "Players sheet down",
      remaining: 1,
    });
    expect(history.saved).toHaveLength(0);
    expect(persistenceEvents(events)).toEqual(["players:1"]);
    expect(state.value.queue[0]).toMatchObject({ attempts: 1, lastError: "Players sheet down" });
    expect(state.value).toMatchObject({ state: "error", message: "Players sheet down" });
  });

  it("retries a Players failure and increments attempts", async () => {
    const { service, state, players, history, events } = setup({ queue: [item(1)] });
    players.save = async () => {
      throw new Error("temporary Players failure");
    };

    await service.flush();
    players.save = async () => {
      expect(state.value.queue[0]?.attempts).toBe(2);
    };
    const result = await service.flush();

    expect(result).toEqual({ ok: true, processed: 1, remaining: 0 });
    expect(persistenceEvents(events)).toEqual(["players:1", "players:1", "history:1"]);
    expect(history.saved).toHaveLength(1);
    expect(state.value).toEqual({
      state: "idle",
      queue: [],
      lastSavedActiveRevision: 1,
      message: null,
    });
  });

  it("retains a RaceHistory failure and retries Players before RaceHistory", async () => {
    const { service, state, players, history, events } = setup({ queue: [item(1)] });
    history.upsertOperation = async () => {
      throw new Error("RaceHistory sheet down");
    };

    const failed = await service.flush();
    expect(failed).toMatchObject({ ok: false, reason: "persistence_failed", remaining: 1 });
    expect(state.value.queue[0]).toMatchObject({
      attempts: 1,
      lastError: "RaceHistory sheet down",
    });
    expect(state.value).toMatchObject({ state: "error", message: "RaceHistory sheet down" });

    history.upsertOperation = async () => undefined;
    players.save = async () => {
      expect(state.value.queue[0]?.attempts).toBe(2);
    };
    await service.flush();

    expect(persistenceEvents(events)).toEqual(["players:1", "history:1", "players:1", "history:1"]);
    expect(state.value.queue).toEqual([]);
    expect(state.value.lastSavedActiveRevision).toBe(1);
    expect(state.value.state).toBe("idle");
    expect(state.value.message).toBeNull();
  });

  it("retries the immutable payload captured when the item was enqueued", async () => {
    const { service, state, players, history } = setup();
    const config = makeActiveConfig({ revision: 1 });
    const captured = persistenceItemFromConfig(config, "2026-09-23T07:00:00.000Z");
    const pendingSave = deferred<void>();
    let firstCall = true;
    players.save = async () => {
      if (firstCall) {
        firstCall = false;
        await pendingSave.promise;
        throw new Error("temporary failure");
      }
    };
    const failed = waitForState(state, (next) => next.state === "error");

    service.enqueue(config);
    config.players["player-1"]!.manualDisplayName = "changed after enqueue";
    pendingSave.resolve();
    await failed;
    players.save = async (savedPlayers) => {
      expect(savedPlayers).toEqual(captured.players);
    };

    await service.flush();

    expect(history.saved[0]?.history).toEqual(captured.raceHistory);
    expect(state.value.queue).toEqual([]);
  });

  it("automatically flushes a newly enqueued item", async () => {
    const { service, state, players, history } = setup();
    const pendingSave = deferred<void>();
    players.save = () => pendingSave.promise;
    const completed = waitForState(
      state,
      (next) => next.state === "idle" && next.queue.length === 0,
    );

    service.enqueue(makeActiveConfig({ revision: 1 }));
    expect(state.value.queue).toHaveLength(1);
    expect(state.value.queue[0]?.attempts).toBe(1);
    expect(players.saved).toHaveLength(1);
    expect(history.saved).toHaveLength(0);

    pendingSave.resolve();
    await completed;

    expect(state.value.lastSavedActiveRevision).toBe(1);
    expect(state.value.state).toBe("idle");
    expect(history.saved).toHaveLength(1);
  });

  it("does not enqueue or start a second in-flight item with the same revision", async () => {
    const { service, state, players, history } = setup();
    const pendingSave = deferred<void>();
    players.save = () => pendingSave.promise;
    const config = makeActiveConfig({ revision: 1 });

    service.enqueue(config);
    service.enqueue(config);

    expect(state.value.queue).toHaveLength(1);
    expect(players.saved).toHaveLength(1);
    expect(history.saved).toHaveLength(0);
    pendingSave.resolve();
    await waitForState(state, (next) => next.state === "idle" && next.queue.length === 0);
    expect(players.saved).toHaveLength(1);
  });

  it("returns persistence_in_progress without starting duplicate saves", async () => {
    const { service, state, players, history, events } = setup({ queue: [item(1)] });
    const pendingSave = deferred<void>();
    players.save = () => pendingSave.promise;

    const firstFlush = service.flush();
    const secondFlush = await service.flush();

    expect(secondFlush).toMatchObject({
      ok: false,
      reason: "persistence_in_progress",
      remaining: 1,
    });
    expect(players.saved).toHaveLength(1);
    expect(history.saved).toHaveLength(0);
    pendingSave.resolve();
    await firstFlush;
    expect(persistenceEvents(events)).toEqual(["players:1", "history:1"]);
    expect(state.value.queue).toEqual([]);
  });

  it("resumes a non-empty persisted queue automatically", async () => {
    const { service, state, players, history, fakeLogger } = setup({
      queue: [{ ...item(3), attempts: 2, lastError: "previous error" }],
    });
    state.value = { ...state.value, state: "error", message: "previous error" };
    const completed = waitForState(
      state,
      (next) => next.state === "idle" && next.queue.length === 0,
    );

    service.resume();
    await completed;

    expect(players.saved).toHaveLength(1);
    expect(history.saved).toHaveLength(1);
    expect(state.value.lastSavedActiveRevision).toBe(3);
    expect(state.value.state).toBe("idle");
    expect(state.value.message).toBeNull();
    expect(fakeLogger.infoMessages).toContain("[broadcast.persistence.resumed] queueLength=1");
  });

  it("does not change state or start work when resuming an empty queue", () => {
    const { service, state, players, history, events } = setup();
    const before = state.value;

    service.resume();

    expect(state.value).toBe(before);
    expect(events).toEqual([]);
    expect(players.saved).toEqual([]);
    expect(history.saved).toEqual([]);
  });

  it("reports coordinator saving, success, and failure states", async () => {
    const integrationStatus = new TrackingReplicant<IntegrationStatus>(
      "integration-status",
      createDefaultIntegrationStatus(),
    );
    const coordinator = new SpreadsheetOperationStatusCoordinator(integrationStatus);
    const failedSetup = setup({ queue: [item(1)], coordinator });
    const pendingSave = deferred<void>();
    failedSetup.players.save = () => pendingSave.promise;

    const firstFlush = failedSetup.service.flush();
    expect(integrationStatus.value.spreadsheet).toEqual({ state: "saving", message: null });
    pendingSave.reject(new Error("sheet unavailable"));
    await firstFlush;
    expect(integrationStatus.value.spreadsheet).toEqual({
      state: "error",
      message: "sheet unavailable",
    });

    failedSetup.players.save = async () => undefined;
    await failedSetup.service.flush();
    expect(integrationStatus.value.spreadsheet).toEqual({ state: "saved", message: null });
  });
});
