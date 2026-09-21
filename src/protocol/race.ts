export const RACE_LOAD_MESSAGE = "race.load";
export const RACE_RECONCILE_MESSAGE = "race.reconcile";
export type RaceLoadRequest = { url: string };
export type RaceLoadFailureReason =
  "invalid_url" | "race_not_found" | "race_load_failed" | "draft_build_failed";
export type RaceLoadResponse =
  | { ok: true; draftRevision: number; participantCount: number; unresolvedPlayerCount: number }
  | { ok: false; reason: RaceLoadFailureReason; message: string };
export type RaceLoadSuccess = Extract<RaceLoadResponse, { ok: true }>;
export type RaceLoadFailure = Extract<RaceLoadResponse, { ok: false }>;
export type RaceReconcileRequest = { expectedDraftRevision: number };
export type RaceReconcileFailureReason = "draft_changed" | "no_race_loaded" | "reconcile_failed";
export type RaceReconcileResponse =
  | {
      ok: true;
      changed: boolean;
      draftRevision: number;
      participantCount: number;
      unresolvedPlayerCount: number;
    }
  | { ok: false; reason: RaceReconcileFailureReason; message: string };
export type RaceReconcileSuccess = Extract<RaceReconcileResponse, { ok: true }>;
export type RaceReconcileFailure = Extract<RaceReconcileResponse, { ok: false }>;
