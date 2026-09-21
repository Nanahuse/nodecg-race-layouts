import type { DraftConfig, DraftSpeedrunSnapshot, IntegrationStatus, RaceSession } from "../domain";
import type { ReplicantName } from "./names";
import type { ReplicantValueMap } from "./value-types";

export function createDefaultRaceSession(): RaceSession {
  return {
    revision: 0,
    canonicalUrl: null,
    connection: { state: "disconnected", message: null },
    race: null,
  };
}

export function createDefaultDraftConfig(): DraftConfig {
  return {
    revision: 0,
    race: null,
    participants: [],
    players: {},
    raceScreenSlots: { 1: null, 2: null, 3: null, 4: null },
    commentatorPlayerIds: [],
    categorySelection: { selection: null, source: null, savedMappingState: "none" },
    categoryPresentation: null,
  };
}

export function createDefaultDraftSpeedrunSnapshot(): DraftSpeedrunSnapshot {
  return {
    draftRevision: 0,
    state: "empty",
    snapshot: null,
    message: null,
  };
}

export function createDefaultIntegrationStatus(): IntegrationStatus {
  return {
    racetime: { state: "disconnected", message: null },
    speedrunCom: { state: "idle", message: null },
    spreadsheet: { state: "idle", message: null },
    broadcast: {
      state: "empty",
      draftRevision: null,
      activeRevision: null,
      message: null,
    },
  };
}

/** A single Replicant declaration, typed against its value type. */
export type ReplicantDefinition = {
  [N in ReplicantName]: {
    name: N;
    defaultValue: ReplicantValueMap[N];
    persistent: boolean;
  };
}[ReplicantName];

/**
 * Safe initial values. Active config and the graphics view models start as
 * `null` because there is no meaningful "complete" empty value; they are only
 * populated once a race is applied.
 */
export const REPLICANT_DEFINITIONS: readonly ReplicantDefinition[] = [
  {
    name: "draft-race-session",
    defaultValue: createDefaultRaceSession(),
    persistent: true,
  },
  {
    name: "active-race-session",
    defaultValue: createDefaultRaceSession(),
    persistent: true,
  },
  {
    name: "player-directory",
    defaultValue: {},
    persistent: true,
  },
  {
    name: "draft-config",
    defaultValue: createDefaultDraftConfig(),
    persistent: true,
  },
  {
    name: "active-config",
    defaultValue: null,
    persistent: true,
  },
  {
    name: "draft-speedrun-snapshot",
    defaultValue: createDefaultDraftSpeedrunSnapshot(),
    persistent: true,
  },
  {
    name: "active-speedrun-snapshot",
    defaultValue: null,
    persistent: true,
  },
  {
    name: "race-overlay-data",
    defaultValue: null,
    persistent: false,
  },
  {
    name: "participant-list-data",
    defaultValue: null,
    persistent: false,
  },
  {
    name: "leaderboard-page-data",
    defaultValue: null,
    persistent: false,
  },
  {
    name: "race-result-page-data",
    defaultValue: null,
    persistent: false,
  },
  {
    name: "integration-status",
    defaultValue: createDefaultIntegrationStatus(),
    persistent: true,
  },
  {
    name: "post-apply-persistence",
    defaultValue: { state: "idle", queue: [], lastSavedActiveRevision: null, message: null },
    persistent: true,
  },
];
