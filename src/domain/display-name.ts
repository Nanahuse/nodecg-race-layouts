import type { DraftPlayer, PlayerMapping } from "./player";

export type DisplayNameResolvablePlayer = PlayerMapping | DraftPlayer;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function linkedValueName(link: unknown, keys: readonly string[]): string | null {
  if (!isRecord(link) || link.state !== "linked") {
    return null;
  }
  const value = link.value;
  if (!isRecord(value)) {
    return null;
  }
  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === "string" && candidate.trim() !== "") {
      return candidate;
    }
  }
  return null;
}

/**
 * Resolve the single canonical display name for a player.
 *
 * Priority:
 *   1. manualDisplayName
 *   2. Twitch login
 *   3. Speedrun.com name
 *   4. RaceTime.gg name
 *
 * Returns `null` when no name can be produced. Callers should treat that as a
 * validation error rather than inventing their own fallback. Graphics and
 * dashboard code must use this function instead of resolving names themselves.
 */
export function resolveDisplayName(player: DisplayNameResolvablePlayer): string | null {
  const manualDisplayName = player.manualDisplayName;
  if (typeof manualDisplayName === "string" && manualDisplayName.trim() !== "") {
    return manualDisplayName;
  }

  const twitch = linkedValueName(player.twitch, ["login"]);
  if (twitch !== null) {
    return twitch;
  }

  const speedrunCom = linkedValueName(player.speedrunCom, ["name"]);
  if (speedrunCom !== null) {
    return speedrunCom;
  }

  const racetime = linkedValueName(player.racetime, ["name"]);
  if (racetime !== null) {
    return racetime;
  }

  return null;
}
