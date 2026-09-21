import type { ReplicantName } from "./names";

/**
 * Maps a Replicant name to the exported TypeScript type in
 * `src/replicants/value-types.ts` from which its JSON Schema is generated.
 */
export const REPLICANT_SCHEMA_TYPES: Record<ReplicantName, string> = {
  "draft-race-session": "DraftRaceSessionValue",
  "active-race-session": "ActiveRaceSessionValue",
  "player-directory": "PlayerDirectoryValue",
  "draft-config": "DraftConfigValue",
  "active-config": "ActiveConfigValue",
  "draft-speedrun-snapshot": "DraftSpeedrunSnapshotValue",
  "active-speedrun-snapshot": "ActiveSpeedrunSnapshotValue",
  "race-overlay-data": "RaceOverlayDataValue",
  "participant-list-data": "ParticipantListDataValue",
  "leaderboard-page-data": "LeaderboardPageDataValue",
  "race-result-page-data": "RaceResultPageDataValue",
  "integration-status": "IntegrationStatusValue",
};
