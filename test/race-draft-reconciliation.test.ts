import { describe, expect, it } from "vitest";

import type { DraftConfig, PlayerDirectory, RaceSession } from "../src/domain";
import {
  countUnresolvedPlayers,
  needsDraftReconciliation,
  reconcileDraft,
} from "../src/extension/application/race-draft-reconciliation";
import { buildInitialDraft } from "../src/extension/application/race-draft-service";
import type { PlayerIdFactory } from "../src/extension/application/player-resolution-service";
import { makeSession, makeSessionRace, makeEntrant } from "./support/draft-fakes";

function sequentialIds(prefix = "p"): PlayerIdFactory {
  let next = 0;
  return () => {
    next += 1;
    return `${prefix}-new-${next}`;
  };
}

function buildDraft(session: RaceSession, directory: PlayerDirectory = {}): DraftConfig {
  return buildInitialDraft({
    session,
    directory,
    playerIdFactory: sequentialIds("draft"),
    revision: 1,
  }).draft;
}

function baseSession(): RaceSession {
  return makeSession({
    race: makeSessionRace({
      entrants: [
        makeEntrant({ userId: "rt-1", name: "One", twitchLogin: "one" }),
        makeEntrant({ userId: "rt-2", name: "Two", twitchLogin: "two" }),
      ],
    }),
  });
}

function withEntrants(
  session: RaceSession,
  entrants: ReturnType<typeof makeEntrant>[],
): RaceSession {
  return { ...session, race: session.race ? { ...session.race, entrants } : null };
}

describe("needsDraftReconciliation", () => {
  const session = baseSession();
  const draft = buildDraft(session);

  it("detects an added entrant", () => {
    const next = withEntrants(session, [
      ...session.race!.entrants,
      makeEntrant({ userId: "rt-3" }),
    ]);
    expect(needsDraftReconciliation(draft, next)).toBe(true);
  });

  it("detects a removed entrant", () => {
    const next = withEntrants(session, [session.race!.entrants[0]!]);
    expect(needsDraftReconciliation(draft, next)).toBe(true);
  });

  it("detects an entrant order change", () => {
    const next = withEntrants(session, [session.race!.entrants[1]!, session.race!.entrants[0]!]);
    expect(needsDraftReconciliation(draft, next)).toBe(true);
  });

  it("detects a RaceTime name change", () => {
    const next = withEntrants(session, [
      makeEntrant({ userId: "rt-1", name: "One Updated", twitchLogin: "one" }),
      session.race!.entrants[1]!,
    ]);
    expect(needsDraftReconciliation(draft, next)).toBe(true);
  });

  it("detects a Twitch login change", () => {
    const next = withEntrants(session, [
      makeEntrant({ userId: "rt-1", name: "One", twitchLogin: "one_new" }),
      session.race!.entrants[1]!,
    ]);
    expect(needsDraftReconciliation(draft, next)).toBe(true);
  });

  it("detects a category slug change", () => {
    const next: RaceSession = {
      ...session,
      race: session.race ? { ...session.race, categorySlug: "mm" } : null,
    };
    expect(needsDraftReconciliation(draft, next)).toBe(true);
  });

  it("detects a goal change", () => {
    const next: RaceSession = {
      ...session,
      race: session.race ? { ...session.race, goal: "All Dungeons" } : null,
    };
    expect(needsDraftReconciliation(draft, next)).toBe(true);
  });

  it("detects a category name change", () => {
    const next: RaceSession = {
      ...session,
      race: session.race ? { ...session.race, categoryName: "New Name" } : null,
    };
    expect(needsDraftReconciliation(draft, next)).toBe(true);
  });

  it("ignores a race status change", () => {
    const next: RaceSession = {
      ...session,
      race: session.race ? { ...session.race, status: "in_progress" } : null,
    };
    expect(needsDraftReconciliation(draft, next)).toBe(false);
  });

  it("ignores entrant race status changes", () => {
    const next = withEntrants(session, [
      makeEntrant({ userId: "rt-1", name: "One", twitchLogin: "one", status: "done" }),
      makeEntrant({ userId: "rt-2", name: "Two", twitchLogin: "two", status: "dnf" }),
    ]);
    expect(needsDraftReconciliation(draft, next)).toBe(false);
  });

  it("ignores finish time and place changes", () => {
    const next: RaceSession = {
      ...session,
      race: session.race
        ? {
            ...session.race,
            results: [
              { userId: "rt-1", name: "One", place: 1, time: "PT1H2M3S", status: "finished" },
            ],
          }
        : null,
    };
    expect(needsDraftReconciliation(draft, next)).toBe(false);
  });
});

describe("reconcileDraft", () => {
  it("keeps existing participants and their player ids", () => {
    const session = baseSession();
    const draft = buildDraft(session);
    const firstPlayerId = draft.participants[0]?.playerId;

    const next = withEntrants(session, [
      ...session.race!.entrants,
      makeEntrant({ userId: "rt-3" }),
    ]);
    const outcome = reconcileDraft({
      draft,
      session: next,
      directory: {},
      playerIdFactory: sequentialIds("r"),
    });

    expect(outcome.changed).toBe(true);
    expect(outcome.draft.participants[0]?.playerId).toBe(firstPlayerId);
    expect(outcome.draft.participants.map((p) => p.racetimeUserId)).toEqual([
      "rt-1",
      "rt-2",
      "rt-3",
    ]);
    expect(outcome.participantsChanged).toBe(true);
    expect(outcome.draft.revision).toBe(draft.revision + 1);
  });

  it("preserves operator edits on a kept draft player", () => {
    const session = baseSession();
    const draft = buildDraft(session);
    const playerId = draft.participants[0]?.playerId;
    if (!playerId) throw new Error("expected a player id");
    draft.players[playerId] = {
      ...draft.players[playerId]!,
      manualDisplayName: "Edited",
      speedrunCom: {
        state: "linked",
        value: { userId: "src-1", name: "SRC", twitchLogin: null },
        source: "manual",
      },
    };

    const next = withEntrants(session, [
      makeEntrant({ userId: "rt-1", name: "Renamed", twitchLogin: "one" }),
      session.race!.entrants[1]!,
    ]);
    const outcome = reconcileDraft({
      draft,
      session: next,
      directory: {},
      playerIdFactory: sequentialIds("r"),
    });

    const player = outcome.draft.players[playerId];
    expect(player?.manualDisplayName).toBe("Edited");
    expect(player?.speedrunCom.state).toBe("linked");
    expect(player?.racetime).toEqual({
      state: "linked",
      value: { userId: "rt-1", name: "Renamed", twitchLogin: "one" },
      source: "racetime",
    });
  });

  it("updates the RaceTime name and Twitch login for kept participants", () => {
    const session = baseSession();
    const draft = buildDraft(session);

    const next = withEntrants(session, [
      makeEntrant({ userId: "rt-1", name: "New Name", twitchLogin: "new_tw" }),
      session.race!.entrants[1]!,
    ]);
    const outcome = reconcileDraft({
      draft,
      session: next,
      directory: {},
      playerIdFactory: sequentialIds("r"),
    });

    const playerId = draft.participants[0]?.playerId;
    expect(outcome.draft.players[playerId!]?.racetime).toMatchObject({
      state: "linked",
      value: { name: "New Name", twitchLogin: "new_tw" },
    });
  });

  it("clears only the slot of a removed entrant and does not auto-fill", () => {
    const session = baseSession();
    const draft = buildDraft(session);
    draft.raceScreenSlots = { 1: "rt-1", 2: "rt-2", 3: null, 4: null };

    const next = withEntrants(session, [
      session.race!.entrants[0]!,
      makeEntrant({ userId: "rt-3" }),
    ]);
    const outcome = reconcileDraft({
      draft,
      session: next,
      directory: {},
      playerIdFactory: sequentialIds("r"),
    });

    expect(outcome.draft.raceScreenSlots).toEqual({ 1: "rt-1", 2: null, 3: null, 4: null });
  });

  it("keeps commentators and their players", () => {
    const session = baseSession();
    const draft = buildDraft(session);
    const removedPlayerId = draft.participants[1]?.playerId;
    if (!removedPlayerId) throw new Error("expected a player id");
    draft.commentatorPlayerIds = [removedPlayerId];

    const next = withEntrants(session, [session.race!.entrants[0]!]);
    const outcome = reconcileDraft({
      draft,
      session: next,
      directory: {},
      playerIdFactory: sequentialIds("r"),
    });

    expect(outcome.draft.commentatorPlayerIds).toEqual([removedPlayerId]);
    expect(outcome.draft.players[removedPlayerId]).toBeDefined();
  });

  it("resets category selection and presentation when category slug changes", () => {
    const session = baseSession();
    const draft = buildDraft(session);
    draft.categorySelection = {
      selection: {
        gameId: "g",
        gameName: "G",
        categoryId: "c",
        categoryName: "C",
        levelId: null,
        variables: {},
        platformId: null,
        regionId: null,
        emulator: null,
        timingMethod: null,
      },
      source: "manual",
      savedMappingState: "overridden",
    };
    draft.categoryPresentation = {
      title: "T",
      subtitle: null,
      ruleHeading: "R",
      ruleLines: [],
      leaderboardHeading: "L",
    };

    const next: RaceSession = {
      ...session,
      race: session.race ? { ...session.race, categorySlug: "mm" } : null,
    };
    const outcome = reconcileDraft({
      draft,
      session: next,
      directory: {},
      playerIdFactory: sequentialIds("r"),
    });

    expect(outcome.categoryChanged).toBe(true);
    expect(outcome.draft.categorySelection).toEqual({
      selection: null,
      source: null,
      savedMappingState: "none",
    });
    expect(outcome.draft.categoryPresentation).toBeNull();
  });

  it("keeps category selection when only the category name changes", () => {
    const session = baseSession();
    const draft = buildDraft(session);
    draft.categorySelection = {
      selection: null,
      source: "manual",
      savedMappingState: "matches",
    };

    const next: RaceSession = {
      ...session,
      race: session.race ? { ...session.race, categoryName: "New Name" } : null,
    };
    const outcome = reconcileDraft({
      draft,
      session: next,
      directory: {},
      playerIdFactory: sequentialIds("r"),
    });

    expect(outcome.categoryChanged).toBe(false);
    expect(outcome.draft.race?.categoryName).toBe("New Name");
    expect(outcome.draft.categorySelection).toEqual(draft.categorySelection);
    expect(outcome.draft.revision).toBe(draft.revision + 1);
  });

  it("does not change the revision when there is no relevant difference", () => {
    const session = baseSession();
    const draft = buildDraft(session);

    const outcome = reconcileDraft({
      draft,
      session,
      directory: {},
      playerIdFactory: sequentialIds("r"),
    });

    expect(outcome.changed).toBe(false);
    expect(outcome.draft.revision).toBe(draft.revision);
  });
});

describe("countUnresolvedPlayers", () => {
  it("counts players with any unresolved link once", () => {
    const session = baseSession();
    const draft = buildDraft(session);
    // New players have speedrunCom unresolved and twitch resolved/unresolved.
    expect(countUnresolvedPlayers(draft)).toBe(draft.participants.length);
  });
});
