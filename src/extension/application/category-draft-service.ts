import type {
  BroadcastStatusState,
  CategoryMapping,
  CategoryPresentation,
  CategorySelectionState,
  DraftConfig,
  DraftSpeedrunSnapshot,
  IntegrationStatus,
  RaceSession,
} from "../../domain";
import {
  categorySelectionFromMapping,
  computeSavedMappingState,
  isLeaderboardEquivalent,
  retagDraftSpeedrunSnapshot,
  validateCategoryPresentation,
  validateCategorySelection,
} from "../../domain";
import {
  createDefaultDraftConfig,
  createDefaultDraftSpeedrunSnapshot,
  createDefaultIntegrationStatus,
} from "../../replicants/defaults";
import type { NodeCGLogger, Replicant } from "../../types/nodecg";
import { jsonEquals } from "../integrations/racetime/equality";
import type { CategoryMappingsRepository } from "../integrations/spreadsheet/category-mappings-repository";
import type { CategoryPresentationRepository } from "../integrations/spreadsheet/category-presentation-repository";
import { computeDraftBroadcastState } from "./broadcast-status";

type SavedMappingState = CategorySelectionState["savedMappingState"];

export type CategoryOperationFailureReason =
  | "draft_changed"
  | "no_race_loaded"
  | "invalid_selection"
  | "invalid_presentation"
  | "no_selection"
  | "no_presentation"
  | "mapping_already_exists"
  | "no_saved_mapping"
  | "no_saved_presentation"
  | "spreadsheet_unavailable"
  | "lookup_failed"
  | "save_failed"
  | "operation_failed";

export type CategorySelectOutcome =
  | {
      ok: true;
      changed: boolean;
      draftRevision: number;
      savedMappingState: SavedMappingState;
    }
  | { ok: false; reason: CategoryOperationFailureReason; message: string };

export type CategoryMutationOutcome =
  | { ok: true; changed: boolean; draftRevision: number }
  | { ok: false; reason: CategoryOperationFailureReason; message: string };

export type CategoryDraftServiceOptions = {
  draftConfig: Replicant<DraftConfig>;
  draftSpeedrunSnapshot: Replicant<DraftSpeedrunSnapshot>;
  draftRaceSession: Replicant<RaceSession>;
  integrationStatus: Replicant<IntegrationStatus>;
  mappingsRepository: CategoryMappingsRepository | null;
  presentationRepository: CategoryPresentationRepository | null;
  log: NodeCGLogger;
};

type RaceKey = {
  categorySlug: string;
  goal: string;
};

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

type CategoryFailure = {
  ok: false;
  reason: CategoryOperationFailureReason;
  message: string;
};

function fail(reason: CategoryOperationFailureReason, message: string): CategoryFailure {
  return { ok: false, reason, message };
}

/**
 * Owns category draft operations: manual selection, saved mapping
 * register/update/revert and presentation edit/save/revert.
 *
 * The per-race selection and the persisted mapping/presentation are kept
 * strictly separate: nothing here writes to the spreadsheet except the
 * explicit register/update/save operations.
 */
export class CategoryDraftService {
  private readonly draftConfig: Replicant<DraftConfig>;
  private readonly draftSpeedrunSnapshot: Replicant<DraftSpeedrunSnapshot>;
  private readonly draftRaceSession: Replicant<RaceSession>;
  private readonly integrationStatus: Replicant<IntegrationStatus>;
  private readonly mappingsRepository: CategoryMappingsRepository | null;
  private readonly presentationRepository: CategoryPresentationRepository | null;
  private readonly log: NodeCGLogger;

  constructor(options: CategoryDraftServiceOptions) {
    this.draftConfig = options.draftConfig;
    this.draftSpeedrunSnapshot = options.draftSpeedrunSnapshot;
    this.draftRaceSession = options.draftRaceSession;
    this.integrationStatus = options.integrationStatus;
    this.mappingsRepository = options.mappingsRepository;
    this.presentationRepository = options.presentationRepository;
    this.log = options.log;
  }

  async select(
    expectedDraftRevision: number,
    selectionValue: unknown,
  ): Promise<CategorySelectOutcome> {
    const draft = this.currentDraft();
    const key = this.raceKey(draft);
    if (!key) {
      return fail("no_race_loaded", "No race is loaded.");
    }
    if (draft.revision !== expectedDraftRevision) {
      return fail(
        "draft_changed",
        `Draft revision is ${draft.revision}, expected ${expectedDraftRevision}.`,
      );
    }

    const validation = validateCategorySelection(selectionValue);
    if (!validation.ok) {
      return fail("invalid_selection", validation.issues.map((i) => i.message).join("; "));
    }

    const lookup = await this.findMapping(key);
    const savedMapping = lookup.ok ? lookup.mapping : null;
    const nextState: CategorySelectionState = {
      selection: validation.selection,
      source: "manual",
      savedMappingState: computeSavedMappingState(validation.selection, savedMapping),
    };

    const changed = !jsonEquals(nextState, draft.categorySelection);
    if (!changed) {
      return {
        ok: true,
        changed: false,
        draftRevision: draft.revision,
        savedMappingState: nextState.savedMappingState,
      };
    }

    const invalidateSnapshot = !isLeaderboardEquivalent(
      draft.categorySelection.selection,
      validation.selection,
    );
    const next: DraftConfig = {
      ...draft,
      revision: draft.revision + 1,
      categorySelection: nextState,
    };
    this.commit(next, invalidateSnapshot);

    return {
      ok: true,
      changed: true,
      draftRevision: next.revision,
      savedMappingState: nextState.savedMappingState,
    };
  }

  async registerMapping(expectedDraftRevision: number): Promise<CategoryMutationOutcome> {
    const draft = this.currentDraft();
    const key = this.raceKey(draft);
    if (!key) {
      return fail("no_race_loaded", "No race is loaded.");
    }
    if (draft.revision !== expectedDraftRevision) {
      return fail("draft_changed", `Draft revision is ${draft.revision}.`);
    }
    const selection = draft.categorySelection.selection;
    if (!selection) {
      return fail("no_selection", "A category selection is required.");
    }
    if (!this.mappingsRepository) {
      return fail("spreadsheet_unavailable", "Spreadsheet integration is not configured.");
    }

    const lookup = await this.findMapping(key);
    if (!lookup.ok) {
      return fail("lookup_failed", lookup.message);
    }
    if (lookup.mapping) {
      return fail("mapping_already_exists", "A saved mapping already exists for this race.");
    }

    const mapping = this.buildMapping(key, draft, selection);
    if (!(await this.saveMapping(mapping))) {
      return fail("save_failed", "Failed to save the category mapping.");
    }

    return this.applySavedMappingState(draft);
  }

  async updateMapping(expectedDraftRevision: number): Promise<CategoryMutationOutcome> {
    const draft = this.currentDraft();
    const key = this.raceKey(draft);
    if (!key) {
      return fail("no_race_loaded", "No race is loaded.");
    }
    if (draft.revision !== expectedDraftRevision) {
      return fail("draft_changed", `Draft revision is ${draft.revision}.`);
    }
    const selection = draft.categorySelection.selection;
    if (!selection) {
      return fail("no_selection", "A category selection is required.");
    }
    if (!this.mappingsRepository) {
      return fail("spreadsheet_unavailable", "Spreadsheet integration is not configured.");
    }

    const lookup = await this.findMapping(key);
    if (!lookup.ok) {
      return fail("lookup_failed", lookup.message);
    }
    if (!lookup.mapping) {
      return fail("no_saved_mapping", "No saved mapping exists for this race.");
    }

    const mapping = this.buildMapping(key, draft, selection);
    if (!(await this.saveMapping(mapping))) {
      return fail("save_failed", "Failed to update the category mapping.");
    }

    return this.applySavedMappingState(draft);
  }

  async revertMapping(expectedDraftRevision: number): Promise<CategoryMutationOutcome> {
    const draft = this.currentDraft();
    const key = this.raceKey(draft);
    if (!key) {
      return fail("no_race_loaded", "No race is loaded.");
    }
    if (draft.revision !== expectedDraftRevision) {
      return fail("draft_changed", `Draft revision is ${draft.revision}.`);
    }
    if (!this.mappingsRepository) {
      return fail("spreadsheet_unavailable", "Spreadsheet integration is not configured.");
    }

    const lookup = await this.findMapping(key);
    if (!lookup.ok) {
      return fail("lookup_failed", lookup.message);
    }
    if (!lookup.mapping) {
      return fail("no_saved_mapping", "No saved mapping exists for this race.");
    }

    const nextState = categorySelectionFromMapping(lookup.mapping);
    const changed = !jsonEquals(nextState, draft.categorySelection);
    if (!changed) {
      return { ok: true, changed: false, draftRevision: draft.revision };
    }

    const invalidateSnapshot = !isLeaderboardEquivalent(
      draft.categorySelection.selection,
      nextState.selection,
    );
    const next: DraftConfig = {
      ...draft,
      revision: draft.revision + 1,
      categorySelection: nextState,
    };
    this.commit(next, invalidateSnapshot);

    return { ok: true, changed: true, draftRevision: next.revision };
  }

  async updatePresentation(
    expectedDraftRevision: number,
    presentationValue: unknown,
  ): Promise<CategoryMutationOutcome> {
    const draft = this.currentDraft();
    if (!this.raceKey(draft)) {
      return fail("no_race_loaded", "No race is loaded.");
    }
    if (draft.revision !== expectedDraftRevision) {
      return fail("draft_changed", `Draft revision is ${draft.revision}.`);
    }

    let presentation: CategoryPresentation | null;
    if (presentationValue === null) {
      presentation = null;
    } else {
      const validation = validateCategoryPresentation(presentationValue);
      if (!validation.ok) {
        return fail("invalid_presentation", validation.issues.map((i) => i.message).join("; "));
      }
      presentation = validation.presentation;
    }

    const changed = !jsonEquals(presentation, draft.categoryPresentation);
    if (!changed) {
      return { ok: true, changed: false, draftRevision: draft.revision };
    }

    const next: DraftConfig = {
      ...draft,
      revision: draft.revision + 1,
      categoryPresentation: presentation,
    };
    this.commit(next, false);

    return { ok: true, changed: true, draftRevision: next.revision };
  }

  async savePresentation(expectedDraftRevision: number): Promise<CategoryMutationOutcome> {
    const draft = this.currentDraft();
    const key = this.raceKey(draft);
    if (!key) {
      return fail("no_race_loaded", "No race is loaded.");
    }
    if (draft.revision !== expectedDraftRevision) {
      return fail("draft_changed", `Draft revision is ${draft.revision}.`);
    }
    const presentation = draft.categoryPresentation;
    if (!presentation) {
      return fail("no_presentation", "There is no presentation to save.");
    }
    if (!this.presentationRepository) {
      return fail("spreadsheet_unavailable", "Spreadsheet integration is not configured.");
    }

    this.setSpreadsheetStatus("saving", null);
    try {
      await this.presentationRepository.upsert(key.categorySlug, key.goal, presentation);
      this.setSpreadsheetStatus("saved", null);
      this.logEvent("category.presentation.saved", {
        categorySlug: key.categorySlug,
        goal: key.goal,
      });
    } catch (error) {
      const message = describeError(error);
      this.setSpreadsheetStatus("error", message);
      this.logEvent("category.presentation.save_failed", { error }, "error");
      return fail("save_failed", message);
    }

    return { ok: true, changed: false, draftRevision: draft.revision };
  }

  async revertPresentation(expectedDraftRevision: number): Promise<CategoryMutationOutcome> {
    const draft = this.currentDraft();
    const key = this.raceKey(draft);
    if (!key) {
      return fail("no_race_loaded", "No race is loaded.");
    }
    if (draft.revision !== expectedDraftRevision) {
      return fail("draft_changed", `Draft revision is ${draft.revision}.`);
    }
    if (!this.presentationRepository) {
      return fail("spreadsheet_unavailable", "Spreadsheet integration is not configured.");
    }

    const lookup = await this.findPresentation(key);
    if (!lookup.ok) {
      return fail("lookup_failed", lookup.message);
    }
    if (!lookup.presentation) {
      return fail("no_saved_presentation", "No saved presentation exists for this race.");
    }

    const changed = !jsonEquals(lookup.presentation, draft.categoryPresentation);
    if (!changed) {
      return { ok: true, changed: false, draftRevision: draft.revision };
    }

    const next: DraftConfig = {
      ...draft,
      revision: draft.revision + 1,
      categoryPresentation: lookup.presentation,
    };
    this.commit(next, false);

    return { ok: true, changed: true, draftRevision: next.revision };
  }

  private applySavedMappingState(draft: DraftConfig): CategoryMutationOutcome {
    const nextState: CategorySelectionState = {
      ...draft.categorySelection,
      savedMappingState: "matches",
    };
    const changed = !jsonEquals(nextState, draft.categorySelection);
    if (!changed) {
      return { ok: true, changed: false, draftRevision: draft.revision };
    }
    const next: DraftConfig = {
      ...draft,
      revision: draft.revision + 1,
      categorySelection: nextState,
    };
    this.commit(next, false);
    return { ok: true, changed: true, draftRevision: next.revision };
  }

  private buildMapping(
    key: RaceKey,
    draft: DraftConfig,
    selection: NonNullable<CategorySelectionState["selection"]>,
  ): CategoryMapping {
    return {
      racetime: {
        categorySlug: key.categorySlug,
        categoryName: draft.race?.categoryName ?? "",
        goal: key.goal,
      },
      speedrunCom: selection,
    };
  }

  private async saveMapping(mapping: CategoryMapping): Promise<boolean> {
    if (!this.mappingsRepository) {
      return false;
    }
    this.setSpreadsheetStatus("saving", null);
    try {
      await this.mappingsRepository.upsert(mapping);
      this.setSpreadsheetStatus("saved", null);
      this.logEvent("category.mapping.saved", {
        categorySlug: mapping.racetime.categorySlug,
        goal: mapping.racetime.goal,
      });
      return true;
    } catch (error) {
      this.setSpreadsheetStatus("error", describeError(error));
      this.logEvent("category.mapping.save_failed", { error }, "error");
      return false;
    }
  }

  private async findMapping(
    key: RaceKey,
  ): Promise<{ ok: true; mapping: CategoryMapping | null } | { ok: false; message: string }> {
    if (!this.mappingsRepository) {
      return { ok: false, message: "Spreadsheet integration is not configured." };
    }
    try {
      const mapping = await this.mappingsRepository.find(key.categorySlug, key.goal);
      this.logEvent("category.mapping.lookup.completed", {
        categorySlug: key.categorySlug,
        goal: key.goal,
        found: mapping !== null,
      });
      return { ok: true, mapping };
    } catch (error) {
      const message = describeError(error);
      this.setSpreadsheetStatus("error", message);
      this.logEvent("category.mapping.lookup.failed", { error }, "error");
      return { ok: false, message };
    }
  }

  private async findPresentation(
    key: RaceKey,
  ): Promise<
    { ok: true; presentation: CategoryPresentation | null } | { ok: false; message: string }
  > {
    if (!this.presentationRepository) {
      return { ok: false, message: "Spreadsheet integration is not configured." };
    }
    try {
      const presentation = await this.presentationRepository.find(key.categorySlug, key.goal);
      this.logEvent("category.presentation.lookup.completed", {
        categorySlug: key.categorySlug,
        goal: key.goal,
        found: presentation !== null,
      });
      return { ok: true, presentation };
    } catch (error) {
      const message = describeError(error);
      this.setSpreadsheetStatus("error", message);
      this.logEvent("category.presentation.lookup.failed", { error }, "error");
      return { ok: false, message };
    }
  }

  private currentDraft(): DraftConfig {
    return this.draftConfig.value ?? createDefaultDraftConfig();
  }

  private raceKey(draft: DraftConfig): RaceKey | null {
    if (!draft.race) {
      return null;
    }
    return { categorySlug: draft.race.categorySlug, goal: draft.race.goal };
  }

  private commit(next: DraftConfig, invalidateSnapshot: boolean): void {
    this.draftConfig.value = next;
    if (invalidateSnapshot) {
      this.draftSpeedrunSnapshot.value = {
        draftRevision: next.revision,
        state: "empty",
        snapshot: null,
        message: null,
      };
    } else {
      // The snapshot data is still valid for the new revision; just retag it.
      this.draftSpeedrunSnapshot.value = retagDraftSpeedrunSnapshot(
        this.draftSpeedrunSnapshot.value ?? createDefaultDraftSpeedrunSnapshot(),
        next.revision,
      );
    }
    const current = this.integrationStatus.value ?? createDefaultIntegrationStatus();
    const state = computeDraftBroadcastState({
      current: current.broadcast.state,
      draft: next,
      snapshot: this.draftSpeedrunSnapshot.value ?? createDefaultDraftSpeedrunSnapshot(),
    });
    this.setBroadcastState(state, next.revision);
  }

  private setBroadcastState(state: BroadcastStatusState, draftRevision: number): void {
    const current = this.integrationStatus.value ?? createDefaultIntegrationStatus();
    this.integrationStatus.value = {
      ...current,
      broadcast: { ...current.broadcast, state, draftRevision, message: null },
    };
  }

  private setSpreadsheetStatus(
    state: IntegrationStatus["spreadsheet"]["state"],
    message: string | null,
  ): void {
    const current = this.integrationStatus.value ?? createDefaultIntegrationStatus();
    this.integrationStatus.value = { ...current, spreadsheet: { state, message } };
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
