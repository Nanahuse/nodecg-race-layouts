import type { DraftConfig, PlayerId } from "../../domain";
import { MAX_COMMENTATORS, RACE_SCREEN_SLOT_KEYS, resolveDisplayName } from "../../domain";
import { referencedDraftPlayerIds } from "./draft-player-references";

export type DraftReadinessIssue = {
  code: string;
  message: string;
};

export const DRAFT_READINESS_ISSUE_CODES = {
  raceMissing: "race_missing",
  participantPlayerUnresolved: "participant_player_unresolved",
  participantPlayerMissing: "participant_player_missing",
  identityUnresolved: "identity_unresolved",
  slotMissing: "slot_missing",
  slotUnknownParticipant: "slot_unknown_participant",
  slotDuplicate: "slot_duplicate",
  commentatorTooMany: "commentator_too_many",
  commentatorDuplicate: "commentator_duplicate",
  commentatorUnknownPlayer: "commentator_unknown_player",
  categorySelectionMissing: "category_selection_missing",
  displayNameUnresolved: "display_name_unresolved",
} as const;

/**
 * Structural readiness for apply. Unlike draft integrity, this requires all
 * four race screen slots and a category selection. Snapshot state / revision /
 * leaderboard-key compatibility are deliberately *not* part of this check;
 * `computeDraftBroadcastState` combines both.
 */
export function validateDraftReadiness(draft: DraftConfig): DraftReadinessIssue[] {
  const issues: DraftReadinessIssue[] = [];

  if (!draft.race) {
    issues.push({ code: DRAFT_READINESS_ISSUE_CODES.raceMissing, message: "Draft has no race." });
  }

  for (const participant of draft.participants) {
    if (!participant.playerId) {
      issues.push({
        code: DRAFT_READINESS_ISSUE_CODES.participantPlayerUnresolved,
        message: `Participant "${participant.racetimeUserId}" is not mapped to a player.`,
      });
      continue;
    }
    if (!draft.players[participant.playerId]) {
      issues.push({
        code: DRAFT_READINESS_ISSUE_CODES.participantPlayerMissing,
        message: `Participant "${participant.racetimeUserId}" references unknown player "${participant.playerId}".`,
      });
    }
  }

  for (const playerId of referencedDraftPlayerIds(draft)) {
    const player = draft.players[playerId];
    if (!player) {
      continue;
    }
    if (
      player.racetime.state === "unresolved" ||
      player.speedrunCom.state === "unresolved" ||
      player.twitch.state === "unresolved"
    ) {
      issues.push({
        code: DRAFT_READINESS_ISSUE_CODES.identityUnresolved,
        message: `Player "${playerId}" has an unresolved identity.`,
      });
    }
    if (resolveDisplayName(player) === null) {
      issues.push({
        code: DRAFT_READINESS_ISSUE_CODES.displayNameUnresolved,
        message: `Player "${playerId}" has no resolvable display name.`,
      });
    }
  }

  const participantRacetimeIds = new Set(
    draft.participants.map((participant) => participant.racetimeUserId),
  );
  const slotOwners = new Map<string, string>();
  for (const slot of RACE_SCREEN_SLOT_KEYS) {
    const value = draft.raceScreenSlots[slot];
    if (value === null) {
      issues.push({
        code: DRAFT_READINESS_ISSUE_CODES.slotMissing,
        message: `Race screen slot ${slot} is not set.`,
      });
      continue;
    }
    if (!participantRacetimeIds.has(value)) {
      issues.push({
        code: DRAFT_READINESS_ISSUE_CODES.slotUnknownParticipant,
        message: `Race screen slot ${slot} references unknown participant "${value}".`,
      });
    }
    const existing = slotOwners.get(value);
    if (existing !== undefined) {
      issues.push({
        code: DRAFT_READINESS_ISSUE_CODES.slotDuplicate,
        message: `RaceTime user "${value}" is used in slots ${existing} and ${slot}.`,
      });
    } else {
      slotOwners.set(value, slot);
    }
  }

  if (draft.commentatorPlayerIds.length > MAX_COMMENTATORS) {
    issues.push({
      code: DRAFT_READINESS_ISSUE_CODES.commentatorTooMany,
      message: `At most ${MAX_COMMENTATORS} commentators are allowed.`,
    });
  }
  const seenCommentators = new Set<PlayerId>();
  for (const playerId of draft.commentatorPlayerIds) {
    if (seenCommentators.has(playerId)) {
      issues.push({
        code: DRAFT_READINESS_ISSUE_CODES.commentatorDuplicate,
        message: `Commentator "${playerId}" is listed more than once.`,
      });
    }
    seenCommentators.add(playerId);
    if (!draft.players[playerId]) {
      issues.push({
        code: DRAFT_READINESS_ISSUE_CODES.commentatorUnknownPlayer,
        message: `Commentator "${playerId}" is not a known player.`,
      });
    }
  }

  if (!draft.categorySelection.selection) {
    issues.push({
      code: DRAFT_READINESS_ISSUE_CODES.categorySelectionMissing,
      message: "Draft has no category selection.",
    });
  }

  return issues;
}

export function isDraftStructurallyReady(draft: DraftConfig): boolean {
  return validateDraftReadiness(draft).length === 0;
}
