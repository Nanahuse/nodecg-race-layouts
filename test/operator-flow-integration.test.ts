import { describe, expect, it } from "vitest";
import type {
  ActiveConfig,
  ActiveSpeedrunSnapshot,
  DraftConfig,
  IntegrationStatus,
  RaceResultPageData,
} from "../src/domain";
import { BROADCAST_APPLY_MESSAGE } from "../src/protocol/broadcast";
import { CATEGORY_SELECT_MESSAGE } from "../src/protocol/category";
import { RACE_RECONCILE_MESSAGE, RACE_LOAD_MESSAGE } from "../src/protocol/race";
import {
  COMMENTATORS_SET_MESSAGE,
  RACE_SCREEN_SET_SLOTS_MESSAGE,
} from "../src/protocol/race-presentation";
import { PARTICIPANT_SET_DISPLAY_NAME_MESSAGE } from "../src/protocol/participant";
import { SPEEDRUN_SNAPSHOT_REFRESH_MESSAGE } from "../src/protocol/speedrun-snapshot";
import { makeEntrantDto, makeRaceDto } from "./support/racetime-fakes";
import { createOperatorFlowHarness } from "./support/operator-flow-harness";

async function sendAtDraftRevision(
  harness: ReturnType<typeof createOperatorFlowHarness>,
  message: string,
  payload: Record<string, unknown>,
) {
  const revision = harness.get<DraftConfig>("draft-config").value.revision;
  return harness.send(message, { ...payload, expectedDraftRevision: revision });
}

async function prepareAndApply(harness: ReturnType<typeof createOperatorFlowHarness>) {
  const loaded = await harness.send<{ ok: boolean; participantCount?: number }>(RACE_LOAD_MESSAGE, {
    url: harness.raceUrl,
  });
  expect(loaded.ok).toBe(true);
  expect(loaded.participantCount).toBe(4);
  const draft = harness.get<DraftConfig>("draft-config");
  expect(draft.value.participants).toHaveLength(4);
  expect(draft.value.raceScreenSlots).toEqual({
    1: "user-1",
    2: "user-2",
    3: "user-3",
    4: "user-4",
  });
  expect(harness.get<ActiveConfig | null>("active-config").value).toBeNull();

  await sendAtDraftRevision(harness, PARTICIPANT_SET_DISPLAY_NAME_MESSAGE, {
    racetimeUserId: "user-1",
    displayName: "Broadcast Alpha",
  });
  await sendAtDraftRevision(harness, CATEGORY_SELECT_MESSAGE, { selection: harness.selection });
  await sendAtDraftRevision(harness, RACE_SCREEN_SET_SLOTS_MESSAGE, {
    slots: { 1: "user-4", 2: "user-3", 3: "user-2", 4: "user-1" },
  });
  await sendAtDraftRevision(harness, COMMENTATORS_SET_MESSAGE, {
    playerIds: ["player-1", "player-2"],
  });
  const snapshot = await sendAtDraftRevision(harness, SPEEDRUN_SNAPSHOT_REFRESH_MESSAGE, {});
  expect(snapshot).toMatchObject({ ok: true });
  expect(harness.get<DraftSpeedrunSnapshotLike>("draft-speedrun-snapshot").value.state).toBe(
    "ready",
  );
  expect(harness.get<IntegrationStatus>("integration-status").value.broadcast.state).toBe("ready");
  const applied = await sendAtDraftRevision(harness, BROADCAST_APPLY_MESSAGE, {});
  expect(applied).toMatchObject({ ok: true, activeRevision: 1 });
}

type DraftSpeedrunSnapshotLike = { state: string; snapshot: unknown; draftRevision: number };

describe("operator flow integration", () => {
  it("runs race load, draft edits, snapshot, apply, static graphics and live results", async () => {
    const harness = createOperatorFlowHarness();
    await prepareAndApply(harness);

    const active = harness.get<ActiveConfig | null>("active-config").value;
    const activeSnapshot = harness.get<ActiveSpeedrunSnapshot | null>(
      "active-speedrun-snapshot",
    ).value;
    expect(active).not.toBeNull();
    expect(activeSnapshot).not.toBeNull();
    expect(active?.revision).toBe(activeSnapshot?.activeRevision);
    expect(active?.participants).toHaveLength(4);
    expect(harness.get("race-overlay-data").value).toMatchObject({
      activeRevision: active?.revision,
      players: expect.arrayContaining([
        expect.objectContaining({ displayName: "Broadcast Alpha" }),
      ]),
    });
    expect(harness.get("participant-list-data").value).not.toBeNull();
    expect(harness.get("leaderboard-page-data").value).not.toBeNull();
    expect(harness.persistenceQueue).toHaveLength(1);

    harness.setRace(
      makeRaceDto({
        name: "ootr/operator-flow",
        slug: "operator-flow",
        categorySlug: "ootr",
        categoryName: "Ocarina Randomizer",
        goal: "Defeat Ganon",
        url: "/ootr/operator-flow",
        dataUrl: "/ootr/operator-flow/data",
        websocketUrl: "/ws/race/ootr/operator-flow",
        status: "finished",
        entrants: [
          makeEntrantDto({
            userId: "user-1",
            name: "Entrant 1",
            status: "done",
            place: 1,
            finishTime: "PT1H2M3S",
          }),
          makeEntrantDto({ userId: "user-2", name: "Entrant 2", status: "dnf" }),
          makeEntrantDto({ userId: "user-3", name: "Entrant 3" }),
          makeEntrantDto({ userId: "user-4", name: "Entrant 4" }),
        ],
      }),
    );
    harness.sockets.sockets[1]?.emitMessage({ type: "race.data" });
    await harness.flush();
    const result = harness.get<RaceResultPageData | null>("race-result-page-data").value;
    expect(result?.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "Broadcast Alpha",
          place: 1,
          time: "1:02:03",
          status: "finished",
        }),
        expect.objectContaining({ placeLabel: "DNF", status: "dnf" }),
      ]),
    );
  });

  it("marks structural RaceTime changes for reconciliation and applies them only on request", async () => {
    const harness = createOperatorFlowHarness();
    await harness.send(RACE_LOAD_MESSAGE, { url: harness.raceUrl });
    const draft = harness.get<DraftConfig>("draft-config");
    const originalRevision = draft.value.revision;
    const originalName = draft.value.players[draft.value.participants[0]!.playerId!]?.racetime;

    harness.setRace(
      makeRaceDto({
        name: "ootr/operator-flow",
        slug: "operator-flow",
        categorySlug: "ootr",
        categoryName: "Ocarina Randomizer",
        goal: "Defeat Ganon",
        url: "/ootr/operator-flow",
        dataUrl: "/ootr/operator-flow/data",
        websocketUrl: "/ws/race/ootr/operator-flow",
        entrants: [
          makeEntrantDto({ userId: "user-1", name: "Renamed Entrant 1", twitchLogin: "renamed1" }),
          ...[2, 3, 4].map((index) =>
            makeEntrantDto({
              userId: "user-" + index,
              name: "Entrant " + index,
              twitchLogin: "twitch" + index,
            }),
          ),
          makeEntrantDto({ userId: "user-5", name: "New Entrant", twitchLogin: "twitch5" }),
        ],
      }),
    );
    harness.sockets.sockets[0]?.emitMessage({ type: "race.data" });
    await harness.flush();

    expect(harness.get<IntegrationStatus>("integration-status").value.broadcast.state).toBe(
      "reconciliation_required",
    );
    expect(draft.value.revision).toBe(originalRevision);
    expect(draft.value.participants).toHaveLength(4);
    expect(draft.value.players[draft.value.participants[0]!.playerId!]?.racetime).toEqual(
      originalName,
    );

    const reconciled = await sendAtDraftRevision(harness, RACE_RECONCILE_MESSAGE, {});
    expect(reconciled).toMatchObject({ ok: true, changed: true, participantCount: 5 });
    expect(draft.value.revision).toBe(originalRevision + 1);
    expect(draft.value.participants).toHaveLength(5);
    expect(draft.value.players[draft.value.participants[0]!.playerId!]?.racetime).toMatchObject({
      state: "linked",
      value: { name: "Renamed Entrant 1" },
    });
  });

  it("preserves active and graphics replicants when a later apply cannot load the active race", async () => {
    const harness = createOperatorFlowHarness();
    await prepareAndApply(harness);
    const activeBefore = harness.get<ActiveConfig | null>("active-config").value;
    const snapshotBefore = harness.get<ActiveSpeedrunSnapshot | null>(
      "active-speedrun-snapshot",
    ).value;
    const overlayBefore = harness.get("race-overlay-data").value;
    const participantsBefore = harness.get("participant-list-data").value;
    const leaderboardBefore = harness.get("leaderboard-page-data").value;

    await sendAtDraftRevision(harness, PARTICIPANT_SET_DISPLAY_NAME_MESSAGE, {
      racetimeUserId: "user-1",
      displayName: "Changed Draft Name",
    });
    harness.failNextRaceFetch();
    const failed = await sendAtDraftRevision(harness, BROADCAST_APPLY_MESSAGE, {});

    expect(failed).toMatchObject({ ok: false, reason: "active_race_load_failed" });
    expect(harness.get<ActiveConfig | null>("active-config").value).toBe(activeBefore);
    expect(harness.get<ActiveSpeedrunSnapshot | null>("active-speedrun-snapshot").value).toBe(
      snapshotBefore,
    );
    expect(harness.get("race-overlay-data").value).toBe(overlayBefore);
    expect(harness.get("participant-list-data").value).toBe(participantsBefore);
    expect(harness.get("leaderboard-page-data").value).toBe(leaderboardBefore);
    expect(harness.persistenceQueue).toHaveLength(1);
  });
});
