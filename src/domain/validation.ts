import type { ActiveConfig } from "./config";
import { resolveDisplayName } from "./display-name";
import type { PlayerMapping } from "./player";
import { RACE_SCREEN_SLOT_KEYS } from "./race-screen";

/**
 * Structured validation result. Errors are returned as data (not thrown) so
 * they can be aggregated, asserted on in tests and surfaced in the dashboard.
 */
export type ValidationIssue = {
  code: string;
  message: string;
};

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function hasUnresolvedLink(player: Record<string, unknown>): boolean {
  return (["racetime", "speedrunCom", "twitch"] as const).some((key) => {
    const link = player[key];
    return isRecord(link) && link.state === "unresolved";
  });
}

function hasResolvablePlayerShape(player: Record<string, unknown>): boolean {
  return isRecord(player.racetime) && isRecord(player.speedrunCom) && isRecord(player.twitch);
}

/**
 * Validate that an active config is safe to broadcast. Returns an empty array
 * when the config is valid.
 */
export function validateActiveConfig(config: ActiveConfig): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!isRecord(config)) {
    return [
      {
        code: ACTIVE_CONFIG_ISSUE_CODES.configInvalid,
        message: "Active config is missing or is not an object.",
      },
    ];
  }

  const raw = config as unknown as Record<string, unknown>;

  if (!isRecord(raw.race)) {
    issues.push({
      code: ACTIVE_CONFIG_ISSUE_CODES.raceMissing,
      message: "Active config must have a race.",
    });
  }

  const players = isRecord(raw.players) ? raw.players : {};
  const participants = Array.isArray(raw.participants) ? raw.participants : [];

  for (const playerId of Object.keys(players)) {
    const player = players[playerId];
    if (!isRecord(player)) {
      issues.push({
        code: ACTIVE_CONFIG_ISSUE_CODES.playerInvalid,
        message: `Player "${playerId}" is not a valid player mapping.`,
      });
      continue;
    }

    if (hasUnresolvedLink(player)) {
      issues.push({
        code: ACTIVE_CONFIG_ISSUE_CODES.playerIdentityUnresolved,
        message: `Player "${playerId}" has an unresolved identity.`,
      });
    }

    if (!hasResolvablePlayerShape(player)) {
      issues.push({
        code: ACTIVE_CONFIG_ISSUE_CODES.playerInvalid,
        message: `Player "${playerId}" does not contain all account links.`,
      });
    } else if (resolveDisplayName(player as unknown as PlayerMapping) === null) {
      issues.push({
        code: ACTIVE_CONFIG_ISSUE_CODES.displayNameUnresolved,
        message: `Player "${playerId}" has no resolvable display name.`,
      });
    }
  }

  const participantRacetimeIds = new Set<string>();
  for (const participant of participants) {
    if (!isRecord(participant)) {
      continue;
    }
    if (participant.playerId === null || participant.playerId === undefined) {
      const racetimeUserId = isNonEmptyString(participant.racetimeUserId)
        ? participant.racetimeUserId
        : "?";
      issues.push({
        code: ACTIVE_CONFIG_ISSUE_CODES.participantPlayerUnresolved,
        message: `Race participant "${racetimeUserId}" is not mapped to a player.`,
      });
    }
    if (isNonEmptyString(participant.racetimeUserId)) {
      participantRacetimeIds.add(participant.racetimeUserId);
    }
  }

  const slots = isRecord(raw.raceScreenSlots) ? raw.raceScreenSlots : {};
  const slotOwners = new Map<string, string>();
  for (const slot of RACE_SCREEN_SLOT_KEYS) {
    const racetimeUserId = slots[slot];
    if (racetimeUserId === null) {
      continue;
    }
    if (!isNonEmptyString(racetimeUserId)) {
      issues.push({
        code: ACTIVE_CONFIG_ISSUE_CODES.raceScreenSlotMissing,
        message: `Race screen slot ${slot} is invalid.`,
      });
      continue;
    }

    if (!participantRacetimeIds.has(racetimeUserId)) {
      issues.push({
        code: ACTIVE_CONFIG_ISSUE_CODES.raceScreenSlotUnknownParticipant,
        message: `Race screen slot ${slot} references a RaceTime user that is not a participant: "${racetimeUserId}".`,
      });
    }

    const existingSlot = slotOwners.get(racetimeUserId);
    if (existingSlot !== undefined) {
      issues.push({
        code: ACTIVE_CONFIG_ISSUE_CODES.raceScreenSlotDuplicate,
        message: `RaceTime user "${racetimeUserId}" is used in slots ${existingSlot} and ${slot}.`,
      });
    } else {
      slotOwners.set(racetimeUserId, slot);
    }
  }

  const commentatorPlayerIds = Array.isArray(raw.commentatorPlayerIds)
    ? raw.commentatorPlayerIds
    : [];

  if (commentatorPlayerIds.length > MAX_COMMENTATORS) {
    issues.push({
      code: ACTIVE_CONFIG_ISSUE_CODES.commentatorTooMany,
      message: `At most ${MAX_COMMENTATORS} commentators are allowed (got ${commentatorPlayerIds.length}).`,
    });
  }

  const seenCommentators = new Set<string>();
  for (const commentatorPlayerId of commentatorPlayerIds) {
    if (typeof commentatorPlayerId !== "string") {
      continue;
    }
    if (seenCommentators.has(commentatorPlayerId)) {
      issues.push({
        code: ACTIVE_CONFIG_ISSUE_CODES.commentatorDuplicate,
        message: `Commentator "${commentatorPlayerId}" is listed more than once.`,
      });
    }
    seenCommentators.add(commentatorPlayerId);

    if (!Object.prototype.hasOwnProperty.call(players, commentatorPlayerId)) {
      issues.push({
        code: ACTIVE_CONFIG_ISSUE_CODES.commentatorUnknownPlayer,
        message: `Commentator "${commentatorPlayerId}" is not a known active player.`,
      });
    }
  }

  if (!isRecord(raw.categorySelection)) {
    issues.push({
      code: ACTIVE_CONFIG_ISSUE_CODES.categorySelectionMissing,
      message: "Active config must have a category selection.",
    });
  }

  return issues;
}

export function hasValidationIssue(issues: readonly ValidationIssue[], code: string): boolean {
  return issues.some((issue) => issue.code === code);
}
