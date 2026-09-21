export const PERSISTENCE_RETRY_MESSAGE = "broadcast.persistence.retry";
export type PersistenceRetryResponse =
  | { ok: true; processed: number; remaining: number }
  | {
      ok: false;
      reason: "persistence_unavailable" | "persistence_in_progress" | "persistence_failed";
      message: string;
      remaining: number;
    };
