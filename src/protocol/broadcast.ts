export const BROADCAST_APPLY_MESSAGE = "broadcast.apply";
export type BroadcastApplyRequest = { expectedDraftRevision: number };
export type BroadcastApplyIssue = { code: string; message: string };
export type BroadcastApplyResponse =
  | {
      ok: true;
      appliedDraftRevision: number;
      activeRevision: number;
      raceId: string;
      snapshotId: string;
    }
  | {
      ok: false;
      reason:
        | "draft_changed"
        | "draft_not_ready"
        | "snapshot_not_ready"
        | "active_validation_failed"
        | "active_race_load_failed"
        | "apply_in_progress"
        | "operation_failed";
      message: string;
      issues?: BroadcastApplyIssue[];
    };
