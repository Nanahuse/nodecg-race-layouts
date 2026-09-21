import type {
  DraftConfig,
  DraftSpeedrunSnapshot,
  PlayerDirectory,
  RaceSession,
} from "../../../src/domain";
import { resolveDisplayName } from "../../../src/domain";
export const canApply = (state: string, pending: boolean) => state === "ready" && !pending;
export const canRetryPersistence = (state: string, queueLength: number, pending: boolean) =>
  state === "error" && queueLength > 0 && !pending;
export function buildBroadcastApplySummary(
  draft: DraftConfig,
  snapshot: DraftSpeedrunSnapshot,
  session: RaceSession,
  activeRevision: number | null,
  directory: PlayerDirectory,
) {
  const display = (id: string | null) => {
    if (!id) return "Unassigned";
    const participant = draft.participants.find((item) => item.racetimeUserId === id);
    const player = participant?.playerId ? draft.players[participant.playerId] : undefined;
    return (
      (player ? resolveDisplayName(player) : null) ??
      session.race?.entrants.find((item) => item.userId === id)?.name ??
      id
    );
  };
  return {
    raceId: draft.race?.raceId ?? "—",
    racetimeCategory: draft.race?.categoryName ?? "—",
    speedrunGame: draft.categorySelection.selection?.gameName ?? "—",
    speedrunCategory: draft.categorySelection.selection?.categoryName ?? "—",
    draftRevision: draft.revision,
    snapshotState: snapshot.state,
    snapshotFetchedAt: snapshot.snapshot?.fetchedAt ?? null,
    slots: ([1, 2, 3, 4] as const).map((slot) => display(draft.raceScreenSlots[slot])),
    commentators: draft.commentatorPlayerIds.map((id) => {
      const player = draft.players[id] ?? directory[id];
      return (player ? resolveDisplayName(player) : null) ?? id;
    }),
    activeRevision,
  };
}
