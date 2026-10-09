import { randomUUID } from "node:crypto";
import type {
  BroadcastStatusState,
  CategoryMapping,
  CategoryPresentation,
  DraftConfig,
  DraftPerson,
  DraftPersonRef,
  DraftRaceScreenSlots,
  DraftSpeedrunSnapshot,
  IntegrationStatus,
  RaceSession,
  RaceTimeEntrant,
} from "../../domain";
import {
  MAX_COMMENTATORS,
  categorySelectionFromMapping,
  createDraftPersonFromEntrant,
  retagDraftSpeedrunSnapshot,
} from "../../domain";
import {
  createDefaultDraftConfig,
  createDefaultDraftSpeedrunSnapshot,
  createDefaultIntegrationStatus,
} from "../../replicants/defaults";
import type { NodeCGLogger, Replicant } from "../../types/nodecg";
import { jsonEquals } from "../integrations/racetime/equality";
import {
  bindDraftPersonFromDirectory,
  createRaceTimePlayerIndex,
} from "../integrations/player-manager/mapper";
import type { Player, PlayerManagerGateway } from "../integrations/player-manager/types";
import { computeDraftBroadcastState } from "./broadcast-status";
import {
  nullCategoryPresetProvider,
  type CategoryPreset,
  type CategoryPresetProvider,
} from "./category-preset-provider";
import {
  countUnresolvedPeople,
  needsDraftReconciliation,
  participantSpeedrunUserIds,
  reconcileDraft,
  speedrunUserIdSetsEqual,
} from "./race-draft-reconciliation";
import type { RaceSessionService } from "./race-session-service";

export type RaceLoadFailureReason =
  "invalid_url" | "race_not_found" | "race_load_failed" | "draft_build_failed";
export type RaceLoadOutcome =
  | { ok: true; draftRevision: number; participantCount: number; unresolvedPlayerCount: number }
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
export type DraftIntegrityIssue = { code: string; message: string };
export type InitialDraftBuild = { draft: DraftConfig; matchedCount: number };
export type BuildInitialDraftOptions = {
  session: RaceSession;
  playerManager: PlayerManagerGateway;
  revision: number;
  personRefFactory?: () => DraftPersonRef;
  categoryPreset?: CategoryPreset;
};

function bindEntrantFromDirectory(
  entrant: RaceTimeEntrant,
  playersByRaceTimeId: ReadonlyMap<string, Player>,
  ref: DraftPersonRef,
): DraftPerson {
  const person = createDraftPersonFromEntrant({
    racetimeUserId: entrant.userId,
    racetimeName: entrant.name,
    twitchLogin: entrant.twitchLogin,
    ref,
  });
  return bindDraftPersonFromDirectory(person, entrant.userId, playersByRaceTimeId);
}

export async function buildInitialDraft(
  options: BuildInitialDraftOptions,
): Promise<InitialDraftBuild> {
  const race = options.session.race;
  const canonicalUrl = options.session.canonicalUrl;
  if (!race || !canonicalUrl) throw new Error("Cannot build a draft without a loaded race.");
  const makeRef = options.personRefFactory ?? randomUUID;
  const playersByRaceTimeId = createRaceTimePlayerIndex(await options.playerManager.list());
  const resolved = race.entrants.map((entrant) =>
    bindEntrantFromDirectory(entrant, playersByRaceTimeId, makeRef()),
  );
  const persons = Object.fromEntries(resolved.map((person) => [person.ref, person]));
  const participants = race.entrants.map((entrant, index) => ({
    racetimeUserId: entrant.userId,
    personRef: resolved[index]?.ref ?? makeRef(),
  }));
  const raceScreenSlots: DraftRaceScreenSlots = {
    1: participants[0]?.racetimeUserId ?? null,
    2: participants[1]?.racetimeUserId ?? null,
    3: participants[2]?.racetimeUserId ?? null,
    4: participants[3]?.racetimeUserId ?? null,
  };
  return {
    matchedCount: resolved.filter(
      (person) => person.resolution === "matched" && person.player !== null,
    ).length,
    draft: {
      revision: options.revision,
      race: {
        canonicalUrl,
        raceId: race.raceId,
        categorySlug: race.categorySlug,
        categoryName: race.categoryName,
        goal: race.goal,
      },
      participants,
      persons,
      raceScreenSlots,
      commentatorPlayerIds: [],
      commentators: {},
      categorySelection: categorySelectionFromMapping(options.categoryPreset?.mapping ?? null),
      categoryPresentation: options.categoryPreset?.presentation ?? null,
    },
  };
}

export function validateDraftIntegrity(draft: DraftConfig): DraftIntegrityIssue[] {
  const issues: DraftIntegrityIssue[] = [];
  const seenPlayers = new Set<string>();
  for (const participant of draft.participants) {
    const person = draft.persons[participant.personRef];
    if (
      !person ||
      person.ref !== participant.personRef ||
      person.identity.racetimeUserId !== participant.racetimeUserId
    ) {
      issues.push({
        code: "participant_person_missing",
        message: `Participant "${participant.racetimeUserId}" has no matching DraftPerson.`,
      });
      continue;
    }
    if (
      person.resolution === "matched" &&
      (!person.playerId || !person.player || person.player.playerId !== person.playerId)
    ) {
      issues.push({
        code: "participant_player_missing",
        message: `Participant "${participant.racetimeUserId}" has an incomplete matched Player.`,
      });
    }
    if (person.playerId) {
      if (seenPlayers.has(person.playerId))
        issues.push({
          code: "participant_player_duplicate",
          message: `Player "${person.playerId}" is assigned to more than one participant.`,
        });
      seenPlayers.add(person.playerId);
    }
  }
  const raceTimeIds = new Set(draft.participants.map((participant) => participant.racetimeUserId));
  const slotOwners = new Map<string, string>();
  for (const slot of ["1", "2", "3", "4"] as const) {
    const value = draft.raceScreenSlots[slot];
    if (value === null) continue;
    if (!raceTimeIds.has(value))
      issues.push({
        code: "slot_unknown_participant",
        message: `Race screen slot ${slot} references unknown participant "${value}".`,
      });
    const previous = slotOwners.get(value);
    if (previous !== undefined)
      issues.push({
        code: "slot_duplicate",
        message: `RaceTime user "${value}" is used in slots ${previous} and ${slot}.`,
      });
    else slotOwners.set(value, slot);
  }
  if (draft.commentatorPlayerIds.length > MAX_COMMENTATORS)
    issues.push({
      code: "commentator_too_many",
      message: `At most ${MAX_COMMENTATORS} commentators are allowed.`,
    });
  const seenCommentators = new Set<string>();
  for (const playerId of draft.commentatorPlayerIds) {
    if (seenCommentators.has(playerId))
      issues.push({
        code: "commentator_duplicate",
        message: `Commentator "${playerId}" is listed more than once.`,
      });
    seenCommentators.add(playerId);
    if (draft.commentators[playerId]?.playerId !== playerId)
      issues.push({
        code: "commentator_player_missing",
        message: `Commentator "${playerId}" has no Player Manager snapshot.`,
      });
  }
  return issues;
}

export type RaceDraftServiceOptions = {
  raceSessions: RaceSessionService;
  draftRaceSession: Replicant<RaceSession>;
  playerManager: PlayerManagerGateway;
  draftConfig: Replicant<DraftConfig>;
  draftSpeedrunSnapshot: Replicant<DraftSpeedrunSnapshot>;
  integrationStatus: Replicant<IntegrationStatus>;
  log: NodeCGLogger;
  personRefFactory?: () => DraftPersonRef;
  categoryPresets?: CategoryPresetProvider;
  refreshSnapshot?: (draftRevision: number) => Promise<{ ok: boolean; message?: string }>;
};

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class RaceDraftService {
  private readonly raceSessions: RaceSessionService;
  private readonly draftRaceSession: Replicant<RaceSession>;
  private readonly playerManager: PlayerManagerGateway;
  private readonly draftConfig: Replicant<DraftConfig>;
  private readonly draftSpeedrunSnapshot: Replicant<DraftSpeedrunSnapshot>;
  private readonly integrationStatus: Replicant<IntegrationStatus>;
  private readonly log: NodeCGLogger;
  private readonly personRefFactory: () => DraftPersonRef;
  private readonly categoryPresets: CategoryPresetProvider;
  private readonly refreshSnapshot?: RaceDraftServiceOptions["refreshSnapshot"];
  private suppressReconcile = false;

  constructor(options: RaceDraftServiceOptions) {
    this.raceSessions = options.raceSessions;
    this.draftRaceSession = options.draftRaceSession;
    this.playerManager = options.playerManager;
    this.draftConfig = options.draftConfig;
    this.draftSpeedrunSnapshot = options.draftSpeedrunSnapshot;
    this.integrationStatus = options.integrationStatus;
    this.log = options.log;
    this.personRefFactory = options.personRefFactory ?? randomUUID;
    this.categoryPresets = options.categoryPresets ?? nullCategoryPresetProvider;
    this.refreshSnapshot = options.refreshSnapshot;
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
      const built = await buildInitialDraft({
        session: result.session,
        playerManager: this.playerManager,
        personRefFactory: this.personRefFactory,
        revision: (this.draftConfig.value?.revision ?? 0) + 1,
        categoryPreset,
      });
      const candidate = built.draft;
      const integrityIssues = validateDraftIntegrity(candidate);
      if (integrityIssues.length)
        throw new Error(
          `Draft integrity check failed: ${integrityIssues.map((issue) => issue.message).join("; ")}`,
        );
      this.draftConfig.value = candidate;
      this.draftSpeedrunSnapshot.value = {
        draftRevision: candidate.revision,
        state: "empty",
        snapshot: null,
        message: null,
      };
      const unresolvedPlayerCount = countUnresolvedPeople(candidate);
      this.recomputeBroadcastState(candidate);
      this.logEvent("player_resolution.completed", {
        raceId: candidate.race?.raceId,
        participantCount: candidate.participants.length,
        matchedCount: built.matchedCount,
        unresolvedPlayerCount,
      });
      this.logEvent("race.load.completed", {
        raceId: candidate.race?.raceId,
        draftRevision: candidate.revision,
        participantCount: candidate.participants.length,
        unresolvedPlayerCount,
      });
      if (categoryPreset.mapping) this.refreshSnapshotForMappedCategory(candidate);
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
    if (!session?.race || !session.canonicalUrl)
      return { ok: false, reason: "no_race_loaded", message: "No race is loaded." };
    const draft = this.draftConfig.value ?? createDefaultDraftConfig();
    if (typeof expectedDraftRevision !== "number" || draft.revision !== expectedDraftRevision)
      return {
        ok: false,
        reason: "draft_changed",
        message: `Draft revision is ${draft.revision}, expected ${expectedDraftRevision}.`,
      };
    this.logEvent("race.reconcile.started", { draftRevision: draft.revision });
    try {
      const categoryChanged =
        draft.race?.categorySlug !== session.race.categorySlug ||
        draft.race?.goal !== session.race.goal;
      const categoryPreset = categoryChanged
        ? await this.loadCategoryPreset(session.race.categorySlug, session.race.goal)
        : undefined;
      const existing = new Map(
        draft.participants.map((participant) => [
          participant.racetimeUserId,
          draft.persons[participant.personRef],
        ]),
      );
      const playersByRaceTimeId = createRaceTimePlayerIndex(await this.playerManager.list());
      const newPersons = new Map<string, DraftPerson>();
      const updatedPersons = new Map<string, DraftPerson>();
      for (const entrant of session.race.entrants) {
        const existingPerson = existing.get(entrant.userId);
        const person = existingPerson
          ? {
              ...existingPerson,
              identity: {
                ...existingPerson.identity,
                racetimeUserId: entrant.userId,
                twitchLogin: entrant.twitchLogin,
              },
            }
          : createDraftPersonFromEntrant({
              racetimeUserId: entrant.userId,
              racetimeName: entrant.name,
              twitchLogin: entrant.twitchLogin,
              ref: this.personRefFactory(),
            });
        const boundPerson = bindDraftPersonFromDirectory(
          person,
          entrant.userId,
          playersByRaceTimeId,
        );
        if (existingPerson) updatedPersons.set(entrant.userId, boundPerson);
        else newPersons.set(entrant.userId, boundPerson);
      }
      const sourceIdsBefore = participantSpeedrunUserIds(draft);
      const outcome = reconcileDraft({
        draft,
        session,
        resolvedNewPersons: newPersons,
        resolvedExistingPersons: updatedPersons,
        categoryPreset,
      });
      const candidate = { ...outcome.draft, revision: draft.revision };
      const changed = !jsonEquals(candidate, draft);
      const finalDraft = changed ? { ...outcome.draft, revision: draft.revision + 1 } : draft;
      if (changed) {
        this.draftConfig.value = finalDraft;
        const srcSetChanged = !speedrunUserIdSetsEqual(
          sourceIdsBefore,
          participantSpeedrunUserIds(finalDraft),
        );
        this.draftSpeedrunSnapshot.value =
          outcome.participantsChanged || outcome.categoryChanged || srcSetChanged
            ? { draftRevision: finalDraft.revision, state: "empty", snapshot: null, message: null }
            : retagDraftSpeedrunSnapshot(
                this.draftSpeedrunSnapshot.value ?? createDefaultDraftSpeedrunSnapshot(),
                finalDraft.revision,
              );
      }
      this.recomputeBroadcastState(finalDraft);
      const unresolvedPlayerCount = countUnresolvedPeople(finalDraft);
      this.logEvent("race.reconcile.completed", {
        draftRevision: finalDraft.revision,
        changed,
        participantCount: finalDraft.participants.length,
        unresolvedPlayerCount,
      });
      if (outcome.categoryChanged && categoryPreset?.mapping) {
        this.refreshSnapshotForMappedCategory(finalDraft);
      }
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

  handleDraftSessionChange(session: RaceSession): void {
    if (this.suppressReconcile) return;
    const draft = this.draftConfig.value;
    if (!draft?.race || !needsDraftReconciliation(draft, session)) return;
    if (this.integrationStatus.value?.broadcast.state === "reconciliation_required") return;
    this.setBroadcastState("reconciliation_required", null, draft.revision);
    this.logEvent("race.reconciliation.required", {
      raceId: draft.race.raceId,
      draftRevision: draft.revision,
    });
  }

  private async loadCategoryPreset(categorySlug: string, goal: string): Promise<CategoryPreset> {
    return {
      mapping: await this.lookupMapping(categorySlug, goal),
      presentation: await this.lookupPresentation(categorySlug, goal),
    };
  }
  private async lookupMapping(categorySlug: string, goal: string): Promise<CategoryMapping | null> {
    try {
      return await this.categoryPresets.findMapping(categorySlug, goal);
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
      return await this.categoryPresets.findPresentation(categorySlug, goal);
    } catch (error) {
      this.logEvent("category.presentation.lookup.failed", { categorySlug, goal, error }, "error");
      return null;
    }
  }

  private refreshSnapshotForMappedCategory(draft: DraftConfig): void {
    if (!this.refreshSnapshot || draft.categorySelection.source !== "saved_mapping") return;
    void this.refreshSnapshot(draft.revision)
      .then((result) => {
        if (!result.ok) {
          this.logEvent(
            "race.category_mapping.snapshot_refresh_failed",
            {
              draftRevision: draft.revision,
              message: result.message ?? "Snapshot refresh failed.",
            },
            "warn",
          );
        }
      })
      .catch((error) => {
        this.logEvent(
          "race.category_mapping.snapshot_refresh_failed",
          { draftRevision: draft.revision, error },
          "warn",
        );
      });
  }

  private currentDraftRevision(): number | null {
    return this.draftConfig.value?.revision ?? null;
  }
  private recomputeBroadcastState(draft: DraftConfig): void {
    const current = this.integrationStatus.value ?? createDefaultIntegrationStatus();
    const snapshot = this.draftSpeedrunSnapshot.value ?? createDefaultDraftSpeedrunSnapshot();
    this.setBroadcastState(
      computeDraftBroadcastState({ current: current.broadcast.state, draft, snapshot }),
      null,
      draft.revision,
    );
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
    const parts = Object.entries(fields)
      .filter(([, value]) => value !== undefined)
      .map(
        ([key, value]) => `${key}=${value instanceof Error ? describeError(value) : String(value)}`,
      );
    const message = parts.length ? `[${event}] ${parts.join(" ")}` : `[${event}]`;
    if (level === "error") this.log.error(message);
    else if (level === "warn") this.log.warn(message);
    else this.log.info(message);
  }
}
