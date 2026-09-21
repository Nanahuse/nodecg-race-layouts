import { describe, expect, it } from "vitest";

import {
  RaceNotFoundError,
  RaceTimeAbortedError,
} from "../src/extension/integrations/racetime/errors";
import { canonicalizeRaceUrl } from "../src/extension/integrations/racetime/url";
import { RaceWatcher, type RaceWatcherState } from "../src/extension/integrations/racetime/watcher";
import {
  FakeRaceTimeClient,
  FakeScheduler,
  FakeWebSocketFactory,
  flushPromises,
  makeRaceDto,
} from "./support/racetime-fakes";

function setup(options: { dto?: ReturnType<typeof makeRaceDto> } = {}) {
  const client = new FakeRaceTimeClient();
  const dto = options.dto ?? makeRaceDto();
  client.handler = async () => dto;

  const factory = new FakeWebSocketFactory();
  const scheduler = new FakeScheduler();
  const updates: RaceWatcherState[] = [];
  const logs: { event: string; fields: Record<string, unknown> }[] = [];

  const watcher = new RaceWatcher({
    client,
    canonical: canonicalizeRaceUrl("https://racetime.gg/ootr/example-race-1234"),
    webSocketFactory: factory.create,
    scheduler,
    backoffMs: [1000, 2000],
    log: (event, fields) => logs.push({ event, fields }),
    onUpdate: (state) => updates.push(state),
  });

  return { watcher, client, factory, scheduler, updates, logs };
}

describe("RaceWatcher initial load", () => {
  it("fetches, connects the websocket and reports connected", async () => {
    const { watcher, client, factory } = setup();

    const initial = await watcher.start();

    expect(initial.race?.raceId).toBe("ootr/example-race-1234");
    expect(client.calls).toHaveLength(1);
    expect(factory.sockets).toHaveLength(1);
    expect(factory.last?.url).toBe("wss://racetime.gg/ws/race/example-race-1234");

    factory.last?.emitOpen();
    expect(watcher.getState().connection.state).toBe("connected");
  });

  it("does not schedule a reconnect when the initial load fails", async () => {
    const { watcher, client, factory, scheduler } = setup();
    client.handler = async () => {
      throw new RaceNotFoundError("nope");
    };

    await expect(watcher.start()).rejects.toBeInstanceOf(RaceNotFoundError);
    expect(factory.sockets).toHaveLength(0);
    expect(scheduler.pending).toBe(0);
  });
});

describe("RaceWatcher refresh", () => {
  it("re-fetches the Race Detail on a race.data message", async () => {
    const { watcher, client, factory } = setup();
    await watcher.start();
    factory.last?.emitOpen();
    client.reset();

    factory.last?.emitMessage({ type: "race.data", race: {}, version: 2 });
    await flushPromises();

    expect(client.calls).toHaveLength(1);
  });

  it("ignores unrelated events such as chat messages", async () => {
    const { watcher, client, factory } = setup();
    await watcher.start();
    factory.last?.emitOpen();
    client.reset();

    factory.last?.emitMessage({ type: "chat.message", message: { id: "x" } });
    factory.last?.emitMessage({ type: "race.renders", renders: {}, version: 2 });
    factory.last?.emitMessage("not json");
    await flushPromises();

    expect(client.calls).toHaveLength(0);
  });

  it("coalesces a burst of events into one in-flight plus one pending fetch", async () => {
    const { watcher, client, factory } = setup();
    await watcher.start();
    factory.last?.emitOpen();
    client.reset();

    factory.last?.emitMessage({ type: "race.data" });
    factory.last?.emitMessage({ type: "race.data" });
    factory.last?.emitMessage({ type: "race.data" });

    expect(client.calls).toHaveLength(1);
    await flushPromises();
    expect(client.calls).toHaveLength(2);
  });

  it("does not emit an update when the snapshot is unchanged", async () => {
    const { watcher, factory, updates } = setup();
    await watcher.start();
    factory.last?.emitOpen();
    const before = updates.length;

    factory.last?.emitMessage({ type: "race.data" });
    await flushPromises();

    expect(updates.length).toBe(before);
  });
});

describe("RaceWatcher reconnect", () => {
  it("keeps the last race and schedules a reconnect on disconnect", async () => {
    const { watcher, factory, scheduler } = setup();
    await watcher.start();
    factory.last?.emitOpen();

    factory.last?.emitClose();

    const state = watcher.getState();
    expect(state.race).not.toBeNull();
    expect(state.connection.state).toBe("connecting");
    expect(scheduler.pending).toBe(1);
    expect(scheduler.delays).toEqual([1000]);
  });

  it("re-fetches the latest race before reconnecting", async () => {
    const { watcher, client, factory, scheduler } = setup();
    await watcher.start();
    factory.last?.emitOpen();
    factory.last?.emitClose();

    client.handler = async () => makeRaceDto({ version: 2, status: "in_progress" });
    client.reset();
    scheduler.runNext();
    await flushPromises();

    expect(client.calls).toHaveLength(1);
    expect(factory.sockets).toHaveLength(2);
    expect(watcher.getState().race?.status).toBe("in_progress");
  });

  it("resets the backoff after a successful connection", async () => {
    const { watcher, factory, scheduler } = setup();
    await watcher.start();
    factory.last?.emitOpen();
    factory.last?.emitClose();
    expect(scheduler.delays).toEqual([1000]);

    scheduler.runNext();
    await flushPromises();
    factory.last?.emitOpen();

    factory.last?.emitClose();
    expect(scheduler.delays).toEqual([1000]);
  });
});

describe("RaceWatcher stop", () => {
  it("ignores updates after stop and closes the socket", async () => {
    const { watcher, factory, scheduler, logs } = setup();
    await watcher.start();
    factory.last?.emitOpen();

    watcher.stop();
    const before = watcher.getState();

    factory.last?.emitMessage({ type: "race.data" });
    scheduler.runNext();
    await flushPromises();

    expect(watcher.getState()).toEqual(before);
    expect(factory.last?.closed).toBe(true);
    expect(logs.some((entry) => entry.event === "racetime.session.stopped")).toBe(true);
  });

  it("aborts a pending request on stop", async () => {
    const { watcher, client, factory } = setup();
    await watcher.start();
    factory.last?.emitOpen();

    let aborted = false;
    client.handler = (_canonical, signal) =>
      new Promise((_resolve, reject) => {
        signal?.addEventListener(
          "abort",
          () => {
            aborted = true;
            reject(new RaceTimeAbortedError("aborted"));
          },
          { once: true },
        );
      });

    factory.last?.emitMessage({ type: "race.data" });
    await Promise.resolve();
    watcher.stop();
    await flushPromises();

    expect(aborted).toBe(true);
  });
});
