import type { TimingMethod } from "../../../domain";
import { SpeedrunComPayloadError } from "./errors";
import { isTimingMethod, type SpeedrunRunTimes } from "./leaderboard";
import {
  isRecord,
  optionalBoolean,
  optionalNumber,
  optionalString,
  requireArray,
  requireNumber,
  requireRecord,
  requireString,
} from "./parser";

export type ParsedRunPlayer = {
  userId: string | null;
  name: string | null;
};

export type ParsedRun = {
  gameId: string;
  categoryId: string;
  levelId: string | null;

  variables: Record<string, string>;

  platformId: string | null;
  regionId: string | null;
  emulator: boolean | null;

  times: SpeedrunRunTimes;
  players: ParsedRunPlayer[];
};

export type ParsedLeaderboardRun = {
  place: number;
  run: ParsedRun;
};

export type ParsedLeaderboard = {
  gameId: string;
  categoryId: string;
  levelId: string | null;

  platformId: string | null;
  regionId: string | null;
  emulator: boolean | null;
  timingMethod: TimingMethod | null;

  variables: Record<string, string>;

  runs: ParsedLeaderboardRun[];
  players: { userId: string | null; name: string }[];
};

export type ParsedPersonalBest = {
  place: number | null;
  run: ParsedRun;
};

function parseVariables(value: unknown, path: string): Record<string, string> {
  if (value === null || value === undefined) {
    return {};
  }
  if (!isRecord(value)) {
    throw new SpeedrunComPayloadError(`${path} must be an object.`);
  }
  const variables: Record<string, string> = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item !== "string") {
      throw new SpeedrunComPayloadError(`${path}["${key}"] must be a string.`);
    }
    variables[key] = item;
  }
  return variables;
}

function parseRunTimes(record: Record<string, unknown>, path: string): SpeedrunRunTimes {
  const primaryIso = record.primary;
  const primarySeconds = record.primary_t;
  if (
    typeof primaryIso !== "string" ||
    primaryIso === "" ||
    typeof primarySeconds !== "number" ||
    !Number.isFinite(primarySeconds) ||
    primarySeconds <= 0
  ) {
    throw new SpeedrunComPayloadError(`${path}.primary time is missing.`);
  }

  const optionalSeconds = (iso: unknown, seconds: unknown): number | null =>
    typeof iso === "string" && iso !== "" && typeof seconds === "number" && seconds > 0
      ? seconds
      : null;

  return {
    primarySeconds,
    realtimeSeconds: optionalSeconds(record.realtime, record.realtime_t),
    realtimeNoLoadsSeconds: optionalSeconds(record.realtime_noloads, record.realtime_noloads_t),
    ingameSeconds: optionalSeconds(record.ingame, record.ingame_t),
  };
}

function parseRunPlayers(value: unknown, path: string): ParsedRunPlayer[] {
  const entries = requireArray(value, path);
  const players: ParsedRunPlayer[] = [];
  entries.forEach((entry, index) => {
    const record = requireRecord(entry, `${path}[${index}]`);
    if (record.rel === "user") {
      players.push({ userId: requireString(record, "id", `${path}[${index}].id`), name: null });
      return;
    }
    if (record.rel === "guest") {
      players.push({
        userId: null,
        name: optionalString(record, "name", `${path}[${index}].name`),
      });
      return;
    }
    throw new SpeedrunComPayloadError(`${path}[${index}].rel must be "user" or "guest".`);
  });
  return players;
}

function parseRun(value: unknown, path: string): ParsedRun {
  const record = requireRecord(value, path);
  const system = isRecord(record.system) ? record.system : {};

  return {
    gameId: requireString(record, "game", `${path}.game`),
    categoryId: requireString(record, "category", `${path}.category`),
    levelId: optionalString(record, "level", `${path}.level`),
    variables: parseVariables(record.values, `${path}.values`),
    platformId: optionalString(system, "platform", `${path}.system.platform`),
    regionId: optionalString(system, "region", `${path}.system.region`),
    emulator: optionalBoolean(system, "emulated", `${path}.system.emulated`),
    times: parseRunTimes(requireRecord(record.times, `${path}.times`), `${path}.times`),
    players: parseRunPlayers(record.players, `${path}.players`),
  };
}

/** Parse one run resource returned directly by `/runs`. */
export function parseRunResource(value: unknown): ParsedRun {
  return parseRun(value, "run");
}

function parseEmbedPlayers(
  value: unknown,
  path: string,
): { userId: string | null; name: string }[] {
  if (value === null || value === undefined) {
    return [];
  }
  // Speedrun.com currently wraps embedded resources in `{ data: [...] }`,
  // while older responses and fixtures may expose the array directly.
  const entries = Array.isArray(value)
    ? value
    : isRecord(value)
      ? requireArray(value.data, `${path}.data`)
      : requireArray(value, path);
  const players: { userId: string | null; name: string }[] = [];
  entries.forEach((entry, index) => {
    const record = requireRecord(entry, `${path}[${index}]`);
    if (record.rel === "user") {
      const names = requireRecord(record.names, `${path}[${index}].names`);
      players.push({
        userId: requireString(record, "id", `${path}[${index}].id`),
        name: requireString(names, "international", `${path}[${index}].names.international`),
      });
      return;
    }
    if (record.rel === "guest") {
      players.push({
        userId: null,
        name: optionalString(record, "name", `${path}[${index}].name`) ?? "Unknown",
      });
    }
  });
  return players;
}

function parseTimingMethod(value: unknown, path: string): TimingMethod | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== "string" || !isTimingMethod(value)) {
    throw new SpeedrunComPayloadError(`${path} must be a known timing method or null.`);
  }
  return value;
}

/** Parse the (already envelope-stripped) leaderboard object. */
export function parseLeaderboard(value: unknown): ParsedLeaderboard {
  const record = requireRecord(value, "leaderboard");
  const runs = requireArray(record.runs, "leaderboard.runs").map((entry, index) => {
    const runEntry = requireRecord(entry, `leaderboard.runs[${index}]`);
    return {
      place: requireNumber(runEntry, "place", `leaderboard.runs[${index}].place`),
      run: parseRun(runEntry.run, `leaderboard.runs[${index}].run`),
    };
  });

  return {
    gameId: requireString(record, "game", "leaderboard.game"),
    categoryId: requireString(record, "category", "leaderboard.category"),
    levelId: optionalString(record, "level", "leaderboard.level"),
    platformId: optionalString(record, "platform", "leaderboard.platform"),
    regionId: optionalString(record, "region", "leaderboard.region"),
    emulator: optionalBoolean(record, "emulators", "leaderboard.emulators"),
    timingMethod: parseTimingMethod(record.timing, "leaderboard.timing"),
    variables: parseVariables(record.values, "leaderboard.values"),
    runs,
    players: parseEmbedPlayers(record.players, "leaderboard.players"),
  };
}

/** Parse a single personal-best entry. */
export function parsePersonalBest(value: unknown): ParsedPersonalBest {
  const record = requireRecord(value, "personalBest");
  return {
    place: optionalNumber(record, "place", "personalBest.place"),
    run: parseRun(record.run, "personalBest.run"),
  };
}
