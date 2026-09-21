import type { BroadcastStatusState, DraftConfig, DraftSpeedrunSnapshot } from "../../domain";
import { leaderboardKeyFromSelection, leaderboardKeysEqual } from "../../domain";
import { countUnresolvedPlayers } from "./race-draft-reconciliation";

export type DraftBroadcastStateInput = {
  current: BroadcastStatusState | undefined;
  draft: DraftConfig;
  snapshot: DraftSpeedrunSnapshot;
};

/**
 * Compute the draft broadcast status.
 *
 * Priority: `reconciliation_required` (never hidden) > `resolution_required` >
 * snapshot `error` > `ready` (all prerequisites met) > `dirty`. A snapshot is
 * only `ready` when it matches the current draft revision and leaderboard key.
 */
export function computeDraftBroadcastState(input: DraftBroadcastStateInput): BroadcastStatusState {
  const { current, draft, snapshot } = input;

  if (current === "reconciliation_required") {
    return "reconciliation_required";
  }
  if (!draft.race) {
    return "empty";
  }
  if (countUnresolvedPlayers(draft) > 0) {
    return "resolution_required";
  }

  const selection = draft.categorySelection.selection;
  if (!selection) {
    return "dirty";
  }
  if (snapshot.state === "error") {
    return "error";
  }
  if (
    snapshot.state === "ready" &&
    snapshot.snapshot !== null &&
    snapshot.draftRevision === draft.revision &&
    leaderboardKeysEqual(snapshot.snapshot.leaderboardKey, leaderboardKeyFromSelection(selection))
  ) {
    return "ready";
  }

  return "dirty";
}
