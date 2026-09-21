export const CATEGORY_SELECT_MESSAGE = "category.select";
export const CATEGORY_MAPPING_REGISTER_MESSAGE = "category.mapping.register";
export const CATEGORY_MAPPING_UPDATE_MESSAGE = "category.mapping.update";
export const CATEGORY_MAPPING_REVERT_MESSAGE = "category.mapping.revert";
export const CATEGORY_PRESENTATION_UPDATE_MESSAGE = "category.presentation.update";
export const CATEGORY_PRESENTATION_SAVE_MESSAGE = "category.presentation.save";
export const CATEGORY_PRESENTATION_REVERT_MESSAGE = "category.presentation.revert";
export type CategorySelectRequest = { expectedDraftRevision: number; selection: unknown };
export type CategoryRevisionRequest = { expectedDraftRevision: number };
export type CategoryPresentationUpdateRequest = {
  expectedDraftRevision: number;
  presentation: unknown;
};
export type CategoryFailureReason =
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
export type CategoryResponse =
  | {
      ok: true;
      changed: boolean;
      draftRevision: number;
      savedMappingState?: "none" | "matches" | "overridden";
    }
  | { ok: false; reason: CategoryFailureReason; message: string };
