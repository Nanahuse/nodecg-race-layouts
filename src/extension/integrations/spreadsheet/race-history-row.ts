import type { RaceHistoryPayload } from "../../../domain";
import type { RaceTimeUserId } from "../../../domain/ids";
export const RACE_HISTORY_COLUMNS = [
  "racetime_url",
  "racetime_race_id",
  "category_slug",
  "category_name",
  "goal",
  "participants_json",
  "race_screen_slots_json",
  "commentators_json",
  "active_revision",
  "first_applied_at",
  "last_applied_at",
] as const;
export type RaceHistoryColumn = (typeof RACE_HISTORY_COLUMNS)[number];
export type RaceHistoryRow = Record<RaceHistoryColumn, string>;
function plainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}
export function raceHistoryPayloadToRow(
  payload: RaceHistoryPayload,
  revision: number,
  appliedAt: string,
  firstAppliedAt = appliedAt,
): RaceHistoryRow {
  return {
    racetime_url: payload.racetimeUrl,
    racetime_race_id: payload.raceId,
    category_slug: payload.categorySlug,
    category_name: payload.categoryName,
    goal: payload.goal,
    participants_json: JSON.stringify(payload.participants),
    race_screen_slots_json: JSON.stringify(payload.raceScreenSlots),
    commentators_json: JSON.stringify(payload.commentatorPlayerIds),
    active_revision: String(revision),
    first_applied_at: firstAppliedAt,
    last_applied_at: appliedAt,
  };
}
export function parseRaceHistoryRow(row: RaceHistoryRow):
  | {
      ok: true;
      payload: RaceHistoryPayload;
      activeRevision: number;
      firstAppliedAt: string;
      lastAppliedAt: string;
    }
  | { ok: false; message: string } {
  if (
    ![row.racetime_url, row.racetime_race_id, row.category_slug, row.category_name, row.goal].every(
      nonEmptyString,
    )
  )
    return { ok: false, message: "Required RaceHistory text field is empty." };
  const revision = Number(row.active_revision);
  if (
    !Number.isInteger(revision) ||
    revision <= 0 ||
    !row.first_applied_at ||
    !row.last_applied_at ||
    Number.isNaN(Date.parse(row.first_applied_at)) ||
    Number.isNaN(Date.parse(row.last_applied_at))
  )
    return { ok: false, message: "Invalid RaceHistory revision or timestamp." };
  try {
    const participants = JSON.parse(row.participants_json);
    const slots = JSON.parse(row.race_screen_slots_json);
    const commentators = JSON.parse(row.commentators_json);
    if (
      !plainObject(participants) ||
      Object.entries(participants).some(
        ([key, value]) => !nonEmptyString(key) || !nonEmptyString(value),
      )
    )
      return { ok: false, message: "Invalid participants_json shape." };
    const slotKeys = ["1", "2", "3", "4"] as const;
    if (
      !plainObject(slots) ||
      Object.keys(slots).length !== 4 ||
      !slotKeys.every(
        (key) =>
          Object.prototype.hasOwnProperty.call(slots, key) &&
          (slots[key] === null || nonEmptyString(slots[key])),
      )
    )
      return { ok: false, message: "Invalid race_screen_slots_json shape." };
    const assignedSlots = slotKeys.map((key) => slots[key]).filter(nonEmptyString);
    if (new Set(assignedSlots).size !== assignedSlots.length)
      return { ok: false, message: "Invalid race_screen_slots_json shape." };
    if (
      assignedSlots.some(
        (racetimeUserId) => !Object.prototype.hasOwnProperty.call(participants, racetimeUserId),
      )
    )
      return { ok: false, message: "RaceHistory slot references unknown participant." };
    if (
      !Array.isArray(commentators) ||
      commentators.length > 3 ||
      commentators.some((value) => !nonEmptyString(value)) ||
      new Set(commentators).size !== commentators.length
    )
      return { ok: false, message: "Invalid commentators_json shape." };
    return {
      ok: true,
      payload: {
        racetimeUrl: row.racetime_url,
        raceId: row.racetime_race_id,
        categorySlug: row.category_slug,
        categoryName: row.category_name,
        goal: row.goal,
        participants: participants as Record<string, string>,
        raceScreenSlots: slots as Record<1 | 2 | 3 | 4, RaceTimeUserId | null>,
        commentatorPlayerIds: commentators as string[],
      },
      activeRevision: revision,
      firstAppliedAt: row.first_applied_at,
      lastAppliedAt: row.last_applied_at,
    };
  } catch {
    return { ok: false, message: "Invalid RaceHistory JSON." };
  }
}
