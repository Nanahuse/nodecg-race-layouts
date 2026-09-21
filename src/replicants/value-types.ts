import type {
  ActiveConfig,
  ActiveSpeedrunSnapshot,
  DraftConfig,
  DraftSpeedrunSnapshot,
  IntegrationStatus,
  LeaderboardPageData,
  ParticipantListData,
  PlayerDirectory,
  RaceOverlayData,
  RaceResultPageData,
  RaceSession,
  PostApplyPersistenceState,
} from "../domain";
import type { ReplicantName } from "./names";

/**
 * Value type of each Replicant. These are the single source of truth from which
 * `schemas/*.json` is generated; do not hand-edit the generated schemas.
 *
 * A `| null` is used where the system legitimately starts empty and there is no
 * meaningful complete default (active config, active snapshot and the graphics
 * view models). The non-null branch is still fully constrained, so "active"
 * invariants remain enforced whenever a value is present.
 */
export type DraftRaceSessionValue = RaceSession;
export type ActiveRaceSessionValue = RaceSession;
export type PlayerDirectoryValue = PlayerDirectory;
export type DraftConfigValue = DraftConfig;
export type ActiveConfigValue = ActiveConfig | null;
export type DraftSpeedrunSnapshotValue = DraftSpeedrunSnapshot;
export type ActiveSpeedrunSnapshotValue = ActiveSpeedrunSnapshot | null;
export type RaceOverlayDataValue = RaceOverlayData | null;
export type ParticipantListDataValue = ParticipantListData | null;
export type LeaderboardPageDataValue = LeaderboardPageData | null;
export type RaceResultPageDataValue = RaceResultPageData | null;
export type PostApplyPersistenceValue = PostApplyPersistenceState;
export type IntegrationStatusValue = IntegrationStatus;

/** Maps each Replicant name to the TypeScript type it stores. */
export type ReplicantValueMap = {
  "draft-race-session": DraftRaceSessionValue;
  "active-race-session": ActiveRaceSessionValue;
  "player-directory": PlayerDirectoryValue;
  "draft-config": DraftConfigValue;
  "active-config": ActiveConfigValue;
  "draft-speedrun-snapshot": DraftSpeedrunSnapshotValue;
  "active-speedrun-snapshot": ActiveSpeedrunSnapshotValue;
  "race-overlay-data": RaceOverlayDataValue;
  "participant-list-data": ParticipantListDataValue;
  "leaderboard-page-data": LeaderboardPageDataValue;
  "race-result-page-data": RaceResultPageDataValue;
  "integration-status": IntegrationStatusValue;
  "post-apply-persistence": PostApplyPersistenceValue;
};

/** Compile-time guard that the map above covers every Replicant. */
export type ReplicantValueOf<N extends ReplicantName> = ReplicantValueMap[N];
