import type { BroadcastStatusState } from "../../domain";

/**
 * Compute the draft broadcast status after a draft-only operation.
 *
 * `reconciliation_required` outranks everything: a pending RaceTime structural
 * change must not be hidden by a category edit. Otherwise a draft with
 * unresolved players stays `resolution_required`, and only a fully resolved
 * draft becomes `dirty` (never `ready` until snapshots exist).
 */
export function computeDraftBroadcastState(
  current: BroadcastStatusState | undefined,
  unresolvedPlayerCount: number,
): BroadcastStatusState {
  if (current === "reconciliation_required") {
    return "reconciliation_required";
  }
  return unresolvedPlayerCount > 0 ? "resolution_required" : "dirty";
}
