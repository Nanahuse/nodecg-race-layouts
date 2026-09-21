import type { BroadcastStatusState, DraftConfig, DraftSpeedrunSnapshot } from "../../domain";
import { leaderboardKeyFromSelection, leaderboardKeysEqual } from "../../domain";
import { isDraftStructurallyReady } from "./draft-readiness";
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
 * structurally incomplete (`dirty`) > snapshot `error` > `ready` > `dirty`.
 * A snapshot is only `ready` when the draft is structurally ready and the
 * snapshot matches the current revision and leaderboard key.
 */
export function computeDraftBroadcastState(input: DraftBroadcastStateInput): BroadcastStatusState {
  const { current, draft, snapshot } = input;

  if (current === "reconciliation_required") {
    return "reconciliation_required";
  }
  // A snapshot refresh in progress must not be pushed back to dirty by an
  // unrelated readiness recompute.
  if (current === "fetching" && snapshot.state === "fetching") {
    return "fetching";
  }
  if (!draft.race) {
    return "empty";
  }
  if (countUnresolvedPlayers(draft) > 0) {
    return "resolution_required";
  }
  if (!isDraftStructurallyReady(draft)) {
    return "dirty";
  }
  if (snapshot.state === "error") {
    return "error";
  }

  const selection = draft.categorySelection.selection;
  if (
    selection &&
    snapshot.state === "ready" &&
    snapshot.snapshot !== null &&
    snapshot.draftRevision === draft.revision &&
    leaderboardKeysEqual(snapshot.snapshot.leaderboardKey, leaderboardKeyFromSelection(selection))
  ) {
    return "ready";
  }

  return "dirty";
}
