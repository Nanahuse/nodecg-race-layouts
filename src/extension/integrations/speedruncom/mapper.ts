import type { TimingMethod } from "../../../domain";
import { SpeedrunComPayloadError } from "./errors";
import {
  isRecord,
  optionalStringArray,
  requireBoolean,
  requireRecord,
  requireString,
} from "./parser";
import type {
  SpeedrunCategoryOption,
  SpeedrunGameDetail,
  SpeedrunGameSearchResult,
  SpeedrunLevelOption,
  SpeedrunPlatformOption,
  SpeedrunRegionOption,
  SpeedrunTimingMethods,
  SpeedrunUserOption,
  SpeedrunVariableOption,
  SpeedrunVariableValueOption,
} from "./types";

function internationalName(record: Record<string, unknown>, path: string): string {
  const names = requireRecord(record.names, `${path}.names`);
  const name = names.international;
  if (typeof name !== "string" || name.trim() === "") {
    throw new SpeedrunComPayloadError(`${path}.names.international must be a non-empty string.`);
  }
  return name;
}

export function timingMethodsFromRunTimes(runTimes: readonly string[]): SpeedrunTimingMethods {
  return {
    realtime: runTimes.includes("realtime"),
    realtimeNoLoads: runTimes.includes("realtime_noloads"),
    ingame: runTimes.includes("ingame"),
  };
}

export function toTimingMethodList(methods: SpeedrunTimingMethods): TimingMethod[] {
  const list: TimingMethod[] = [];
  if (methods.realtime) {
    list.push("realtime");
  }
  if (methods.realtimeNoLoads) {
    list.push("realtime_noloads");
  }
  if (methods.ingame) {
    list.push("ingame");
  }
  return list;
}

export function mapGameSearchResult(value: unknown): SpeedrunGameSearchResult {
  const record = requireRecord(value, "game");
  return {
    id: requireString(record, "id", "game.id"),
    name: internationalName(record, "game"),
    abbreviation: requireString(record, "abbreviation", "game.abbreviation"),
  };
}

export function mapGameDetail(value: unknown): SpeedrunGameDetail {
  const record = requireRecord(value, "game");
  const ruleset = isRecord(record.ruleset) ? record.ruleset : {};
  const runTimes = optionalStringArray(ruleset, "run-times", "game.ruleset.run-times");

  return {
    id: requireString(record, "id", "game.id"),
    name: internationalName(record, "game"),
    abbreviation: requireString(record, "abbreviation", "game.abbreviation"),
    platformIds: optionalStringArray(record, "platforms", "game.platforms"),
    regionIds: optionalStringArray(record, "regions", "game.regions"),
    timingMethods: timingMethodsFromRunTimes(runTimes),
  };
}

export function mapCategory(value: unknown): SpeedrunCategoryOption {
  const record = requireRecord(value, "category");
  const type = record.type;
  if (type !== "per-game" && type !== "per-level") {
    throw new SpeedrunComPayloadError('category.type must be "per-game" or "per-level".');
  }
  return {
    id: requireString(record, "id", "category.id"),
    name: requireString(record, "name", "category.name"),
    type,
    miscellaneous: requireBoolean(record, "miscellaneous", "category.miscellaneous"),
  };
}

export function mapLevel(value: unknown): SpeedrunLevelOption {
  const record = requireRecord(value, "level");
  return {
    id: requireString(record, "id", "level.id"),
    name: requireString(record, "name", "level.name"),
  };
}

export function mapVariable(value: unknown): SpeedrunVariableOption {
  const record = requireRecord(value, "variable");
  const valuesWrapper = requireRecord(record.values, "variable.values");
  const valuesMap = requireRecord(valuesWrapper.values, "variable.values.values");

  const values: SpeedrunVariableValueOption[] = [];
  for (const [id, entry] of Object.entries(valuesMap)) {
    const entryRecord = requireRecord(entry, `variable.values.values["${id}"]`);
    const label = typeof entryRecord.label === "string" ? entryRecord.label : id;
    values.push({ id, label });
  }

  return {
    id: requireString(record, "id", "variable.id"),
    name: requireString(record, "name", "variable.name"),
    mandatory: requireBoolean(record, "mandatory", "variable.mandatory"),
    userDefined: requireBoolean(record, "user-defined", "variable.user-defined"),
    values,
  };
}

export function mapPlatform(value: unknown): SpeedrunPlatformOption {
  const record = requireRecord(value, "platform");
  return {
    id: requireString(record, "id", "platform.id"),
    name: requireString(record, "name", "platform.name"),
  };
}

export function mapRegion(value: unknown): SpeedrunRegionOption {
  const record = requireRecord(value, "region");
  return {
    id: requireString(record, "id", "region.id"),
    name: requireString(record, "name", "region.name"),
  };
}

/**
 * Extract a Twitch login from a Speedrun.com `twitch.uri`
 * (e.g. `https://www.twitch.tv/username`). Anything that is not a plain
 * twitch.tv profile URL yields `null`.
 */
export function extractTwitchLogin(uri: string | null): string | null {
  if (uri === null) {
    return null;
  }
  let parsed: URL;
  try {
    parsed = new URL(uri);
  } catch {
    return null;
  }
  const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
  if (host !== "twitch.tv") {
    return null;
  }
  const segments = parsed.pathname.split("/").filter((segment) => segment !== "");
  const login = decodeURIComponent(segments[0] ?? "").trim();
  return login === "" ? null : login;
}

export function mapUser(value: unknown): SpeedrunUserOption {
  const record = requireRecord(value, "user");
  const twitch = record.twitch;
  const twitchUri = isRecord(twitch) && typeof twitch.uri === "string" ? twitch.uri : null;

  return {
    userId: requireString(record, "id", "user.id"),
    name: internationalName(record, "user"),
    twitchLogin: extractTwitchLogin(twitchUri),
  };
}
