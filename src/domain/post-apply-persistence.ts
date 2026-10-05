import type { ActiveConfig } from "./config";
import type { RaceTimeUserId } from "./ids";

function cloneReplicantValue<T>(value: T): T {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) {
    throw new Error("Replicant value is not JSON-serializable.");
  }
  return JSON.parse(serialized) as T;
}

export type RaceHistoryPayload = {
  racetimeUrl: string;
  raceId: string;
  categorySlug: string;
  categoryName: string;
  goal: string;
  participants: Record<RaceTimeUserId, string>;
  raceScreenSlots: Record<1 | 2 | 3 | 4, RaceTimeUserId | null>;
  commentatorPlayerIds: string[];
};
export type PostApplyPersistenceItem = {
  activeRevision: number;
  appliedAt: string;
  raceHistory: RaceHistoryPayload;
  attempts: number;
  lastError: string | null;
};
export type PostApplyPersistenceState = {
  state: "idle" | "pending" | "saving" | "error";
  queue: PostApplyPersistenceItem[];
  lastSavedActiveRevision: number | null;
  message: string | null;
};
export function persistenceItemFromConfig(
  config: ActiveConfig,
  appliedAt: string,
): PostApplyPersistenceItem {
  return {
    activeRevision: config.revision,
    appliedAt,
    raceHistory: {
      racetimeUrl: config.race.canonicalUrl,
      raceId: config.race.raceId,
      categorySlug: config.race.categorySlug,
      categoryName: config.race.categoryName,
      goal: config.race.goal,
      participants: Object.fromEntries(
        config.participants.map((p) => [p.racetimeUserId, p.playerId]),
      ),
      raceScreenSlots: cloneReplicantValue(config.raceScreenSlots),
      commentatorPlayerIds: [...config.commentatorPlayerIds],
    },
    attempts: 0,
    lastError: null,
  };
}
