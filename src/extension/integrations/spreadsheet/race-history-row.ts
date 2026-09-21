import type { RaceHistoryPayload } from "../../../domain";
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
      !participants ||
      typeof participants !== "object" ||
      !slots ||
      typeof slots !== "object" ||
      !Array.isArray(commentators)
    )
      return { ok: false, message: "Invalid RaceHistory JSON shape." };
    return {
      ok: true,
      payload: {
        racetimeUrl: row.racetime_url,
        raceId: row.racetime_race_id,
        categorySlug: row.category_slug,
        categoryName: row.category_name,
        goal: row.goal,
        participants,
        raceScreenSlots: slots,
        commentatorPlayerIds: commentators,
      },
      activeRevision: revision,
      firstAppliedAt: row.first_applied_at,
      lastAppliedAt: row.last_applied_at,
    };
  } catch {
    return { ok: false, message: "Invalid RaceHistory JSON." };
  }
}
