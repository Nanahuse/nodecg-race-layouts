/**
 * The full set of Replicants owned by this bundle. Schemas are generated from
 * `src/replicants/value-types.ts` into `schemas/<name>.json`, which is NodeCG's
 * default schema location.
 */
export const REPLICANT_NAMES = [
  "draft-race-session",
  "active-race-session",
  "player-directory",
  "draft-config",
  "active-config",
  "draft-speedrun-snapshot",
  "active-speedrun-snapshot",
  "race-overlay-data",
  "participant-list-data",
  "leaderboard-page-data",
  "race-result-page-data",
  "integration-status",
  "post-apply-persistence",
] as const;

export type ReplicantName = (typeof REPLICANT_NAMES)[number];
