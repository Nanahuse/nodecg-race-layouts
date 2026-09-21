import type { ActiveConfig } from "./config";
import type { PlayerMapping } from "./player";
import type { RaceTimeUserId } from "./ids";

export type RaceHistoryPayload = {
  racetimeUrl: string;
  raceId: string;
  categorySlug: string;
  categoryName: string;
  goal: string;
  participants: Record<RaceTimeUserId, string>;
  raceScreenSlots: { 1: RaceTimeUserId; 2: RaceTimeUserId; 3: RaceTimeUserId; 4: RaceTimeUserId };
  commentatorPlayerIds: string[];
};
export type PostApplyPersistenceItem = {
  activeRevision: number;
  appliedAt: string;
  players: PlayerMapping[];
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
    players: structuredClone(Object.values(config.players)),
    raceHistory: {
      racetimeUrl: config.race.canonicalUrl,
      raceId: config.race.raceId,
      categorySlug: config.race.categorySlug,
      categoryName: config.race.categoryName,
      goal: config.race.goal,
      participants: Object.fromEntries(
        config.participants.map((p) => [p.racetimeUserId, p.playerId]),
      ),
      raceScreenSlots: structuredClone(config.raceScreenSlots),
      commentatorPlayerIds: [...config.commentatorPlayerIds],
    },
    attempts: 0,
    lastError: null,
  };
}
