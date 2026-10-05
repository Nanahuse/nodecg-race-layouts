import type {
  ActiveConfig,
  ActiveRaceParticipant,
  ActiveRaceScreenSlots,
  ActiveSpeedrunSnapshot,
  DraftConfig,
  DraftSpeedrunSnapshot,
  PlayerSnapshot,
} from "../../domain";
import type { PlayerId } from "../../domain/ids";

export type ActiveBuildIssue = { code: string; message: string };
export class ActiveConfigBuildError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "ActiveConfigBuildError";
    this.code = code;
  }
}
export type ActiveConfigBuildResult =
  { ok: true; config: ActiveConfig } | { ok: false; issues: ActiveBuildIssue[] };

export function buildActiveConfig(
  draft: DraftConfig,
  activeRevision: number,
): ActiveConfigBuildResult {
  const issues: ActiveBuildIssue[] = [];
  if (!draft.race) issues.push({ code: "race_missing", message: "Draft has no race." });
  const selection = draft.categorySelection.selection;
  if (!selection)
    issues.push({ code: "category_missing", message: "Draft has no category selection." });
  const participants: ActiveRaceParticipant[] = [];
  const players: Record<PlayerId, PlayerSnapshot> = {};
  for (const participant of draft.participants) {
    const person = draft.persons[participant.personRef];
    if (!person || person.resolution !== "matched" || !person.playerId || !person.player) {
      issues.push({
        code: "participant_unresolved",
        message: `Participant "${participant.racetimeUserId}" must be matched to a Player with a snapshot.`,
      });
      continue;
    }
    if (person.player.playerId !== person.playerId) {
      issues.push({
        code: "player_id_mismatch",
        message: `DraftPerson "${person.ref}" has a mismatched Player ID.`,
      });
      continue;
    }
    participants.push({ racetimeUserId: participant.racetimeUserId, playerId: person.playerId });
    players[person.playerId] = structuredClone(person.player);
  }
  const commentatorPlayerIds = [...draft.commentatorPlayerIds];
  for (const playerId of commentatorPlayerIds) {
    const player = draft.commentators[playerId];
    if (!player || player.playerId !== playerId) {
      issues.push({
        code: "commentator_snapshot_missing",
        message: `Commentator "${playerId}" has no Player Manager snapshot.`,
      });
      continue;
    }
    players[playerId] = structuredClone(player);
  }
  const raceScreenSlots: ActiveRaceScreenSlots = structuredClone(draft.raceScreenSlots);
  if (issues.length || !draft.race || !selection) return { ok: false, issues };
  return {
    ok: true,
    config: {
      revision: activeRevision,
      race: structuredClone(draft.race),
      participants: structuredClone(participants),
      players: structuredClone(players),
      raceScreenSlots,
      commentatorPlayerIds,
      categorySelection: structuredClone(selection),
      categoryPresentation:
        draft.categoryPresentation === null ? null : structuredClone(draft.categoryPresentation),
    },
  };
}

export function buildActiveSpeedrunSnapshot(
  frozen: DraftSpeedrunSnapshot,
  activeRevision: number,
): ActiveSpeedrunSnapshot {
  if (frozen.state !== "ready" || frozen.snapshot === null)
    throw new ActiveConfigBuildError(
      "snapshot_not_ready",
      "Draft snapshot is not ready for apply.",
    );
  return { activeRevision, snapshot: structuredClone(frozen.snapshot) };
}
