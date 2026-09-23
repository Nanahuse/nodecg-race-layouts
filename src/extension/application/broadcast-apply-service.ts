import type {
  ActiveConfig,
  ActiveSpeedrunSnapshot,
  BroadcastStatusState,
  DraftConfig,
  DraftSpeedrunSnapshot,
  IntegrationStatus,
} from "../../domain";
import {
  leaderboardKeyFromSelection,
  leaderboardKeysEqual,
  validateActiveConfig,
} from "../../domain";
import {
  createDefaultDraftConfig,
  createDefaultDraftSpeedrunSnapshot,
  createDefaultIntegrationStatus,
} from "../../replicants/defaults";
import type { NodeCGLogger, Replicant } from "../../types/nodecg";
import {
  buildActiveConfig,
  buildActiveSpeedrunSnapshot,
  type ActiveBuildIssue,
} from "./active-config-builder";
import { computeDraftBroadcastState } from "./broadcast-status";
import { validateDraftReadiness } from "./draft-readiness";
import type { RaceSessionService } from "./race-session-service";
import type { PostApplyPersistenceSink } from "./post-apply-persistence-service";

export type BroadcastApplyFailureReason =
  | "draft_changed"
  | "draft_not_ready"
  | "snapshot_not_ready"
  | "active_validation_failed"
  | "active_race_load_failed"
  | "apply_in_progress"
  | "operation_failed";

export type BroadcastApplyIssue = {
  code: string;
  message: string;
};

export type BroadcastApplyOutcome =
  | {
      ok: true;
      appliedDraftRevision: number;
      activeRevision: number;
      raceId: string;
      snapshotId: string;
    }
  | {
      ok: false;
      reason: BroadcastApplyFailureReason;
      message: string;
      issues?: BroadcastApplyIssue[];
    };

export type BroadcastApplyServiceOptions = {
  raceSessions: RaceSessionService;
  draftConfig: Replicant<DraftConfig>;
  activeConfig: Replicant<ActiveConfig | null>;
  draftSpeedrunSnapshot: Replicant<DraftSpeedrunSnapshot>;
  activeSpeedrunSnapshot: Replicant<ActiveSpeedrunSnapshot | null>;
  integrationStatus: Replicant<IntegrationStatus>;
  log: NodeCGLogger;
  postApplyPersistence?: PostApplyPersistenceSink | null;
};

function fail(
  reason: BroadcastApplyFailureReason,
  message: string,
  issues?: BroadcastApplyIssue[],
): BroadcastApplyOutcome {
  return issues ? { ok: false, reason, message, issues } : { ok: false, reason, message };
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * NodeCG recursively wraps Replicant objects in Proxies. `structuredClone`
 * rejects Proxies, so detach JSON-backed Replicant values through JSON before
 * freezing the apply inputs.
 */
function cloneReplicantValue<T>(value: T): T {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) {
    throw new Error("Replicant value is not JSON-serializable.");
  }
  return JSON.parse(serialized) as T;
}

/**
 * Promotes a READY draft into the active broadcast state.
 *
 * The draft is frozen at apply start, so editing it while the active RaceTime
 * session loads does not abort or alter the apply.
 */
export class BroadcastApplyService {
  private readonly raceSessions: RaceSessionService;
  private readonly draftConfig: Replicant<DraftConfig>;
  private readonly activeConfig: Replicant<ActiveConfig | null>;
  private readonly draftSpeedrunSnapshot: Replicant<DraftSpeedrunSnapshot>;
  private readonly activeSpeedrunSnapshot: Replicant<ActiveSpeedrunSnapshot | null>;
  private readonly integrationStatus: Replicant<IntegrationStatus>;
  private readonly log: NodeCGLogger;

  private applying = false;
  private readonly postApplyPersistence: PostApplyPersistenceSink | null;

  constructor(options: BroadcastApplyServiceOptions) {
    this.raceSessions = options.raceSessions;
    this.draftConfig = options.draftConfig;
    this.activeConfig = options.activeConfig;
    this.draftSpeedrunSnapshot = options.draftSpeedrunSnapshot;
    this.activeSpeedrunSnapshot = options.activeSpeedrunSnapshot;
    this.integrationStatus = options.integrationStatus;
    this.log = options.log;
    this.postApplyPersistence = options.postApplyPersistence ?? null;
  }

  async apply(expectedDraftRevision: number): Promise<BroadcastApplyOutcome> {
    if (this.applying) {
      return fail("apply_in_progress", "Another apply is already in progress.");
    }
    this.applying = true;

    const previousActiveRevision = this.currentActiveRevision();

    try {
      const draft = this.draftConfig.value ?? createDefaultDraftConfig();
      if (draft.revision !== expectedDraftRevision) {
        return fail(
          "draft_changed",
          `Draft revision is ${draft.revision}, expected ${expectedDraftRevision}.`,
        );
      }

      // Freeze independent copies; never re-read the replicants below.
      const frozenDraft: DraftConfig = cloneReplicantValue(draft);
      const frozenSnapshot: DraftSpeedrunSnapshot = cloneReplicantValue(
        this.draftSpeedrunSnapshot.value ?? createDefaultDraftSpeedrunSnapshot(),
      );

      const readinessIssues = validateDraftReadiness(frozenDraft);
      if (readinessIssues.length > 0) {
        return fail(
          "draft_not_ready",
          readinessIssues.map((issue) => issue.message).join("; "),
          readinessIssues.map((issue) => ({ code: issue.code, message: issue.message })),
        );
      }

      const selection = frozenDraft.categorySelection.selection;
      if (!selection) {
        return fail("draft_not_ready", "Draft has no category selection.");
      }
      if (
        frozenSnapshot.state !== "ready" ||
        frozenSnapshot.snapshot === null ||
        frozenSnapshot.draftRevision !== frozenDraft.revision
      ) {
        return fail("snapshot_not_ready", "The draft snapshot is not ready for this revision.");
      }
      if (
        !leaderboardKeysEqual(
          frozenSnapshot.snapshot.leaderboardKey,
          leaderboardKeyFromSelection(selection),
        )
      ) {
        return fail(
          "snapshot_not_ready",
          "The draft snapshot does not match the current category selection.",
        );
      }

      const activeRevision = previousActiveRevision + 1;

      const configResult = buildActiveConfig(frozenDraft, activeRevision);
      if (!configResult.ok) {
        return fail(
          "active_validation_failed",
          configResult.issues.map((issue) => issue.message).join("; "),
          configResult.issues.map((issue: ActiveBuildIssue) => ({
            code: issue.code,
            message: issue.message,
          })),
        );
      }
      const activeConfig = configResult.config;

      const validationIssues = validateActiveConfig(activeConfig);
      if (validationIssues.length > 0) {
        return fail(
          "active_validation_failed",
          validationIssues.map((issue) => issue.message).join("; "),
          validationIssues.map((issue) => ({ code: issue.code, message: issue.message })),
        );
      }

      const activeSnapshot = buildActiveSpeedrunSnapshot(frozenSnapshot, activeRevision);

      this.logEvent("broadcast.apply.started", {
        draftRevision: frozenDraft.revision,
        previousActiveRevision,
        raceId: frozenDraft.race?.raceId,
        snapshotId: frozenSnapshot.snapshot.snapshotId,
      });

      // Candidate is complete; now touch broadcast status and do external I/O.
      this.writeBroadcast("applying", frozenDraft.revision, previousActiveRevision, null);
      this.logEvent("broadcast.apply.active_race_loading", {
        canonicalUrl: frozenDraft.race?.canonicalUrl,
      });

      const loadResult = await this.raceSessions.loadRace(
        "active",
        frozenDraft.race?.canonicalUrl ?? "",
      );
      if (!loadResult.ok) {
        const message = `Active RaceTime load failed: ${loadResult.message}`;
        this.logEvent("broadcast.apply.failed", { reason: "active_race_load_failed" }, "error");
        this.applyFailureStatus(message, previousActiveRevision);
        return fail("active_race_load_failed", message);
      }
      this.logEvent("broadcast.apply.active_race_loaded", {
        canonicalUrl: frozenDraft.race?.canonicalUrl,
      });

      // Synchronous commit section: no external I/O between these writes.
      this.activeConfig.value = activeConfig;
      this.activeSpeedrunSnapshot.value = activeSnapshot;
      this.recomputeAfterApply(activeRevision);
      try {
        this.postApplyPersistence?.enqueue(activeConfig);
      } catch (error) {
        this.log.error(`[broadcast.persistence.enqueue.failed] ${describeError(error)}`);
      }

      this.logEvent("broadcast.apply.completed", {
        appliedDraftRevision: frozenDraft.revision,
        activeRevision,
        raceId: activeConfig.race.raceId,
        snapshotId: activeSnapshot.snapshot.snapshotId,
      });

      return {
        ok: true,
        appliedDraftRevision: frozenDraft.revision,
        activeRevision,
        raceId: activeConfig.race.raceId,
        snapshotId: activeSnapshot.snapshot.snapshotId,
      };
    } catch (error) {
      const message = describeError(error);
      this.logEvent("broadcast.apply.failed", { reason: "operation_failed", message }, "error");
      this.applyFailureStatus(message, previousActiveRevision);
      return fail("operation_failed", message);
    } finally {
      this.applying = false;
    }
  }

  private currentActiveRevision(): number {
    const activeConfig = this.activeConfig.value;
    const activeSnapshot = this.activeSpeedrunSnapshot.value;
    const statusRevision = this.integrationStatus.value?.broadcast.activeRevision ?? 0;
    return Math.max(
      activeConfig?.revision ?? 0,
      activeSnapshot?.activeRevision ?? 0,
      statusRevision,
    );
  }

  private applyFailureStatus(message: string, previousActiveRevision: number): void {
    const current = this.integrationStatus.value ?? createDefaultIntegrationStatus();
    const draft = this.draftConfig.value ?? createDefaultDraftConfig();
    const snapshot = this.draftSpeedrunSnapshot.value ?? createDefaultDraftSpeedrunSnapshot();
    const base = computeDraftBroadcastState({
      current: current.broadcast.state,
      draft,
      snapshot,
    });
    const state: BroadcastStatusState =
      base === "reconciliation_required" || base === "resolution_required" ? base : "error";
    this.writeBroadcast(state, draft.revision, previousActiveRevision, message);
  }

  private recomputeAfterApply(activeRevision: number): void {
    const current = this.integrationStatus.value ?? createDefaultIntegrationStatus();
    const draft = this.draftConfig.value ?? createDefaultDraftConfig();
    const snapshot = this.draftSpeedrunSnapshot.value ?? createDefaultDraftSpeedrunSnapshot();
    const state = computeDraftBroadcastState({
      current: current.broadcast.state,
      draft,
      snapshot,
    });
    this.writeBroadcast(state, draft.revision, activeRevision, null);
  }

  private writeBroadcast(
    state: BroadcastStatusState,
    draftRevision: number,
    activeRevision: number,
    message: string | null,
  ): void {
    const current = this.integrationStatus.value ?? createDefaultIntegrationStatus();
    this.integrationStatus.value = {
      ...current,
      broadcast: { state, draftRevision, activeRevision, message },
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
      parts.push(`${key}=${String(value)}`);
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
