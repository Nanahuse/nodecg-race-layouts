import type { DraftConfig } from "../../domain";
import { MAX_COMMENTATORS, RACE_SCREEN_SLOT_KEYS } from "../../domain";

export type DraftReadinessIssue = { code: string; message: string };
export const DRAFT_READINESS_ISSUE_CODES = {
  raceMissing: "race_missing",
  participantResolutionRequired: "participant_resolution_required",
  participantPlayerMissing: "participant_player_missing",
  slotUnknownParticipant: "slot_unknown_participant",
  slotDuplicate: "slot_duplicate",
  commentatorTooMany: "commentator_too_many",
  commentatorDuplicate: "commentator_duplicate",
  commentatorUnknownPlayer: "commentator_unknown_player",
  categorySelectionMissing: "category_selection_missing",
} as const;

export function validateDraftReadiness(draft: DraftConfig): DraftReadinessIssue[] {
  const issues: DraftReadinessIssue[] = [];
  if (!draft.race)
    issues.push({ code: DRAFT_READINESS_ISSUE_CODES.raceMissing, message: "Draft has no race." });
  const participantPlayerIds = new Set<string>();
  for (const participant of draft.participants) {
    const person = draft.persons[participant.personRef];
    if (!person || person.resolution !== "matched" || !person.playerId) {
      issues.push({
        code: DRAFT_READINESS_ISSUE_CODES.participantResolutionRequired,
        message: `Participant "${participant.racetimeUserId}" is ${person?.resolution ?? "missing"}.`,
      });
      continue;
    }
    if (!person.player || person.player.playerId !== person.playerId) {
      issues.push({
        code: DRAFT_READINESS_ISSUE_CODES.participantPlayerMissing,
        message: `Participant "${participant.racetimeUserId}" has no matching Player snapshot.`,
      });
      continue;
    }
    if (participantPlayerIds.has(person.playerId)) {
      issues.push({
        code: DRAFT_READINESS_ISSUE_CODES.participantResolutionRequired,
        message: `Player "${person.playerId}" is assigned to more than one participant.`,
      });
    }
    participantPlayerIds.add(person.playerId);
  }
  const participantIds = new Set(
    draft.participants.map((participant) => participant.racetimeUserId),
  );
  const slotOwners = new Map<string, string>();
  for (const slot of RACE_SCREEN_SLOT_KEYS) {
    const value = draft.raceScreenSlots[slot];
    if (value === null) continue;
    if (!participantIds.has(value))
      issues.push({
        code: DRAFT_READINESS_ISSUE_CODES.slotUnknownParticipant,
        message: `Race screen slot ${slot} references unknown participant "${value}".`,
      });
    const existing = slotOwners.get(value);
    if (existing !== undefined)
      issues.push({
        code: DRAFT_READINESS_ISSUE_CODES.slotDuplicate,
        message: `RaceTime user "${value}" is used in slots ${existing} and ${slot}.`,
      });
    else slotOwners.set(value, slot);
  }
  if (draft.commentatorPlayerIds.length > MAX_COMMENTATORS)
    issues.push({
      code: DRAFT_READINESS_ISSUE_CODES.commentatorTooMany,
      message: `At most ${MAX_COMMENTATORS} commentators are allowed.`,
    });
  const seenCommentators = new Set<string>();
  for (const playerId of draft.commentatorPlayerIds) {
    if (seenCommentators.has(playerId))
      issues.push({
        code: DRAFT_READINESS_ISSUE_CODES.commentatorDuplicate,
        message: `Commentator "${playerId}" is listed more than once.`,
      });
    seenCommentators.add(playerId);
    if (draft.commentators[playerId]?.playerId !== playerId)
      issues.push({
        code: DRAFT_READINESS_ISSUE_CODES.commentatorUnknownPlayer,
        message: `Commentator "${playerId}" has no Player Manager snapshot.`,
      });
  }
  if (!draft.categorySelection.selection)
    issues.push({
      code: DRAFT_READINESS_ISSUE_CODES.categorySelectionMissing,
      message: "Draft has no category selection.",
    });
  return issues;
}

export function isDraftStructurallyReady(draft: DraftConfig): boolean {
  return validateDraftReadiness(draft).length === 0;
}
