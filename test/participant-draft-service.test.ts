import { describe, expect, it } from "vitest";

import type {
  DraftConfig,
  DraftSpeedrunSnapshot,
  IntegrationStatus,
  PlayerDirectory,
  PlayerMapping,
} from "../src/domain";
import { leaderboardKeyFromSelection } from "../src/domain";
import { ParticipantDraftService } from "../src/extension/application/participant-draft-service";
import {
  createDefaultDraftSpeedrunSnapshot,
  createDefaultIntegrationStatus,
} from "../src/replicants/defaults";
import { makeDraftPlayer, makeParticipantDraft } from "./support/draft-fakes";
import { createFakeLogger, TrackingReplicant } from "./support/fakes";
import { FakeSpeedrunUserLookup, deferred, makeUser } from "./support/speedrun-fakes";

const REVISION = 10;

function makeDirectoryPlayer(
  playerId: string,
  overrides: Partial<PlayerMapping> = {},
): PlayerMapping {
  return {
    playerId,
    manualDisplayName: null,
    racetime: { state: "none" },
    speedrunCom: { state: "none" },
    twitch: { state: "none" },
    ...overrides,
  };
}

function baseDraft(players: Record<string, ReturnType<typeof makeDraftPlayer>>): DraftConfig {
  return makeParticipantDraft({ players, revision: REVISION });
}

function setup(
  options: {
    draft?: DraftConfig;
    directory?: PlayerDirectory;
    lookup?: FakeSpeedrunUserLookup;
  } = {},
) {
  const draft = options.draft ?? baseDraft({ p1: makeDraftPlayer("p1") });
  const integrationStatus = new TrackingReplicant<IntegrationStatus>(
    "integration-status",
    createDefaultIntegrationStatus(),
    [],
  );
  const draftConfig = new TrackingReplicant<DraftConfig>("draft-config", draft, []);
  const draftSpeedrunSnapshot = new TrackingReplicant<DraftSpeedrunSnapshot>(
    "draft-speedrun-snapshot",
    createDefaultDraftSpeedrunSnapshot(),
    [],
  );
  const playerDirectory = new TrackingReplicant<PlayerDirectory>(
    "player-directory",
    options.directory ?? {},
    [],
  );
  const lookup = options.lookup ?? new FakeSpeedrunUserLookup();
  const fakeLogger = createFakeLogger();
  const service = new ParticipantDraftService({
    draftConfig,
    draftSpeedrunSnapshot,
    playerDirectory,
    integrationStatus,
    lookup,
    log: fakeLogger.logger,
  });
  return {
    service,
    draftConfig,
    draftSpeedrunSnapshot,
    playerDirectory,
    integrationStatus,
    lookup,
    fakeLogger,
  };
}

function readySnapshot(draft: DraftConfig): DraftSpeedrunSnapshot {
  const selection = draft.categorySelection.selection;
  if (!selection) throw new Error("draft has no selection");
  return {
    draftRevision: draft.revision,
    state: "ready",
    snapshot: {
      snapshotId: "s1",
      fetchedAt: "2026-09-21T05:30:00.000Z",
      leaderboardKey: leaderboardKeyFromSelection(selection),
      worldRecord: null,
      leaderboard: [],
      personalBests: {},
    },
    message: null,
  };
}

describe("ParticipantDraftService.setPlayer", () => {
  it("reassigns to a persistent player and carries its identities", async () => {
    const directoryPlayer = makeDirectoryPlayer("p2", {
      speedrunCom: {
        state: "linked",
        value: { userId: "src-2", name: "Two", twitchLogin: "two" },
      },
      twitch: { state: "linked", value: { userId: null, login: "two" } },
    });
    const { service, draftConfig, draftSpeedrunSnapshot } = setup({
      directory: { p2: directoryPlayer },
    });

    const result = await service.setPlayer(REVISION, "rt-p1", "p2");

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.draftRevision).toBe(11);
    expect(draftConfig.value.participants[0]?.playerId).toBe("p2");
    expect(draftConfig.value.players["p2"]?.speedrunCom.state).toBe("linked");
    expect(draftConfig.value.players["p2"]?.racetime).toMatchObject({
      state: "linked",
      source: "manual",
    });
    expect(draftConfig.value.players["p1"]).toBeUndefined();
    expect(draftSpeedrunSnapshot.value.state).toBe("empty");
  });

  it("rejects an unknown player", async () => {
    const { service } = setup();
    const result = await service.setPlayer(REVISION, "rt-p1", "ghost");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("player_not_found");
  });

  it("rejects a player used by another participant", async () => {
    const { service } = setup({
      draft: baseDraft({
        p1: makeDraftPlayer("p1"),
        p2: makeDraftPlayer("p2"),
      }),
    });
    const result = await service.setPlayer(REVISION, "rt-p1", "p2");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("player_in_use");
  });

  it("rejects a persistent RaceTime conflict", async () => {
    const directoryPlayer = makeDirectoryPlayer("p2", {
      racetime: {
        state: "linked",
        value: { userId: "rt-other", name: "Other", twitchLogin: null },
      },
    });
    const { service } = setup({ directory: { p2: directoryPlayer } });
    const result = await service.setPlayer(REVISION, "rt-p1", "p2");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("racetime_conflict");
  });

  it("preserves operator edits on an existing draft target player", async () => {
    const { service, draftConfig } = setup({
      draft: baseDraft({
        p1: makeDraftPlayer("p1"),
        p2: makeDraftPlayer("p2", { manualDisplayName: "Edited" }),
      }),
    });
    await service.setPlayer(REVISION, "rt-p1", "p2");
    expect(draftConfig.value.players["p2"]?.manualDisplayName).toBe("Edited");
  });

  it("keeps a temporary player referenced by a commentator", async () => {
    const draft = baseDraft({ p1: makeDraftPlayer("p1") });
    draft.commentatorPlayerIds = ["p1"];
    const { service, draftConfig } = setup({ draft });
    await service.setPlayer(REVISION, "rt-p1", "p2");
    expect(draftConfig.value.players["p1"]).toBeDefined();
  });
});

describe("ParticipantDraftService.setSpeedrunCom", () => {
  it("links a Speedrun.com user from the server lookup", async () => {
    const lookup = new FakeSpeedrunUserLookup();
    lookup.userOutcome = {
      ok: true,
      user: makeUser({ userId: "src-9", name: "Nine", twitchLogin: "nine" }),
    };
    const { service, draftConfig, draftSpeedrunSnapshot } = setup({ lookup });

    const result = await service.setSpeedrunCom(REVISION, "rt-p1", "src-9");

    expect(result.ok).toBe(true);
    expect(draftConfig.value.players["p1"]?.speedrunCom).toEqual({
      state: "linked",
      value: { userId: "src-9", name: "Nine", twitchLogin: "nine" },
      source: "manual",
    });
    expect(draftConfig.value.players["p1"]?.twitch).toMatchObject({
      state: "linked",
      source: "speedruncom",
    });
    expect(draftSpeedrunSnapshot.value.state).toBe("empty");
  });

  it("maps a 404 to speedrun_user_not_found", async () => {
    const lookup = new FakeSpeedrunUserLookup();
    lookup.userOutcome = { ok: false, reason: "not_found", message: "nope" };
    const { service } = setup({ lookup });
    const result = await service.setSpeedrunCom(REVISION, "rt-p1", "src-9");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("speedrun_user_not_found");
  });

  it("maps other failures to speedrun_lookup_failed", async () => {
    const lookup = new FakeSpeedrunUserLookup();
    lookup.userOutcome = { ok: false, reason: "timeout", message: "slow" };
    const { service } = setup({ lookup });
    const result = await service.setSpeedrunCom(REVISION, "rt-p1", "src-9");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("speedrun_lookup_failed");
  });

  it("does not commit when the draft changed during the lookup", async () => {
    const lookup = new FakeSpeedrunUserLookup();
    const pending = deferred<{ ok: true; user: ReturnType<typeof makeUser> }>();
    lookup.userHandler = () => pending.promise;
    const { service, draftConfig } = setup({ lookup });

    const promise = service.setSpeedrunCom(REVISION, "rt-p1", "src-9");
    draftConfig.value = { ...draftConfig.value, revision: 11 };
    pending.resolve({ ok: true, user: makeUser({ userId: "src-9" }) });
    const result = await promise;

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("draft_changed");
  });

  it("rejects a draft identity conflict", async () => {
    const lookup = new FakeSpeedrunUserLookup();
    lookup.userOutcome = { ok: true, user: makeUser({ userId: "src-9" }) };
    const { service } = setup({
      lookup,
      draft: baseDraft({
        p1: makeDraftPlayer("p1"),
        p2: makeDraftPlayer("p2", {
          speedrunCom: {
            state: "linked",
            value: { userId: "src-9", name: "Other", twitchLogin: null },
            source: "manual",
          },
        }),
      }),
    });
    const result = await service.setSpeedrunCom(REVISION, "rt-p1", "src-9");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("identity_conflict");
  });

  it("rejects a directory identity conflict", async () => {
    const lookup = new FakeSpeedrunUserLookup();
    lookup.userOutcome = { ok: true, user: makeUser({ userId: "src-9" }) };
    const { service } = setup({
      lookup,
      directory: {
        "dir-1": makeDirectoryPlayer("dir-1", {
          speedrunCom: {
            state: "linked",
            value: { userId: "src-9", name: "Persistent", twitchLogin: null },
          },
        }),
      },
    });
    const result = await service.setSpeedrunCom(REVISION, "rt-p1", "src-9");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("identity_conflict");
  });

  it("retags when the same SRC user id only changes metadata", async () => {
    const lookup = new FakeSpeedrunUserLookup();
    lookup.userOutcome = {
      ok: true,
      user: makeUser({ userId: "src-9", name: "New Name", twitchLogin: null }),
    };
    const draft = baseDraft({
      p1: makeDraftPlayer("p1", {
        speedrunCom: {
          state: "linked",
          value: { userId: "src-9", name: "Old Name", twitchLogin: null },
          source: "manual",
        },
      }),
    });
    const { service, draftSpeedrunSnapshot, draftConfig } = setup({ draft, lookup });
    draftSpeedrunSnapshot.value = readySnapshot(draft);

    const result = await service.setSpeedrunCom(REVISION, "rt-p1", "src-9");

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.draftRevision).toBe(11);
    expect(draftConfig.value.players["p1"]?.speedrunCom).toMatchObject({
      value: { name: "New Name" },
    });
    expect(draftSpeedrunSnapshot.value.state).toBe("ready");
    expect(draftSpeedrunSnapshot.value.draftRevision).toBe(11);
  });
});

describe("ParticipantDraftService derived Twitch", () => {
  it("updates a speedruncom-derived Twitch to the new SRC login", async () => {
    const lookup = new FakeSpeedrunUserLookup();
    lookup.userOutcome = {
      ok: true,
      user: makeUser({ userId: "src-9", twitchLogin: "new_login" }),
    };
    const draft = baseDraft({
      p1: makeDraftPlayer("p1", {
        speedrunCom: {
          state: "linked",
          value: { userId: "src-1", name: "Old", twitchLogin: "old_login" },
          source: "manual",
        },
        twitch: {
          state: "linked",
          value: { userId: null, login: "old_login" },
          source: "speedruncom",
        },
      }),
    });
    const { service, draftConfig } = setup({ draft, lookup });

    await service.setSpeedrunCom(REVISION, "rt-p1", "src-9");

    expect(draftConfig.value.players["p1"]?.twitch).toEqual({
      state: "linked",
      value: { userId: null, login: "new_login" },
      source: "speedruncom",
    });
  });

  it("clears a derived Twitch when the new SRC has none", async () => {
    const lookup = new FakeSpeedrunUserLookup();
    lookup.userOutcome = { ok: true, user: makeUser({ userId: "src-9", twitchLogin: null }) };
    const draft = baseDraft({
      p1: makeDraftPlayer("p1", {
        twitch: {
          state: "linked",
          value: { userId: null, login: "old_login" },
          source: "speedruncom",
        },
      }),
    });
    const { service, draftConfig } = setup({ draft, lookup });

    await service.setSpeedrunCom(REVISION, "rt-p1", "src-9");
    expect(draftConfig.value.players["p1"]?.twitch).toEqual({ state: "unresolved" });
  });

  it("keeps a manual Twitch when linking SRC", async () => {
    const lookup = new FakeSpeedrunUserLookup();
    lookup.userOutcome = {
      ok: true,
      user: makeUser({ userId: "src-9", twitchLogin: "src_login" }),
    };
    const draft = baseDraft({
      p1: makeDraftPlayer("p1", {
        twitch: {
          state: "linked",
          value: { userId: null, login: "manual_login" },
          source: "manual",
        },
      }),
    });
    const { service, draftConfig } = setup({ draft, lookup });

    await service.setSpeedrunCom(REVISION, "rt-p1", "src-9");
    expect(draftConfig.value.players["p1"]?.twitch).toMatchObject({
      value: { login: "manual_login" },
      source: "manual",
    });
  });
});

describe("ParticipantDraftService.setSpeedrunComNone", () => {
  it("sets none and clears a derived Twitch", async () => {
    const draft = baseDraft({
      p1: makeDraftPlayer("p1", {
        speedrunCom: {
          state: "linked",
          value: { userId: "src-1", name: "One", twitchLogin: "one" },
          source: "manual",
        },
        twitch: { state: "linked", value: { userId: null, login: "one" }, source: "speedruncom" },
      }),
    });
    const { service, draftConfig, draftSpeedrunSnapshot } = setup({ draft });
    draftSpeedrunSnapshot.value = readySnapshot(draft);

    const result = await service.setSpeedrunComNone(REVISION, "rt-p1");

    expect(result.ok).toBe(true);
    expect(draftConfig.value.players["p1"]?.speedrunCom).toEqual({
      state: "none",
      source: "manual",
    });
    expect(draftConfig.value.players["p1"]?.twitch).toEqual({ state: "unresolved" });
    expect(draftSpeedrunSnapshot.value.state).toBe("empty");
  });

  it("is a no-op when already none", async () => {
    const draft = baseDraft({
      p1: makeDraftPlayer("p1", { speedrunCom: { state: "none", source: "manual" } }),
    });
    const { service } = setup({ draft });
    const result = await service.setSpeedrunComNone(REVISION, "rt-p1");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.changed).toBe(false);
  });
});

describe("ParticipantDraftService.setTwitch / setTwitchNone", () => {
  it("sets a manual Twitch login and trims it", async () => {
    const { service, draftConfig } = setup();
    const result = await service.setTwitch(REVISION, "rt-p1", "  login  ");
    expect(result.ok).toBe(true);
    expect(draftConfig.value.players["p1"]?.twitch).toEqual({
      state: "linked",
      value: { userId: null, login: "login" },
      source: "manual",
    });
  });

  it("rejects an empty Twitch login", async () => {
    const { service } = setup();
    const result = await service.setTwitch(REVISION, "rt-p1", "   ");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("invalid_twitch_login");
  });

  it("rejects a duplicate draft Twitch login", async () => {
    const { service } = setup({
      draft: baseDraft({
        p1: makeDraftPlayer("p1"),
        p2: makeDraftPlayer("p2", {
          twitch: { state: "linked", value: { userId: null, login: "taken" }, source: "manual" },
        }),
      }),
    });
    const result = await service.setTwitch(REVISION, "rt-p1", "TAKEN");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("identity_conflict");
  });

  it("does not change SRC when setting Twitch", async () => {
    const draft = baseDraft({
      p1: makeDraftPlayer("p1", {
        speedrunCom: {
          state: "linked",
          value: { userId: "src-1", name: "One", twitchLogin: null },
          source: "manual",
        },
      }),
    });
    const { service, draftConfig } = setup({ draft });
    await service.setTwitch(REVISION, "rt-p1", "login");
    expect(draftConfig.value.players["p1"]?.speedrunCom.state).toBe("linked");
  });

  it("sets Twitch none and retags the snapshot", async () => {
    const draft = baseDraft({ p1: makeDraftPlayer("p1") });
    const { service, draftConfig, draftSpeedrunSnapshot } = setup({ draft });
    draftSpeedrunSnapshot.value = readySnapshot(draft);

    const result = await service.setTwitchNone(REVISION, "rt-p1");

    expect(result.ok).toBe(true);
    expect(draftConfig.value.players["p1"]?.twitch).toEqual({ state: "none", source: "manual" });
    expect(draftSpeedrunSnapshot.value.state).toBe("ready");
    expect(draftSpeedrunSnapshot.value.draftRevision).toBe(11);
  });
});

describe("ParticipantDraftService.setDisplayName", () => {
  it("sets, trims and clears the manual display name", async () => {
    const { service, draftConfig } = setup();

    await service.setDisplayName(REVISION, "rt-p1", "  Name  ");
    expect(draftConfig.value.players["p1"]?.manualDisplayName).toBe("Name");

    await service.setDisplayName(draftConfig.value.revision, "rt-p1", "   ");
    expect(draftConfig.value.players["p1"]?.manualDisplayName).toBeNull();

    await service.setDisplayName(draftConfig.value.revision, "rt-p1", null);
    expect(draftConfig.value.players["p1"]?.manualDisplayName).toBeNull();
  });

  it("is a no-op for the same value", async () => {
    const draft = baseDraft({
      p1: makeDraftPlayer("p1", { manualDisplayName: "Same" }),
    });
    const { service } = setup({ draft });
    const result = await service.setDisplayName(REVISION, "rt-p1", "Same");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.changed).toBe(false);
  });
});

describe("ParticipantDraftService broadcast transitions", () => {
  it("keeps a ready snapshot and broadcast ready on a display-name change", async () => {
    const draft = baseDraft({
      p1: makeDraftPlayer("p1", {
        speedrunCom: {
          state: "linked",
          value: { userId: "src-1", name: "One", twitchLogin: null },
          source: "manual",
        },
        twitch: { state: "none", source: "manual" },
      }),
    });
    const { service, draftSpeedrunSnapshot, integrationStatus } = setup({ draft });
    draftSpeedrunSnapshot.value = readySnapshot(draft);
    integrationStatus.value = {
      ...integrationStatus.value,
      broadcast: { ...integrationStatus.value.broadcast, state: "ready", draftRevision: REVISION },
    };

    await service.setDisplayName(REVISION, "rt-p1", "Name");

    expect(draftSpeedrunSnapshot.value.state).toBe("ready");
    expect(draftSpeedrunSnapshot.value.draftRevision).toBe(11);
    expect(integrationStatus.value.broadcast.state).toBe("ready");
  });

  it("moves from resolution_required to dirty once identities resolve", async () => {
    const draft = baseDraft({
      p1: makeDraftPlayer("p1", { twitch: { state: "none", source: "manual" } }),
    });
    const { service, integrationStatus } = setup({ draft });
    integrationStatus.value = {
      ...integrationStatus.value,
      broadcast: { ...integrationStatus.value.broadcast, state: "resolution_required" },
    };

    await service.setSpeedrunComNone(REVISION, "rt-p1");

    expect(integrationStatus.value.broadcast.state).toBe("dirty");
  });

  it("preserves reconciliation_required", async () => {
    const { service, integrationStatus } = setup();
    integrationStatus.value = {
      ...integrationStatus.value,
      broadcast: { ...integrationStatus.value.broadcast, state: "reconciliation_required" },
    };

    await service.setDisplayName(REVISION, "rt-p1", "Name");

    expect(integrationStatus.value.broadcast.state).toBe("reconciliation_required");
  });
});
