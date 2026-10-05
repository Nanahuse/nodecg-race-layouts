import type { DraftConfig, DraftSpeedrunSnapshot, RaceSession } from "../../../src/domain";
export const canApply = (state: string, pending: boolean) => state === "ready" && !pending;
export const canRetryPersistence = (state: string, queueLength: number, pending: boolean) =>
  state === "error" && queueLength > 0 && !pending;
export function buildBroadcastApplySummary(
  draft: DraftConfig,
  snapshot: DraftSpeedrunSnapshot,
  _session: RaceSession,
  activeRevision: number | null,
) {
  const display = (id: string | null) => {
    if (!id) return "Unassigned";
    const participant = draft.participants.find((item) => item.racetimeUserId === id);
    const person = participant ? draft.persons[participant.personRef] : undefined;
    return person?.player?.displayName ?? person?.resolution ?? id;
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
    commentators: draft.commentatorPlayerIds.map((id) => draft.commentators[id]?.displayName ?? id),
    activeRevision,
  };
}
