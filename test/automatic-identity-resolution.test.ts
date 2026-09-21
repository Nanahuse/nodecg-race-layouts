import { describe, expect, it } from "vitest";

import type { PlayerDirectory } from "../src/domain";
import {
  AUTOMATIC_RESOLUTION_CONCURRENCY,
  AutomaticIdentityResolutionService,
} from "../src/extension/application/automatic-identity-resolution-service";
import { createFakeLogger } from "./support/fakes";
import { makeDraftPlayer, makeParticipantDraft } from "./support/draft-fakes";
import { FakeSpeedrunUserLookup, makeUser } from "./support/speedrun-fakes";

function setup(options: { concurrency?: number } = {}) {
  const lookup = new FakeSpeedrunUserLookup();
  const fakeLogger = createFakeLogger();
  const service = new AutomaticIdentityResolutionService({
    lookup,
    log: fakeLogger.logger,
    concurrency: options.concurrency,
  });
  return { service, lookup, fakeLogger };
}

function directory(...players: ReturnType<typeof makeUser>[]): PlayerDirectory {
  const map: PlayerDirectory = {};
  players.forEach((user, index) => {
    map[`dir-${index}`] = {
      playerId: `dir-${index}`,
      manualDisplayName: null,
      racetime: { state: "none" },
      speedrunCom: {
        state: "linked",
        value: { userId: user.userId, name: user.name, twitchLogin: user.twitchLogin },
      },
      twitch: { state: "none" },
    };
  });
  return map;
}

describe("AutomaticIdentityResolutionService", () => {
  it("links an unresolved player on an exact Twitch match", async () => {
    const { service, lookup } = setup();
    lookup.searchOutcome = { ok: true, users: [makeUser({ userId: "src-1", twitchLogin: "One" })] };
    const draft = makeParticipantDraft({
      players: {
        p1: makeDraftPlayer("p1", {
          twitch: { state: "linked", value: { userId: null, login: "one" }, source: "racetime" },
        }),
      },
    });

    const result = await service.resolve(draft, {});

    expect(result.summary.linked).toBe(1);
    expect(result.draft.players["p1"]?.speedrunCom).toEqual({
      state: "linked",
      value: { userId: "src-1", name: "chewdiggy", twitchLogin: "One" },
      source: "auto",
    });
  });

  it("keeps unresolved when there are no candidates", async () => {
    const { service, lookup } = setup();
    lookup.searchOutcome = { ok: true, users: [] };
    const draft = makeParticipantDraft({
      players: {
        p1: makeDraftPlayer("p1", {
          twitch: { state: "linked", value: { userId: null, login: "one" }, source: "racetime" },
        }),
      },
    });

    const result = await service.resolve(draft, {});
    expect(result.summary.unresolved).toBe(1);
    expect(result.draft.players["p1"]?.speedrunCom.state).toBe("unresolved");
  });

  it("keeps unresolved when multiple exact candidates exist", async () => {
    const { service, lookup } = setup();
    lookup.searchOutcome = {
      ok: true,
      users: [
        makeUser({ userId: "a", twitchLogin: "one" }),
        makeUser({ userId: "b", twitchLogin: "ONE" }),
      ],
    };
    const draft = makeParticipantDraft({
      players: {
        p1: makeDraftPlayer("p1", {
          twitch: { state: "linked", value: { userId: null, login: "one" }, source: "racetime" },
        }),
      },
    });

    const result = await service.resolve(draft, {});
    expect(result.summary.ambiguous).toBe(1);
    expect(result.draft.players["p1"]?.speedrunCom.state).toBe("unresolved");
  });

  it("matches Twitch logins case-insensitively", async () => {
    const { service, lookup } = setup();
    lookup.searchOutcome = {
      ok: true,
      users: [makeUser({ userId: "src-1", twitchLogin: "nanahuse" })],
    };
    const draft = makeParticipantDraft({
      players: {
        p1: makeDraftPlayer("p1", {
          twitch: {
            state: "linked",
            value: { userId: null, login: "Nanahuse" },
            source: "racetime",
          },
        }),
      },
    });

    const result = await service.resolve(draft, {});
    expect(result.draft.players["p1"]?.speedrunCom.state).toBe("linked");
  });

  it("keeps unresolved on a Speedrun.com failure", async () => {
    const { service, lookup } = setup();
    lookup.searchOutcome = { ok: false, reason: "network_error", message: "down" };
    const draft = makeParticipantDraft({
      players: {
        p1: makeDraftPlayer("p1", {
          twitch: { state: "linked", value: { userId: null, login: "one" }, source: "racetime" },
        }),
      },
    });

    const result = await service.resolve(draft, {});
    expect(result.summary.failed).toBe(1);
    expect(result.draft.players["p1"]?.speedrunCom.state).toBe("unresolved");
  });

  it("stops starting new lookups after a 429", async () => {
    const { service, lookup } = setup({ concurrency: 1 });
    lookup.searchOutcome = { ok: false, reason: "rate_limited", message: "slow down" };
    const draft = makeParticipantDraft({
      players: {
        p1: makeDraftPlayer("p1", {
          twitch: { state: "linked", value: { userId: null, login: "one" }, source: "racetime" },
        }),
        p2: makeDraftPlayer("p2", {
          twitch: { state: "linked", value: { userId: null, login: "two" }, source: "racetime" },
        }),
      },
    });

    const result = await service.resolve(draft, {});
    expect(result.summary.rateLimited).toBe(true);
    expect(lookup.searchCalls).toHaveLength(1);
  });

  it("completes Twitch from RaceTime metadata before lookup", async () => {
    const { service, lookup } = setup();
    lookup.searchOutcome = {
      ok: true,
      users: [makeUser({ userId: "src-1", twitchLogin: "rt_login" })],
    };
    const draft = makeParticipantDraft({
      players: {
        p1: makeDraftPlayer("p1", {
          racetime: {
            state: "linked",
            value: { userId: "rt-p1", name: "One", twitchLogin: "rt_login" },
            source: "racetime",
          },
          twitch: { state: "unresolved" },
        }),
      },
    });

    const result = await service.resolve(draft, {});
    expect(lookup.searchCalls).toEqual(["rt_login"]);
    expect(result.draft.players["p1"]?.twitch).toMatchObject({
      state: "linked",
      source: "racetime",
    });
    expect(result.draft.players["p1"]?.speedrunCom.state).toBe("linked");
  });

  it("never changes confirmed linked / none identities", async () => {
    const { service, lookup } = setup();
    const draft = makeParticipantDraft({
      players: {
        p1: makeDraftPlayer("p1", {
          speedrunCom: {
            state: "linked",
            value: { userId: "src-1", name: "One", twitchLogin: null },
            source: "manual",
          },
        }),
        p2: makeDraftPlayer("p2", {
          speedrunCom: { state: "none", source: "manual" },
          twitch: { state: "none", source: "manual" },
        }),
      },
    });

    const result = await service.resolve(draft, {});
    expect(result.draft.players["p1"]?.speedrunCom.state).toBe("linked");
    expect(result.draft.players["p2"]?.speedrunCom.state).toBe("none");
    expect(result.draft.players["p2"]?.twitch.state).toBe("none");
    expect(lookup.searchCalls).toHaveLength(0);
  });

  it("does not link when another draft player already uses the SRC user", async () => {
    const { service, lookup } = setup();
    lookup.searchOutcome = { ok: true, users: [makeUser({ userId: "src-1", twitchLogin: "one" })] };
    const draft = makeParticipantDraft({
      players: {
        p1: makeDraftPlayer("p1", {
          twitch: { state: "linked", value: { userId: null, login: "one" }, source: "racetime" },
        }),
        p2: makeDraftPlayer("p2", {
          speedrunCom: {
            state: "linked",
            value: { userId: "src-1", name: "Other", twitchLogin: null },
            source: "manual",
          },
        }),
      },
    });

    const result = await service.resolve(draft, {});
    expect(result.summary.conflicted).toBe(1);
    expect(result.draft.players["p1"]?.speedrunCom.state).toBe("unresolved");
  });

  it("does not link when a directory player owns the SRC user", async () => {
    const { service, lookup } = setup();
    lookup.searchOutcome = { ok: true, users: [makeUser({ userId: "src-1", twitchLogin: "one" })] };
    const draft = makeParticipantDraft({
      players: {
        p1: makeDraftPlayer("p1", {
          twitch: { state: "linked", value: { userId: null, login: "one" }, source: "racetime" },
        }),
      },
    });

    const result = await service.resolve(
      draft,
      directory(makeUser({ userId: "src-1", name: "Persistent", twitchLogin: "one" })),
    );
    expect(result.summary.conflicted).toBe(1);
    expect(result.draft.players["p1"]?.speedrunCom.state).toBe("unresolved");
  });

  it("bounds concurrency", async () => {
    const { service, lookup } = setup();
    lookup.searchHandler = async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
      return { ok: true, users: [] };
    };
    const players = Object.fromEntries(
      [1, 2, 3, 4, 5, 6].map((index) => [
        `p${index}`,
        makeDraftPlayer(`p${index}`, {
          twitch: {
            state: "linked",
            value: { userId: null, login: `login-${index}` },
            source: "racetime",
          },
        }),
      ]),
    );
    const draft = makeParticipantDraft({ players });

    await service.resolve(draft, {});

    expect(lookup.maxActive).toBeLessThanOrEqual(AUTOMATIC_RESOLUTION_CONCURRENCY);
  });
});
