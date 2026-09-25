import { randomUUID } from "node:crypto";

import type {
  DraftConfig,
  DraftSpeedrunSnapshot,
  IntegrationStatus,
  LeaderboardEntry,
  PersonalBest,
  SpeedrunSnapshot,
} from "../../domain";
import { leaderboardKeyFromSelection, leaderboardKeysEqual } from "../../domain";
import {
  createDefaultDraftConfig,
  createDefaultDraftSpeedrunSnapshot,
  createDefaultIntegrationStatus,
} from "../../replicants/defaults";
import type { NodeCGLogger, Replicant } from "../../types/nodecg";
import type { SpeedrunComClient } from "../integrations/speedruncom/client";
import {
  describeSpeedrunComError,
  SpeedrunComRateLimitedError,
} from "../integrations/speedruncom/errors";
import {
  canUseUnfilteredPersonalBests,
  leaderboardMatchesKey,
} from "../integrations/speedruncom/leaderboard";
import {
  mapWorldRecord,
  selectPersonalBest,
  toDomainLeaderboardEntry,
} from "../integrations/speedruncom/leaderboard-mapper";
import { computeDraftBroadcastState } from "./broadcast-status";
import { mapWithConcurrency } from "./concurrency";
import { countUnresolvedPlayers } from "./race-draft-reconciliation";
import type { SpeedrunOperationStatusCoordinator } from "./speedrun-status-coordinator";

export const DEFAULT_TOP_PLACES = 20;
export const DEFAULT_PB_CONCURRENCY = 4;

export type SpeedrunSnapshotFailureReason =
  | "draft_changed"
  | "no_race_loaded"
  | "category_not_selected"
  | "resolution_required"
  | "leaderboard_fetch_failed"
  | "operation_failed";

export type SpeedrunSnapshotRefreshOutcome =
  | {
      ok: true;
      draftRevision: number;
      snapshotId: string;
      leaderboardEntries: number;
      participantPbCount: number;
      participantPbFailures: number;
    }
  | { ok: false; reason: SpeedrunSnapshotFailureReason; message: string };

export type SpeedrunSnapshotServiceOptions = {
  client: SpeedrunComClient;
  status: SpeedrunOperationStatusCoordinator;
  draftConfig: Replicant<DraftConfig>;
  draftSpeedrunSnapshot: Replicant<DraftSpeedrunSnapshot>;
  integrationStatus: Replicant<IntegrationStatus>;
  log: NodeCGLogger;
  snapshotIdFactory?: () => string;
  clock?: () => Date;
  pbConcurrency?: number;
  topPlaces?: number;
};

function fail(
  reason: SpeedrunSnapshotFailureReason,
  message: string,
): SpeedrunSnapshotRefreshOutcome {
  return { ok: false, reason, message };
}

function linkedParticipantUserIds(draft: DraftConfig): string[] {
  const userIds = new Set<string>();
  for (const participant of draft.participants) {
    if (!participant.playerId) {
      continue;
    }
    const player = draft.players[participant.playerId];
    if (player?.speedrunCom.state === "linked") {
      userIds.add(player.speedrunCom.value.userId);
    }
  }
  return [...userIds];
}

type PbResult =
  { userId: string; ok: true; personalBest: PersonalBest | null } | { userId: string; ok: false };

/**
 * Builds `draft-speedrun-snapshot` from the current category selection and
 * participant Speedrun.com identities. Only draft state is written.
 */
export class SpeedrunSnapshotService {
  private readonly client: SpeedrunComClient;
  private readonly status: SpeedrunOperationStatusCoordinator;
  private readonly draftConfig: Replicant<DraftConfig>;
  private readonly draftSpeedrunSnapshot: Replicant<DraftSpeedrunSnapshot>;
  private readonly integrationStatus: Replicant<IntegrationStatus>;
  private readonly log: NodeCGLogger;
  private readonly snapshotIdFactory: () => string;
  private readonly clock: () => Date;
  private readonly pbConcurrency: number;
  private readonly topPlaces: number;

  constructor(options: SpeedrunSnapshotServiceOptions) {
    this.client = options.client;
    this.status = options.status;
    this.draftConfig = options.draftConfig;
    this.draftSpeedrunSnapshot = options.draftSpeedrunSnapshot;
    this.integrationStatus = options.integrationStatus;
    this.log = options.log;
    this.snapshotIdFactory = options.snapshotIdFactory ?? (() => randomUUID());
    this.clock = options.clock ?? (() => new Date());
    this.pbConcurrency = options.pbConcurrency ?? DEFAULT_PB_CONCURRENCY;
    this.topPlaces = options.topPlaces ?? DEFAULT_TOP_PLACES;
  }

  async refresh(expectedDraftRevision: number): Promise<SpeedrunSnapshotRefreshOutcome> {
    const draft = this.draftConfig.value ?? createDefaultDraftConfig();
    if (!draft.race) {
      return fail("no_race_loaded", "No race is loaded.");
    }
    const selection = draft.categorySelection.selection;
    if (!selection) {
      return fail("category_not_selected", "A category selection is required.");
    }
    if (draft.revision !== expectedDraftRevision) {
      return fail(
        "draft_changed",
        `Draft revision is ${draft.revision}, expected ${expectedDraftRevision}.`,
      );
    }
    if (countUnresolvedPlayers(draft) > 0) {
      return fail("resolution_required", "Some players still have unresolved identities.");
    }

    const key = leaderboardKeyFromSelection(selection);
    const startedRevision = draft.revision;
    const participantUserIds = linkedParticipantUserIds(draft);

    this.logEvent("speedrun.snapshot.refresh.started", {
      draftRevision: startedRevision,
      gameId: key.gameId,
      categoryId: key.categoryId,
      levelId: key.levelId,
    });
    this.writeSnapshot({
      draftRevision: startedRevision,
      state: "fetching",
      snapshot: null,
      message: null,
    });
    this.setBroadcastFetching(startedRevision);

    // 1. Leaderboard is required for a usable snapshot.
    let leaderboard;
    try {
      leaderboard = await this.status.run("snapshot.leaderboard", () =>
        this.client.getLeaderboard(key, this.topPlaces),
      );
    } catch (error) {
      const message = describeSpeedrunComError(error);
      if (this.currentRevision() !== startedRevision) {
        return fail("draft_changed", "Draft changed while the leaderboard was loading.");
      }
      this.writeSnapshot({
        draftRevision: startedRevision,
        state: "error",
        snapshot: null,
        message,
      });
      this.recomputeBroadcast();
      this.logEvent("speedrun.snapshot.refresh.failed", { message }, "error");
      return fail("leaderboard_fetch_failed", message);
    }

    if (!leaderboardMatchesKey(leaderboard, key)) {
      const message = "Leaderboard response does not match the requested conditions.";
      if (this.currentRevision() !== startedRevision) {
        return fail("draft_changed", "Draft changed while the leaderboard was loading.");
      }
      this.writeSnapshot({
        draftRevision: startedRevision,
        state: "error",
        snapshot: null,
        message,
      });
      this.recomputeBroadcast();
      this.logEvent("speedrun.snapshot.refresh.failed", { message }, "error");
      return fail("leaderboard_fetch_failed", message);
    }

    // 2. Top 20 places (ties may exceed 20 runs).
    const warnings: string[] = [];
    const domainEntries: LeaderboardEntry[] = [];
    const entryByUserId = new Map<string, LeaderboardEntry>();
    for (const entry of leaderboard.entries) {
      const domainEntry = toDomainLeaderboardEntry(entry);
      if (!domainEntry) {
        warnings.push(`Excluded a multi-player run at place ${entry.place}.`);
        continue;
      }
      domainEntries.push(domainEntry);
      if (
        domainEntry.speedrunComUserId !== null &&
        !entryByUserId.has(domainEntry.speedrunComUserId)
      ) {
        entryByUserId.set(domainEntry.speedrunComUserId, domainEntry);
      }
    }
    const worldRecord = mapWorldRecord(leaderboard.entries);

    // 3. Participant personal bests.
    const personalBests: Record<string, PersonalBest | null> = {};
    const toFetch: string[] = [];
    for (const userId of participantUserIds) {
      const topEntry = entryByUserId.get(userId);
      if (topEntry) {
        personalBests[userId] = {
          timeSeconds: topEntry.timeSeconds,
          formattedTime: topEntry.formattedTime,
          rank: topEntry.rank,
        };
        continue;
      }
      toFetch.push(userId);
    }

    let stopFetching = false;
    let participantPbFailures = 0;
    const usePersonalBestsEndpoint = canUseUnfilteredPersonalBests(key);
    const pbResults = await mapWithConcurrency(
      toFetch,
      this.pbConcurrency,
      async (userId): Promise<PbResult> => {
        if (stopFetching) {
          return { userId, ok: false };
        }
        try {
          const entries = usePersonalBestsEndpoint
            ? await this.status.run("snapshot.personal_bests", () =>
                this.client.getUserPersonalBests(userId, key.gameId),
              )
            : await this.status.run("snapshot.user_runs", () =>
                this.client.getUserRuns(userId, key),
              );
          return {
            userId,
            ok: true,
            personalBest: selectPersonalBest(entries, key),
          };
        } catch (error) {
          if (error instanceof SpeedrunComRateLimitedError) {
            stopFetching = true;
          }
          return { userId, ok: false };
        }
      },
    );

    for (const result of pbResults) {
      if (result.ok) {
        personalBests[result.userId] = result.personalBest;
      } else {
        personalBests[result.userId] = null;
        participantPbFailures += 1;
      }
    }

    // 4. Re-check revision and compatibility before committing.
    const currentRevision = this.currentRevision();
    if (currentRevision !== startedRevision) {
      return fail("draft_changed", "Draft changed while the snapshot was being built.");
    }
    const currentSelection = this.draftConfig.value?.categorySelection.selection;
    if (
      !currentSelection ||
      !leaderboardKeysEqual(leaderboardKeyFromSelection(currentSelection), key)
    ) {
      return fail(
        "draft_changed",
        "Category selection changed while the snapshot was being built.",
      );
    }

    const messages = [...warnings];
    if (participantPbFailures > 0) {
      messages.push(`PB lookup failed for ${participantPbFailures} participant(s).`);
    }

    const snapshot: SpeedrunSnapshot = {
      snapshotId: this.snapshotIdFactory(),
      fetchedAt: this.clock().toISOString(),
      leaderboardKey: key,
      worldRecord,
      leaderboard: domainEntries,
      personalBests,
    };

    this.writeSnapshot({
      draftRevision: currentRevision,
      state: "ready",
      snapshot,
      message: messages.length > 0 ? messages.join(" ") : null,
    });
    this.recomputeBroadcast();

    const participantPbCount = Object.keys(personalBests).length;
    this.logEvent("speedrun.snapshot.refresh.completed", {
      snapshotId: snapshot.snapshotId,
      draftRevision: currentRevision,
      leaderboardEntries: domainEntries.length,
      participantPbCount,
      participantPbFailures,
    });

    return {
      ok: true,
      draftRevision: currentRevision,
      snapshotId: snapshot.snapshotId,
      leaderboardEntries: domainEntries.length,
      participantPbCount,
      participantPbFailures,
    };
  }

  private currentRevision(): number {
    return this.draftConfig.value?.revision ?? 0;
  }

  private writeSnapshot(snapshot: DraftSpeedrunSnapshot): void {
    this.draftSpeedrunSnapshot.value = snapshot;
  }

  private setBroadcastFetching(draftRevision: number): void {
    const current = this.integrationStatus.value ?? createDefaultIntegrationStatus();
    this.integrationStatus.value = {
      ...current,
      broadcast: { ...current.broadcast, state: "fetching", draftRevision, message: null },
    };
  }

  private recomputeBroadcast(): void {
    const current = this.integrationStatus.value ?? createDefaultIntegrationStatus();
    const draft = this.draftConfig.value ?? createDefaultDraftConfig();
    const snapshot = this.draftSpeedrunSnapshot.value ?? createDefaultDraftSpeedrunSnapshot();
    const state = computeDraftBroadcastState({
      current: current.broadcast.state,
      draft,
      snapshot,
    });
    this.integrationStatus.value = {
      ...current,
      broadcast: { ...current.broadcast, state, draftRevision: draft.revision, message: null },
    };
  }

  private logEvent(
    event: string,
    fields: Record<string, unknown>,
    level: "info" | "warn" | "error" = "info",
  ): void {
    const parts: string[] = [];
    for (const [key, value] of Object.entries(fields)) {
      if (value === undefined) {
        continue;
      }
      parts.push(
        `${key}=${value instanceof Error ? describeSpeedrunComError(value) : String(value)}`,
      );
    }
    const message = parts.length > 0 ? `[${event}] ${parts.join(" ")}` : `[${event}]`;

    if (level === "error") {
      this.log.error(message);
    } else if (level === "warn") {
      this.log.warn(message);
    } else {
      this.log.info(message);
    }
  }
}
