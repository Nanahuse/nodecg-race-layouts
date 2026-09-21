import type {
  BroadcastStatusState,
  CategoryMapping,
  CategoryPresentation,
  DraftConfig,
  DraftRaceScreenSlots,
  DraftSpeedrunSnapshot,
  IntegrationStatus,
  PlayerDirectory,
  RaceSession,
} from "../../domain";
import { categorySelectionFromMapping, retagDraftSpeedrunSnapshot } from "../../domain";
import {
  createDefaultDraftConfig,
  createDefaultDraftSpeedrunSnapshot,
  createDefaultIntegrationStatus,
} from "../../replicants/defaults";
import type { NodeCGLogger, Replicant } from "../../types/nodecg";
import { jsonEquals } from "../integrations/racetime/equality";
import {
  noopAutomaticIdentityResolver,
  type AutomaticIdentityResolver,
} from "./automatic-identity-resolution-service";
import { computeDraftBroadcastState } from "./broadcast-status";
import {
  nullCategoryPresetProvider,
  type CategoryPreset,
  type CategoryPresetProvider,
} from "./category-preset-provider";
import {
  createRandomPlayerIdFactory,
  resolvePlayers,
  type PlayerIdFactory,
  type PlayerResolutionResult,
} from "./player-resolution-service";
import {
  countUnresolvedPlayers,
  needsDraftReconciliation,
  participantSpeedrunUserIds,
  reconcileDraft,
  speedrunUserIdSetsEqual,
} from "./race-draft-reconciliation";
import type { RaceSessionService } from "./race-session-service";

export type RaceLoadFailureReason =
  "invalid_url" | "race_not_found" | "race_load_failed" | "draft_build_failed";

export type RaceLoadOutcome =
  | {
      ok: true;
      draftRevision: number;
      participantCount: number;
      unresolvedPlayerCount: number;
    }
  | { ok: false; reason: RaceLoadFailureReason; message: string };

export type RaceReconcileFailureReason = "draft_changed" | "no_race_loaded" | "reconcile_failed";

export type RaceReconcileOutcome =
  | {
      ok: true;
      changed: boolean;
      draftRevision: number;
      participantCount: number;
      unresolvedPlayerCount: number;
    }
  | { ok: false; reason: RaceReconcileFailureReason; message: string };

export type DraftIntegrityIssue = {
  code: string;
  message: string;
};

export type InitialDraftBuild = {
  draft: DraftConfig;
  resolution: PlayerResolutionResult;
};

export type BuildInitialDraftOptions = {
  session: RaceSession;
  directory: PlayerDirectory;
  playerIdFactory: PlayerIdFactory;
  revision: number;
  /** Persisted category preset for this race's category key, if any. */
  categoryPreset?: CategoryPreset;
};

/**
 * Build the first draft for a freshly loaded race. Pure: it never touches a
 * replicant and the only external input is the injected player id factory.
 */
export function buildInitialDraft(options: BuildInitialDraftOptions): InitialDraftBuild {
  const { session } = options;
  const race = session.race;
  const canonicalUrl = session.canonicalUrl;
  if (!race || !canonicalUrl) {
    throw new Error("Cannot build a draft without a loaded race.");
  }

  const resolution = resolvePlayers({
    entrants: race.entrants,
    directory: options.directory,
    playerIdFactory: options.playerIdFactory,
  });

  const raceScreenSlots: DraftRaceScreenSlots = {
    1: resolution.participants[0]?.racetimeUserId ?? null,
    2: resolution.participants[1]?.racetimeUserId ?? null,
    3: resolution.participants[2]?.racetimeUserId ?? null,
    4: resolution.participants[3]?.racetimeUserId ?? null,
  };

  return {
    resolution,
    draft: {
      revision: options.revision,
      race: {
        canonicalUrl,
        raceId: race.raceId,
        categorySlug: race.categorySlug,
        categoryName: race.categoryName,
        goal: race.goal,
      },
      participants: resolution.participants,
      players: resolution.players,
      raceScreenSlots,
      commentatorPlayerIds: [],
      categorySelection: categorySelectionFromMapping(options.categoryPreset?.mapping ?? null),
      categoryPresentation: options.categoryPreset?.presentation ?? null,
    },
  };
}

/** Lightweight integrity check run before a candidate draft is committed. */
export function validateDraftIntegrity(draft: DraftConfig): DraftIntegrityIssue[] {
  const issues: DraftIntegrityIssue[] = [];
  const seenPlayerIds = new Set<string>();

  for (const participant of draft.participants) {
    const playerId = participant.playerId;
    if (!playerId) {
      continue;
    }
    if (!draft.players[playerId]) {
      issues.push({
        code: "participant_player_missing",
        message: `Participant "${participant.racetimeUserId}" references unknown player "${playerId}".`,
      });
    }
    if (seenPlayerIds.has(playerId)) {
      issues.push({
        code: "participant_player_duplicate",
        message: `Player "${playerId}" is assigned to more than one participant.`,
      });
    }
    seenPlayerIds.add(playerId);
  }

  const participantRacetimeIds = new Set(
    draft.participants.map((participant) => participant.racetimeUserId),
  );
  for (const slot of ["1", "2", "3", "4"] as const) {
    const value = draft.raceScreenSlots[slot];
    if (value !== null && !participantRacetimeIds.has(value)) {
      issues.push({
        code: "slot_unknown_participant",
        message: `Race screen slot ${slot} references unknown participant "${value}".`,
      });
    }
  }

  return issues;
}

export type RaceDraftServiceOptions = {
  raceSessions: RaceSessionService;
  draftRaceSession: Replicant<RaceSession>;
  playerDirectory: Replicant<PlayerDirectory>;
  draftConfig: Replicant<DraftConfig>;
  draftSpeedrunSnapshot: Replicant<DraftSpeedrunSnapshot>;
  integrationStatus: Replicant<IntegrationStatus>;
  log: NodeCGLogger;
  playerIdFactory?: PlayerIdFactory;
  categoryPresets?: CategoryPresetProvider;
  automaticIdentityResolver?: AutomaticIdentityResolver;
};

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Owns the draft race workflow: `race.load` builds a draft from a RaceTime
 * session, and `race.reconcile` pulls RaceTime structural changes in on demand.
 * Active state is never touched here.
 */
export class RaceDraftService {
  private readonly raceSessions: RaceSessionService;
  private readonly draftRaceSession: Replicant<RaceSession>;
  private readonly playerDirectory: Replicant<PlayerDirectory>;
  private readonly draftConfig: Replicant<DraftConfig>;
  private readonly draftSpeedrunSnapshot: Replicant<DraftSpeedrunSnapshot>;
  private readonly integrationStatus: Replicant<IntegrationStatus>;
  private readonly log: NodeCGLogger;
  private readonly playerIdFactory: PlayerIdFactory;
  private readonly categoryPresets: CategoryPresetProvider;
  private readonly automaticIdentityResolver: AutomaticIdentityResolver;

  private suppressReconcile = false;

  constructor(options: RaceDraftServiceOptions) {
    this.raceSessions = options.raceSessions;
    this.draftRaceSession = options.draftRaceSession;
    this.playerDirectory = options.playerDirectory;
    this.draftConfig = options.draftConfig;
    this.draftSpeedrunSnapshot = options.draftSpeedrunSnapshot;
    this.integrationStatus = options.integrationStatus;
    this.log = options.log;
    this.playerIdFactory = options.playerIdFactory ?? createRandomPlayerIdFactory();
    this.categoryPresets = options.categoryPresets ?? nullCategoryPresetProvider;
    this.automaticIdentityResolver =
      options.automaticIdentityResolver ?? noopAutomaticIdentityResolver;
  }

  async loadRace(url: string): Promise<RaceLoadOutcome> {
    const safeUrl = typeof url === "string" ? url : "";
    this.logEvent("race.load.started", { url: safeUrl });
    this.suppressReconcile = true;

    try {
      this.setBroadcastState("loading", null, this.currentDraftRevision());

      const result = await this.raceSessions.loadRace("draft", safeUrl);
      if (!result.ok) {
        const reason: RaceLoadFailureReason =
          result.reason === "invalid_url"
            ? "invalid_url"
            : result.reason === "not_found"
              ? "race_not_found"
              : "race_load_failed";
        this.setBroadcastState("error", result.message, this.currentDraftRevision());
        this.logEvent("race.load.failed", { reason, message: result.message }, "error");
        return { ok: false, reason, message: result.message };
      }

      this.setBroadcastState("resolving", null, this.currentDraftRevision());

      const race = result.session.race;
      const categoryPreset = race
        ? await this.loadCategoryPreset(race.categorySlug, race.goal)
        : { mapping: null, presentation: null };

      const revision = (this.draftConfig.value?.revision ?? 0) + 1;
      const built = buildInitialDraft({
        session: result.session,
        directory: this.playerDirectory.value ?? {},
        playerIdFactory: this.playerIdFactory,
        revision,
        categoryPreset,
      });

      // Automatic Speedrun.com identity resolution runs on the candidate, before
      // the single commit, so the draft is never committed twice.
      const resolved = await this.automaticIdentityResolver.resolve(
        built.draft,
        this.playerDirectory.value ?? {},
      );
      const candidate = resolved.draft;

      const integrityIssues = validateDraftIntegrity(candidate);
      if (integrityIssues.length > 0) {
        throw new Error(
          `Draft integrity check failed: ${integrityIssues.map((issue) => issue.message).join("; ")}`,
        );
      }

      this.draftConfig.value = candidate;
      this.draftSpeedrunSnapshot.value = {
        draftRevision: candidate.revision,
        state: "empty",
        snapshot: null,
        message: null,
      };

      const unresolvedPlayerCount = countUnresolvedPlayers(candidate);
      this.recomputeBroadcastState(candidate);

      this.logEvent("player_resolution.completed", {
        raceId: candidate.race?.raceId,
        participantCount: candidate.participants.length,
        matchedCount: built.resolution.summary.matchedCount,
        autoLinkedCount: built.resolution.summary.autoLinkedCount,
        newPlayerCount: built.resolution.summary.newPlayerCount,
        unresolvedPlayerCount,
        autoSrcLinked: resolved.summary.linked,
      });
      this.logEvent("race.load.completed", {
        raceId: candidate.race?.raceId,
        draftRevision: candidate.revision,
        participantCount: candidate.participants.length,
        unresolvedPlayerCount,
      });

      return {
        ok: true,
        draftRevision: candidate.revision,
        participantCount: candidate.participants.length,
        unresolvedPlayerCount,
      };
    } catch (error) {
      const message = describeError(error);
      this.setBroadcastState("error", message, this.currentDraftRevision());
      this.logEvent("race.load.failed", { reason: "draft_build_failed", message }, "error");
      return { ok: false, reason: "draft_build_failed", message };
    } finally {
      this.suppressReconcile = false;
    }
  }

  async reconcile(expectedDraftRevision: number): Promise<RaceReconcileOutcome> {
    const session = this.draftRaceSession.value;
    if (!session || !session.race || !session.canonicalUrl) {
      return { ok: false, reason: "no_race_loaded", message: "No race is loaded." };
    }

    const draft = this.draftConfig.value ?? createDefaultDraftConfig();
    if (typeof expectedDraftRevision !== "number" || draft.revision !== expectedDraftRevision) {
      return {
        ok: false,
        reason: "draft_changed",
        message: `Draft revision is ${draft.revision}, expected ${expectedDraftRevision}.`,
      };
    }

    this.logEvent("race.reconcile.started", { draftRevision: draft.revision });

    try {
      const categoryKeyChanged =
        draft.race?.categorySlug !== session.race.categorySlug ||
        draft.race?.goal !== session.race.goal;
      const categoryPreset = categoryKeyChanged
        ? await this.loadCategoryPreset(session.race.categorySlug, session.race.goal)
        : undefined;

      const directory = this.playerDirectory.value ?? {};
      const srcUserIdsBefore = participantSpeedrunUserIds(draft);

      const outcome = reconcileDraft({
        draft,
        session,
        directory,
        playerIdFactory: this.playerIdFactory,
        categoryPreset,
      });

      // Automatic Speedrun.com identity resolution runs on the reconcile
      // candidate before the single commit.
      const resolved = await this.automaticIdentityResolver.resolve(outcome.draft, directory);
      const candidateNoRevision: DraftConfig = { ...resolved.draft, revision: draft.revision };
      const changed = !jsonEquals(candidateNoRevision, draft);
      const finalDraft = changed ? { ...resolved.draft, revision: draft.revision + 1 } : draft;

      if (changed) {
        this.draftConfig.value = finalDraft;
        const srcSetChanged = !speedrunUserIdSetsEqual(
          srcUserIdsBefore,
          participantSpeedrunUserIds(finalDraft),
        );
        if (outcome.participantsChanged || outcome.categoryChanged || srcSetChanged) {
          this.draftSpeedrunSnapshot.value = {
            draftRevision: finalDraft.revision,
            state: "empty",
            snapshot: null,
            message: null,
          };
        } else {
          this.draftSpeedrunSnapshot.value = retagDraftSpeedrunSnapshot(
            this.draftSpeedrunSnapshot.value ?? createDefaultDraftSpeedrunSnapshot(),
            finalDraft.revision,
          );
        }
      }

      this.recomputeBroadcastState(finalDraft);

      const unresolvedPlayerCount = countUnresolvedPlayers(finalDraft);
      this.logEvent("race.reconcile.completed", {
        draftRevision: finalDraft.revision,
        changed,
        participantCount: finalDraft.participants.length,
        unresolvedPlayerCount,
        autoSrcLinked: resolved.summary.linked,
      });

      return {
        ok: true,
        changed,
        draftRevision: finalDraft.revision,
        participantCount: finalDraft.participants.length,
        unresolvedPlayerCount,
      };
    } catch (error) {
      const message = describeError(error);
      this.logEvent("race.reconcile.failed", { message }, "error");
      return { ok: false, reason: "reconcile_failed", message };
    }
  }

  /**
   * Called by the race session service whenever the draft race session changes.
   * Marks the draft as needing reconciliation when RaceTime structural changes
   * are detected; the draft itself is never modified here.
   */
  handleDraftSessionChange(session: RaceSession): void {
    if (this.suppressReconcile) {
      return;
    }

    const draft = this.draftConfig.value;
    if (!draft || !draft.race) {
      return;
    }
    if (!needsDraftReconciliation(draft, session)) {
      return;
    }
    if (this.integrationStatus.value?.broadcast.state === "reconciliation_required") {
      return;
    }

    this.setBroadcastState("reconciliation_required", null, draft.revision);
    this.logEvent("race.reconciliation.required", {
      raceId: draft.race.raceId,
      draftRevision: draft.revision,
    });
  }

  private async loadCategoryPreset(categorySlug: string, goal: string): Promise<CategoryPreset> {
    const mapping = await this.lookupMapping(categorySlug, goal);
    const presentation = await this.lookupPresentation(categorySlug, goal);
    return { mapping, presentation };
  }

  private async lookupMapping(categorySlug: string, goal: string): Promise<CategoryMapping | null> {
    try {
      const mapping = await this.categoryPresets.findMapping(categorySlug, goal);
      this.logEvent("category.mapping.lookup.completed", {
        categorySlug,
        goal,
        found: mapping !== null,
      });
      return mapping;
    } catch (error) {
      this.logEvent("category.mapping.lookup.failed", { categorySlug, goal, error }, "error");
      return null;
    }
  }

  private async lookupPresentation(
    categorySlug: string,
    goal: string,
  ): Promise<CategoryPresentation | null> {
    try {
      const presentation = await this.categoryPresets.findPresentation(categorySlug, goal);
      this.logEvent("category.presentation.lookup.completed", {
        categorySlug,
        goal,
        found: presentation !== null,
      });
      return presentation;
    } catch (error) {
      this.logEvent("category.presentation.lookup.failed", { categorySlug, goal, error }, "error");
      return null;
    }
  }

  private currentDraftRevision(): number | null {
    return this.draftConfig.value?.revision ?? null;
  }

  private recomputeBroadcastState(draft: DraftConfig): void {
    const current = this.integrationStatus.value ?? createDefaultIntegrationStatus();
    const snapshot = this.draftSpeedrunSnapshot.value ?? createDefaultDraftSpeedrunSnapshot();
    const state = computeDraftBroadcastState({
      current: current.broadcast.state,
      draft,
      snapshot,
    });
    this.setBroadcastState(state, null, draft.revision);
  }

  private setBroadcastState(
    state: BroadcastStatusState,
    message: string | null,
    draftRevision: number | null,
  ): void {
    const current = this.integrationStatus.value ?? createDefaultIntegrationStatus();
    this.integrationStatus.value = {
      ...current,
      broadcast: {
        state,
        message,
        draftRevision,
        activeRevision: current.broadcast.activeRevision,
      },
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
      parts.push(`${key}=${value instanceof Error ? describeError(value) : String(value)}`);
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
