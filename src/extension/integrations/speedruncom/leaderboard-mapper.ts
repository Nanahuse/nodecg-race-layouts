import type {
  LeaderboardEntry,
  LeaderboardKey,
  PersonalBest,
  WorldRecord,
  WorldRecordHolder,
} from "../../../domain";
import { SpeedrunComPayloadError } from "./errors";
import {
  canUsePersonalBestPlaceAsRank,
  selectRunTime,
  type SpeedrunLeaderboard,
  type SpeedrunLeaderboardEntry,
  type SpeedrunPersonalBestEntry,
} from "./leaderboard";
import type { ParsedLeaderboard, ParsedPersonalBest, ParsedRun } from "./leaderboard-parser";

/**
 * Format seconds as `SS.mmm`, `M:SS.mmm` or `H:MM:SS.mmm`. Milliseconds are
 * truncated (not rounded) to a fixed 3-digit precision.
 */
export function formatRunTime(seconds: number): string {
  const totalMilliseconds = Math.max(0, Math.floor(seconds * 1000));
  const milliseconds = totalMilliseconds % 1000;
  const totalSeconds = Math.floor(totalMilliseconds / 1000);
  const secondsPart = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutesPart = totalMinutes % 60;
  const hoursPart = Math.floor(totalMinutes / 60);

  const ms = String(milliseconds).padStart(3, "0");
  if (hoursPart > 0) {
    return `${hoursPart}:${String(minutesPart).padStart(2, "0")}:${String(secondsPart).padStart(2, "0")}.${ms}`;
  }
  if (minutesPart > 0) {
    return `${minutesPart}:${String(secondsPart).padStart(2, "0")}.${ms}`;
  }
  return `${secondsPart}.${ms}`;
}

export function mapLeaderboard(
  parsed: ParsedLeaderboard,
  key: LeaderboardKey,
): SpeedrunLeaderboard {
  const nameByUserId = new Map<string, string>();
  for (const player of parsed.players) {
    if (player.userId !== null) {
      nameByUserId.set(player.userId, player.name);
    }
  }

  const entries: SpeedrunLeaderboardEntry[] = parsed.runs.map((entry) => {
    const timeSeconds = selectRunTime(entry.run.times, key.timingMethod);
    if (timeSeconds === null) {
      throw new SpeedrunComPayloadError(
        `Leaderboard run at place ${entry.place} has no ${key.timingMethod ?? "primary"} time.`,
      );
    }
    const players = entry.run.players.map((player) =>
      player.userId !== null
        ? {
            userId: player.userId,
            name: nameByUserId.get(player.userId) ?? player.name ?? "Unknown",
          }
        : { userId: null, name: player.name ?? "Unknown" },
    );
    return {
      place: entry.place,
      players,
      timeSeconds,
      formattedTime: formatRunTime(timeSeconds),
    };
  });

  return {
    gameId: parsed.gameId,
    categoryId: parsed.categoryId,
    levelId: parsed.levelId,
    platformId: parsed.platformId,
    regionId: parsed.regionId,
    emulator: parsed.emulator,
    timingMethod: parsed.timingMethod,
    variables: parsed.variables,
    entries,
  };
}

/** Build the world record from all place-1 entries (ties included). */
export function mapWorldRecord(entries: readonly SpeedrunLeaderboardEntry[]): WorldRecord | null {
  const firstPlaces = entries.filter((entry) => entry.place === 1);
  const best = firstPlaces[0];
  if (!best) {
    return null;
  }

  const holders: WorldRecordHolder[] = [];
  const seen = new Set<string>();
  for (const entry of firstPlaces) {
    for (const player of entry.players) {
      const dedupeKey = player.userId !== null ? `user:${player.userId}` : `guest:${player.name}`;
      if (seen.has(dedupeKey)) {
        continue;
      }
      seen.add(dedupeKey);
      holders.push({ userId: player.userId, name: player.name });
    }
  }

  return {
    timeSeconds: best.timeSeconds,
    formattedTime: best.formattedTime,
    holders,
  };
}

/** Convert a single-player leaderboard entry to the domain shape. */
export function toDomainLeaderboardEntry(entry: SpeedrunLeaderboardEntry): LeaderboardEntry | null {
  if (entry.players.length !== 1) {
    return null;
  }
  const player = entry.players[0];
  if (!player) {
    return null;
  }
  return {
    rank: entry.place,
    speedrunComUserId: player.userId,
    speedrunComName: player.name,
    timeSeconds: entry.timeSeconds,
    formattedTime: entry.formattedTime,
  };
}

export function mapPersonalBestEntry(parsed: ParsedPersonalBest): SpeedrunPersonalBestEntry {
  const run = parsed.run;
  return {
    place: parsed.place,
    gameId: run.gameId,
    categoryId: run.categoryId,
    levelId: run.levelId,
    variables: run.variables,
    platformId: run.platformId,
    regionId: run.regionId,
    emulator: run.emulator,
    times: run.times,
  };
}

/** Map a verified `/runs` resource to the shared PB candidate shape. */
export function mapUserRun(parsed: ParsedRun): SpeedrunPersonalBestEntry {
  return {
    place: null,
    gameId: parsed.gameId,
    categoryId: parsed.categoryId,
    levelId: parsed.levelId,
    variables: parsed.variables,
    platformId: parsed.platformId,
    regionId: parsed.regionId,
    emulator: parsed.emulator,
    times: parsed.times,
  };
}

/** Leaderboard-identity comparison for personal bests (timing excluded). */
export function personalBestMatchesKey(
  entry: SpeedrunPersonalBestEntry,
  key: LeaderboardKey,
): boolean {
  return (
    entry.gameId === key.gameId &&
    entry.categoryId === key.categoryId &&
    entry.levelId === key.levelId &&
    Object.entries(key.variables).every(([id, value]) => entry.variables[id] === value) &&
    (key.platformId === null || entry.platformId === key.platformId) &&
    (key.regionId === null || entry.regionId === key.regionId) &&
    (key.emulator === null || entry.emulator === key.emulator)
  );
}

export function personalBestToDomain(
  entry: SpeedrunPersonalBestEntry,
  key: LeaderboardKey,
): PersonalBest | null {
  const timeSeconds = selectRunTime(entry.times, key.timingMethod);
  if (timeSeconds === null) {
    return null;
  }
  return {
    timeSeconds,
    formattedTime: formatRunTime(timeSeconds),
    rank: canUsePersonalBestPlaceAsRank(key) ? entry.place : null,
  };
}

/** Select the fastest candidate matching the requested leaderboard and timing. */
export function selectPersonalBest(
  entries: readonly SpeedrunPersonalBestEntry[],
  key: LeaderboardKey,
): PersonalBest | null {
  let best: PersonalBest | null = null;
  for (const entry of entries) {
    if (!personalBestMatchesKey(entry, key)) continue;
    const candidate = personalBestToDomain(entry, key);
    if (candidate && (best === null || candidate.timeSeconds < best.timeSeconds)) {
      best = candidate;
    }
  }
  return best;
}
