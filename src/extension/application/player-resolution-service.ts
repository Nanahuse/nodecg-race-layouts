import { randomUUID } from "node:crypto";

import type {
  DraftPlayer,
  DraftRaceParticipant,
  DraftRaceTimeAccountLink,
  LinkSource,
  PlayerDirectory,
  PlayerId,
  PlayerMapping,
  RaceTimeEntrant,
} from "../../domain";

export type PlayerIdFactory = () => PlayerId;

export function createRandomPlayerIdFactory(): PlayerIdFactory {
  return () => randomUUID();
}

export type PlayerResolutionMatchKind = "racetime_id" | "twitch" | "new";

export type ResolvedEntrant = {
  entrant: RaceTimeEntrant;
  playerId: PlayerId;
  player: DraftPlayer;
  matchedBy: PlayerResolutionMatchKind;
};

export type PlayerResolutionIssueCode = "ambiguous_twitch_match";

export type PlayerResolutionIssue = {
  code: PlayerResolutionIssueCode;
  racetimeUserId: string;
  message: string;
};

export type PlayerResolutionSummary = {
  /** Entrants matched to an existing directory player. */
  matchedCount: number;
  /** Entrants matched via an exact, unambiguous Twitch login. */
  autoLinkedCount: number;
  /** Entrants that required a new draft player. */
  newPlayerCount: number;
};

export type ResolveEntrantsInput = {
  entrants: readonly RaceTimeEntrant[];
  directory: PlayerDirectory;
  /** Player ids already in use (e.g. kept participants during reconcile). */
  usedPlayerIds?: ReadonlySet<PlayerId>;
  playerIdFactory: PlayerIdFactory;
};

export type ResolveEntrantsResult = {
  resolved: ResolvedEntrant[];
  issues: PlayerResolutionIssue[];
  summary: PlayerResolutionSummary;
};

export type PlayerResolutionResult = {
  participants: DraftRaceParticipant[];
  players: Record<PlayerId, DraftPlayer>;
  issues: PlayerResolutionIssue[];
  summary: PlayerResolutionSummary;
};

export type PlayerResolutionErrorCode = "duplicate_racetime_user_id" | "player_id_collision";

export class PlayerResolutionError extends Error {
  readonly code: PlayerResolutionErrorCode;

  constructor(code: PlayerResolutionErrorCode, message: string) {
    super(message);
    this.name = "PlayerResolutionError";
    this.code = code;
  }
}

function linkedRaceTime(entrant: RaceTimeEntrant, source: LinkSource): DraftRaceTimeAccountLink {
  return {
    state: "linked",
    value: {
      userId: entrant.userId,
      name: entrant.name,
      twitchLogin: entrant.twitchLogin,
    },
    source,
  };
}

/** Convert a persistent player mapping into a draft player. */
export function playerMappingToDraftPlayer(
  mapping: PlayerMapping,
  racetime: DraftRaceTimeAccountLink,
): DraftPlayer {
  return {
    playerId: mapping.playerId,
    manualDisplayName: mapping.manualDisplayName,
    racetime,
    speedrunCom:
      mapping.speedrunCom.state === "linked"
        ? { state: "linked", value: mapping.speedrunCom.value, source: "spreadsheet" }
        : { state: "none", source: "spreadsheet" },
    twitch:
      mapping.twitch.state === "linked"
        ? { state: "linked", value: mapping.twitch.value, source: "spreadsheet" }
        : { state: "none", source: "spreadsheet" },
  };
}

function createNewDraftPlayer(
  playerId: PlayerId,
  entrant: RaceTimeEntrant,
  twitchLogin: string | null,
): DraftPlayer {
  const login = twitchLogin?.trim() ?? "";
  return {
    playerId,
    manualDisplayName: null,
    racetime: linkedRaceTime(entrant, "racetime"),
    speedrunCom: { state: "unresolved" },
    twitch:
      login !== ""
        ? { state: "linked", value: { userId: null, login }, source: "racetime" }
        : { state: "unresolved" },
  };
}

function buildRaceTimeIndex(directory: PlayerDirectory): Map<string, PlayerMapping> {
  const index = new Map<string, PlayerMapping>();
  for (const mapping of Object.values(directory)) {
    if (mapping.racetime.state !== "linked") {
      continue;
    }
    const userId = mapping.racetime.value.userId;
    if (userId === "") {
      continue;
    }
    const existing = index.get(userId);
    if (existing) {
      throw new PlayerResolutionError(
        "duplicate_racetime_user_id",
        `RaceTime user id "${userId}" is linked to both "${existing.playerId}" and "${mapping.playerId}".`,
      );
    }
    index.set(userId, mapping);
  }
  return index;
}

/**
 * Index directory players by Twitch login (case-insensitive). A player is a
 * candidate if either their Twitch link or their Speedrun.com `twitchLogin`
 * matches. No fuzzy or display-name matching is performed.
 */
function buildTwitchIndex(directory: PlayerDirectory): Map<string, PlayerMapping[]> {
  const index = new Map<string, PlayerMapping[]>();

  const add = (login: string, mapping: PlayerMapping): void => {
    const key = login.trim().toLowerCase();
    if (key === "") {
      return;
    }
    const candidates = index.get(key) ?? [];
    if (!candidates.some((candidate) => candidate.playerId === mapping.playerId)) {
      candidates.push(mapping);
    }
    index.set(key, candidates);
  };

  for (const mapping of Object.values(directory)) {
    if (mapping.twitch.state === "linked") {
      add(mapping.twitch.value.login, mapping);
    }
    if (mapping.speedrunCom.state === "linked" && mapping.speedrunCom.value.twitchLogin !== null) {
      add(mapping.speedrunCom.value.twitchLogin, mapping);
    }
  }

  return index;
}

function allocatePlayerId(
  factory: PlayerIdFactory,
  usedPlayerIds: ReadonlySet<PlayerId>,
): PlayerId {
  const playerId = factory();
  if (typeof playerId !== "string" || playerId.trim() === "") {
    throw new PlayerResolutionError(
      "player_id_collision",
      "Player ID factory returned an empty id.",
    );
  }
  if (usedPlayerIds.has(playerId)) {
    throw new PlayerResolutionError(
      "player_id_collision",
      `Player ID "${playerId}" is already in use.`,
    );
  }
  return playerId;
}

/**
 * Resolve RaceTime entrants to draft players. Pure: the only external input is
 * the injected `playerIdFactory`.
 */
export function resolveEntrants(input: ResolveEntrantsInput): ResolveEntrantsResult {
  const raceTimeIndex = buildRaceTimeIndex(input.directory);
  const twitchIndex = buildTwitchIndex(input.directory);
  const usedPlayerIds = new Set<PlayerId>(input.usedPlayerIds ?? []);

  const resolved: ResolvedEntrant[] = [];
  const issues: PlayerResolutionIssue[] = [];
  let matchedCount = 0;
  let autoLinkedCount = 0;
  let newPlayerCount = 0;

  for (const entrant of input.entrants) {
    // 1. RaceTime user id exact match (highest priority).
    const byRaceTimeId = raceTimeIndex.get(entrant.userId);
    if (byRaceTimeId) {
      if (usedPlayerIds.has(byRaceTimeId.playerId)) {
        throw new PlayerResolutionError(
          "duplicate_racetime_user_id",
          `RaceTime user "${entrant.userId}" is already used by player "${byRaceTimeId.playerId}".`,
        );
      }
      usedPlayerIds.add(byRaceTimeId.playerId);
      resolved.push({
        entrant,
        playerId: byRaceTimeId.playerId,
        player: playerMappingToDraftPlayer(byRaceTimeId, linkedRaceTime(entrant, "racetime")),
        matchedBy: "racetime_id",
      });
      matchedCount += 1;
      continue;
    }

    // 2. Twitch login exact (case-insensitive) match, only if unambiguous.
    const twitchLogin = entrant.twitchLogin;
    if (twitchLogin !== null && twitchLogin.trim() !== "") {
      const key = twitchLogin.trim().toLowerCase();
      const candidates = (twitchIndex.get(key) ?? []).filter((candidate) => {
        if (usedPlayerIds.has(candidate.playerId)) {
          return false;
        }
        // Never re-link a player who is already linked to a different RaceTime id.
        if (
          candidate.racetime.state === "linked" &&
          candidate.racetime.value.userId !== entrant.userId
        ) {
          return false;
        }
        return true;
      });

      if (candidates.length === 1) {
        const candidate = candidates[0];
        if (candidate) {
          usedPlayerIds.add(candidate.playerId);
          resolved.push({
            entrant,
            playerId: candidate.playerId,
            player: playerMappingToDraftPlayer(candidate, linkedRaceTime(entrant, "auto")),
            matchedBy: "twitch",
          });
          matchedCount += 1;
          autoLinkedCount += 1;
          continue;
        }
      }

      if (candidates.length > 1) {
        issues.push({
          code: "ambiguous_twitch_match",
          racetimeUserId: entrant.userId,
          message: `Twitch login "${twitchLogin}" matches multiple players; creating a new player with an unresolved Twitch link.`,
        });
        const playerId = allocatePlayerId(input.playerIdFactory, usedPlayerIds);
        usedPlayerIds.add(playerId);
        const player = createNewDraftPlayer(playerId, entrant, null);
        resolved.push({ entrant, playerId, player, matchedBy: "new" });
        newPlayerCount += 1;
        continue;
      }
    }

    // 3. New draft player.
    const playerId = allocatePlayerId(input.playerIdFactory, usedPlayerIds);
    usedPlayerIds.add(playerId);
    const player = createNewDraftPlayer(playerId, entrant, twitchLogin);
    resolved.push({ entrant, playerId, player, matchedBy: "new" });
    newPlayerCount += 1;
  }

  return {
    resolved,
    issues,
    summary: { matchedCount, autoLinkedCount, newPlayerCount },
  };
}

/** Resolve entrants and assemble the draft participants/players structures. */
export function resolvePlayers(input: ResolveEntrantsInput): PlayerResolutionResult {
  const result = resolveEntrants(input);

  const players: Record<PlayerId, DraftPlayer> = {};
  const participants: DraftRaceParticipant[] = [];
  for (const entry of result.resolved) {
    players[entry.playerId] = entry.player;
    participants.push({ racetimeUserId: entry.entrant.userId, playerId: entry.playerId });
  }

  return { participants, players, issues: result.issues, summary: result.summary };
}
