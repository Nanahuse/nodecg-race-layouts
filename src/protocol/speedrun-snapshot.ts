export const SPEEDRUN_SNAPSHOT_REFRESH_MESSAGE = "speedrun.snapshot.refresh";
export type SpeedrunSnapshotRefreshRequest = { expectedDraftRevision: number };
export type SpeedrunSnapshotResponse =
  | {
      ok: true;
      draftRevision: number;
      snapshotId: string;
      leaderboardEntries: number;
      participantPbCount: number;
      participantPbFailures: number;
    }
  | { ok: false; reason: string; message: string };
