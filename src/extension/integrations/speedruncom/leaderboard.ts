import type { LeaderboardKey, TimingMethod } from "../../../domain";
import type { QueryValue } from "./url";

export type SpeedrunLeaderboardPlayer = {
  userId: string | null;
  name: string;
};

export type SpeedrunLeaderboardEntry = {
  place: number;
  players: SpeedrunLeaderboardPlayer[];
  timeSeconds: number;
  formattedTime: string;
};

export type SpeedrunLeaderboard = {
  gameId: string;
  categoryId: string;
  levelId: string | null;

  platformId: string | null;
  regionId: string | null;
  emulator: boolean | null;
  timingMethod: TimingMethod | null;

  variables: Record<string, string>;

  entries: SpeedrunLeaderboardEntry[];
};

export type SpeedrunRunTimes = {
  primarySeconds: number;
  realtimeSeconds: number | null;
  realtimeNoLoadsSeconds: number | null;
  ingameSeconds: number | null;
};

export type SpeedrunPersonalBestEntry = {
  place: number | null;

  gameId: string;
  categoryId: string;
  levelId: string | null;
  variables: Record<string, string>;
  platformId: string | null;
  regionId: string | null;
  emulator: boolean | null;

  times: SpeedrunRunTimes;
};

const TIMING_METHODS: readonly TimingMethod[] = ["realtime", "realtime_noloads", "ingame"];

export function isTimingMethod(value: string): value is TimingMethod {
  return (TIMING_METHODS as readonly string[]).includes(value);
}

function stableVariables(variables: Record<string, string>): string {
  return JSON.stringify(Object.entries(variables).sort(([a], [b]) => a.localeCompare(b)));
}

/**
 * Verify that a leaderboard response echoes the requested conditions. When the
 * request did not pin a timing method, the response's default timing is
 * accepted as-is.
 */
export function leaderboardMatchesKey(
  leaderboard: SpeedrunLeaderboard,
  key: LeaderboardKey,
): boolean {
  return (
    leaderboard.gameId === key.gameId &&
    leaderboard.categoryId === key.categoryId &&
    leaderboard.levelId === key.levelId &&
    leaderboard.platformId === key.platformId &&
    leaderboard.regionId === key.regionId &&
    leaderboard.emulator === key.emulator &&
    stableVariables(leaderboard.variables) === stableVariables(key.variables) &&
    (key.timingMethod === null || leaderboard.timingMethod === key.timingMethod)
  );
}

/** Full-game or individual-level leaderboard path. */
export function leaderboardPath(key: LeaderboardKey): string {
  const game = encodeURIComponent(key.gameId);
  const category = encodeURIComponent(key.categoryId);
  if (key.levelId !== null) {
    return `/leaderboards/${game}/level/${encodeURIComponent(key.levelId)}/${category}`;
  }
  return `/leaderboards/${game}/category/${category}`;
}

/**
 * Query parameters for a leaderboard request. `top` is the number of top
 * *places*, not runs (ties can produce more runs).
 */
export function leaderboardQuery(key: LeaderboardKey, top: number): Record<string, QueryValue> {
  const query: Record<string, QueryValue> = { top, embed: "players" };
  if (key.platformId !== null) {
    query.platform = key.platformId;
  }
  if (key.regionId !== null) {
    query.region = key.regionId;
  }
  if (key.emulator !== null) {
    query.emulators = key.emulator;
  }
  if (key.timingMethod !== null) {
    query.timing = key.timingMethod;
  }
  for (const [variableId, valueId] of Object.entries(key.variables)) {
    query[`var-${variableId}`] = valueId;
  }
  return query;
}

/**
 * The personal-bests `place` only reflects the current leaderboard when no
 * extra filters are applied. Otherwise it must not be used as a rank.
 */
export function canUsePersonalBestPlaceAsRank(key: LeaderboardKey): boolean {
  return canUseUnfilteredPersonalBests(key);
}

export function canUseUnfilteredPersonalBests(key: LeaderboardKey): boolean {
  return (
    key.platformId === null &&
    key.regionId === null &&
    key.emulator === null &&
    key.timingMethod === null
  );
}

export function selectRunTime(
  times: SpeedrunRunTimes,
  timingMethod: TimingMethod | null,
): number | null {
  switch (timingMethod) {
    case "realtime":
      return times.realtimeSeconds;
    case "realtime_noloads":
      return times.realtimeNoLoadsSeconds;
    case "ingame":
      return times.ingameSeconds;
    default:
      return times.primarySeconds;
  }
}
