import type { SpeedrunComUserId } from "./ids";
import type { LeaderboardKey } from "./leaderboard-key";

export type WorldRecordHolder = {
  userId: string | null;
  name: string;
};

export type WorldRecord = {
  timeSeconds: number;
  formattedTime: string;

  holders: WorldRecordHolder[];
};

export type LeaderboardEntry = {
  rank: number;

  speedrunComUserId: string | null;
  speedrunComName: string;

  timeSeconds: number;
  formattedTime: string;
};

export type PersonalBest = {
  timeSeconds: number;
  formattedTime: string;
  rank: number | null;
};

/**
 * A normalized Speedrun.com snapshot. The leaderboard array is expected to
 * eventually hold the top 20 entries.
 */
export type SpeedrunSnapshot = {
  snapshotId: string;
  fetchedAt: string;

  leaderboardKey: LeaderboardKey;

  worldRecord: WorldRecord | null;

  leaderboard: LeaderboardEntry[];

  personalBests: Record<SpeedrunComUserId, PersonalBest | null>;
};

/**
 * Draft snapshot state. Kept separate from the active snapshot so that
 * fetching a new category in the draft can never bleed into the broadcast.
 */
export type DraftSpeedrunSnapshot = {
  draftRevision: number;

  state: "empty" | "fetching" | "ready" | "error";

  snapshot: SpeedrunSnapshot | null;

  message: string | null;
};

/** Active snapshot: tied to the active revision and always complete. */
export type ActiveSpeedrunSnapshot = {
  activeRevision: number;
  snapshot: SpeedrunSnapshot;
};
