import type { RaceTimeUserId } from "./ids";

/**
 * The race screen has four fixed slots:
 *
 *   P1 = top-left, P2 = top-right, P3 = bottom-left, P4 = bottom-right.
 *
 * A slot references a RaceTime user id (not a PlayerId). Commentators, by
 * contrast, reference PlayerIds. Do not conflate the two.
 */
export type RaceScreenSlot = 1 | 2 | 3 | 4;

export type RaceScreenSlotKey = "1" | "2" | "3" | "4";

export const RACE_SCREEN_SLOT_NUMBERS: readonly RaceScreenSlot[] = [1, 2, 3, 4];

export const RACE_SCREEN_SLOT_KEYS: readonly RaceScreenSlotKey[] = ["1", "2", "3", "4"];

/** Draft: a slot may be unset (null). */
export type DraftRaceScreenSlots = {
  1: RaceTimeUserId | null;
  2: RaceTimeUserId | null;
  3: RaceTimeUserId | null;
  4: RaceTimeUserId | null;
};

/** Active: slot positions remain fixed, but any position may be unassigned. */
export type ActiveRaceScreenSlots = {
  1: RaceTimeUserId | null;
  2: RaceTimeUserId | null;
  3: RaceTimeUserId | null;
  4: RaceTimeUserId | null;
};
