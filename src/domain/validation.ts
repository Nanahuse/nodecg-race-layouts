import type { ActiveConfig } from "./config";
import { RACE_SCREEN_SLOT_KEYS } from "./race-screen";
export type ValidationIssue = { code: string; message: string };
export const MAX_COMMENTATORS = 3;
export const ACTIVE_CONFIG_ISSUE_CODES = {
  configInvalid: "config_invalid",
  raceMissing: "race_missing",
  playerInvalid: "player_invalid",
  playerIdentityUnresolved: "player_identity_unresolved",
  participantPlayerUnresolved: "participant_player_unresolved",
  raceScreenSlotMissing: "race_screen_slot_missing",
  raceScreenSlotUnknownParticipant: "race_screen_slot_unknown_participant",
  raceScreenSlotDuplicate: "race_screen_slot_duplicate",
  commentatorTooMany: "commentator_too_many",
  commentatorDuplicate: "commentator_duplicate",
  commentatorUnknownPlayer: "commentator_unknown_player",
  categorySelectionMissing: "category_selection_missing",
  displayNameUnresolved: "display_name_unresolved",
} as const;
export function validateActiveConfig(config: ActiveConfig): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const participantIds = new Set(
    config.participants.map((participant) => participant.racetimeUserId),
  );
  for (const participant of config.participants) {
    const player = config.players[participant.playerId];
    if (!player)
      issues.push({
        code: ACTIVE_CONFIG_ISSUE_CODES.participantPlayerUnresolved,
        message: `Race participant "${participant.racetimeUserId}" is not mapped to a player.`,
      });
    else if (!player.displayName.trim())
      issues.push({
        code: ACTIVE_CONFIG_ISSUE_CODES.displayNameUnresolved,
        message: `Player "${participant.playerId}" has no display name.`,
      });
  }
  const slots = new Map<string, string>();
  for (const slot of RACE_SCREEN_SLOT_KEYS) {
    const id = config.raceScreenSlots[slot];
    if (id === null) continue;
    if (!participantIds.has(id))
      issues.push({
        code: ACTIVE_CONFIG_ISSUE_CODES.raceScreenSlotUnknownParticipant,
        message: `Race screen slot ${slot} references unknown participant "${id}".`,
      });
    const prior = slots.get(id);
    if (prior)
      issues.push({
        code: ACTIVE_CONFIG_ISSUE_CODES.raceScreenSlotDuplicate,
        message: `RaceTime user "${id}" is used in slots ${prior} and ${slot}.`,
      });
    else slots.set(id, slot);
  }
  if (config.commentatorPlayerIds.length > MAX_COMMENTATORS)
    issues.push({
      code: ACTIVE_CONFIG_ISSUE_CODES.commentatorTooMany,
      message: `At most ${MAX_COMMENTATORS} commentators are allowed.`,
    });
  const seen = new Set<string>();
  for (const id of config.commentatorPlayerIds) {
    if (seen.has(id))
      issues.push({
        code: ACTIVE_CONFIG_ISSUE_CODES.commentatorDuplicate,
        message: `Commentator "${id}" is listed more than once.`,
      });
    seen.add(id);
    if (!config.players[id])
      issues.push({
        code: ACTIVE_CONFIG_ISSUE_CODES.commentatorUnknownPlayer,
        message: `Commentator "${id}" is not a known active player.`,
      });
  }
  if (!config.categorySelection)
    issues.push({
      code: ACTIVE_CONFIG_ISSUE_CODES.categorySelectionMissing,
      message: "Active config must have a category selection.",
    });
  return issues;
}
export function hasValidationIssue(issues: readonly ValidationIssue[], code: string): boolean {
  return issues.some((issue) => issue.code === code);
}
