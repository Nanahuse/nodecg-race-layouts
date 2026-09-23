import type {
  ActiveConfig,
  ActiveRaceParticipant,
  ActiveRaceScreenSlots,
  ActiveSpeedrunSnapshot,
  DraftConfig,
  DraftPlayer,
  DraftSpeedrunSnapshot,
  LinkSource,
  PlayerId,
  PlayerMapping,
} from "../../domain";
import { referencedDraftPlayerIds } from "./draft-player-references";

export type ActiveBuildIssue = {
  code: string;
  message: string;
};

export class ActiveConfigBuildError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ActiveConfigBuildError";
    this.code = code;
  }
}

/** Draft account link shape (adds `source` and allows `unresolved`). */
export type DraftAccountLinkValue<T> =
  | { state: "linked"; value: T; source: LinkSource }
  | { state: "none"; source: "spreadsheet" | "manual" }
  | { state: "unresolved" };

/**
 * Convert a draft account link to the active form. `source` is dropped and
 * `unresolved` is rejected (double defence on top of readiness validation).
 */
export function draftAccountLinkToActive<T>(
  link: DraftAccountLinkValue<T>,
): { state: "linked"; value: T } | { state: "none" } {
  if (link.state === "unresolved") {
    throw new ActiveConfigBuildError(
      "identity_unresolved",
      "Cannot promote an unresolved account link to active.",
    );
  }
  if (link.state === "linked") {
    return { state: "linked", value: structuredClone(link.value) };
  }
  return { state: "none" };
}

export function draftPlayerToPlayerMapping(player: DraftPlayer): PlayerMapping {
  return {
    playerId: player.playerId,
    manualDisplayName: player.manualDisplayName,
    racetime: draftAccountLinkToActive(player.racetime),
    speedrunCom: draftAccountLinkToActive(player.speedrunCom),
    twitch: draftAccountLinkToActive(player.twitch),
  };
}

export type ActiveConfigBuildResult =
  { ok: true; config: ActiveConfig } | { ok: false; issues: ActiveBuildIssue[] };

/**
 * Pure Draft -> Active conversion. Never casts; collects structured issues and
 * refuses to build when the draft is not promotable.
 */
export function buildActiveConfig(
  draft: DraftConfig,
  activeRevision: number,
): ActiveConfigBuildResult {
  const issues: ActiveBuildIssue[] = [];

  const race = draft.race;
  if (!race) {
    issues.push({ code: "race_missing", message: "Draft has no race." });
  }

  const selection = draft.categorySelection.selection;
  if (!selection) {
    issues.push({ code: "category_missing", message: "Draft has no category selection." });
  }

  const participants: ActiveRaceParticipant[] = [];
  for (const participant of draft.participants) {
    if (!participant.playerId) {
      issues.push({
        code: "participant_player_unresolved",
        message: `Participant "${participant.racetimeUserId}" is not mapped to a player.`,
      });
      continue;
    }
    participants.push({
      racetimeUserId: participant.racetimeUserId,
      playerId: participant.playerId,
    });
  }

  const players: Record<PlayerId, PlayerMapping> = {};
  for (const playerId of referencedDraftPlayerIds(draft)) {
    const player = draft.players[playerId];
    if (!player) {
      issues.push({
        code: "player_missing",
        message: `Referenced player "${playerId}" is missing from the draft.`,
      });
      continue;
    }
    if (player.playerId !== playerId) {
      issues.push({
        code: "player_id_mismatch",
        message: `Player key "${playerId}" does not match player.playerId "${player.playerId}".`,
      });
      continue;
    }
    if (
      player.racetime.state === "unresolved" ||
      player.speedrunCom.state === "unresolved" ||
      player.twitch.state === "unresolved"
    ) {
      issues.push({
        code: "identity_unresolved",
        message: `Player "${playerId}" has an unresolved identity.`,
      });
      continue;
    }
    players[playerId] = draftPlayerToPlayerMapping(player);
  }

  const draftSlots = draft.raceScreenSlots;
  const raceScreenSlots: ActiveRaceScreenSlots = structuredClone(draftSlots);

  if (issues.length > 0 || !race || !selection) {
    return { ok: false, issues };
  }

  const config: ActiveConfig = {
    revision: activeRevision,
    race: structuredClone(race),
    participants: structuredClone(participants),
    players: structuredClone(players),
    raceScreenSlots,
    commentatorPlayerIds: [...draft.commentatorPlayerIds],
    categorySelection: structuredClone(selection),
    categoryPresentation:
      draft.categoryPresentation === null ? null : structuredClone(draft.categoryPresentation),
  };

  return { ok: true, config };
}

/** Build the active snapshot from a frozen draft snapshot (independent copy). */
export function buildActiveSpeedrunSnapshot(
  frozen: DraftSpeedrunSnapshot,
  activeRevision: number,
): ActiveSpeedrunSnapshot {
  if (frozen.state !== "ready" || frozen.snapshot === null) {
    throw new ActiveConfigBuildError(
      "snapshot_not_ready",
      "Draft snapshot is not ready for apply.",
    );
  }
  return { activeRevision, snapshot: structuredClone(frozen.snapshot) };
}
