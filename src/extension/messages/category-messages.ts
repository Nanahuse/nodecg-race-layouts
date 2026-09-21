import type { NodeCG } from "../../types/nodecg";
import type { CategoryDraftService } from "../application/category-draft-service";

export const CATEGORY_SELECT_MESSAGE = "category.select";
export const CATEGORY_MAPPING_REGISTER_MESSAGE = "category.mapping.register";
export const CATEGORY_MAPPING_UPDATE_MESSAGE = "category.mapping.update";
export const CATEGORY_MAPPING_REVERT_MESSAGE = "category.mapping.revert";
export const CATEGORY_PRESENTATION_UPDATE_MESSAGE = "category.presentation.update";
export const CATEGORY_PRESENTATION_SAVE_MESSAGE = "category.presentation.save";
export const CATEGORY_PRESENTATION_REVERT_MESSAGE = "category.presentation.revert";

export type CategorySelectRequest = {
  expectedDraftRevision: number;
  selection: unknown;
};

export type CategoryRevisionRequest = {
  expectedDraftRevision: number;
};

export type CategoryPresentationUpdateRequest = {
  expectedDraftRevision: number;
  presentation: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function expectedRevision(data: unknown): number {
  return isRecord(data) && typeof data.expectedDraftRevision === "number"
    ? data.expectedDraftRevision
    : Number.NaN;
}

/**
 * Register the category message handlers. Business logic lives in
 * `CategoryDraftService`; these handlers only extract the request fields and
 * acknowledge the structured result.
 */
export function registerCategoryMessages(nodecg: NodeCG, service: CategoryDraftService): void {
  nodecg.listenFor(CATEGORY_SELECT_MESSAGE, async (data, ack) => {
    const selection = isRecord(data) ? data.selection : undefined;
    const response = await service.select(expectedRevision(data), selection);
    if (ack && !ack.handled) {
      ack(null, response);
    }
  });

  const revisionOnly = (messageName: string, run: (revision: number) => Promise<unknown>): void => {
    nodecg.listenFor(messageName, async (data, ack) => {
      const response = await run(expectedRevision(data));
      if (ack && !ack.handled) {
        ack(null, response);
      }
    });
  };

  revisionOnly(CATEGORY_MAPPING_REGISTER_MESSAGE, (revision) => service.registerMapping(revision));
  revisionOnly(CATEGORY_MAPPING_UPDATE_MESSAGE, (revision) => service.updateMapping(revision));
  revisionOnly(CATEGORY_MAPPING_REVERT_MESSAGE, (revision) => service.revertMapping(revision));
  revisionOnly(CATEGORY_PRESENTATION_SAVE_MESSAGE, (revision) =>
    service.savePresentation(revision),
  );
  revisionOnly(CATEGORY_PRESENTATION_REVERT_MESSAGE, (revision) =>
    service.revertPresentation(revision),
  );

  nodecg.listenFor(CATEGORY_PRESENTATION_UPDATE_MESSAGE, async (data, ack) => {
    const presentation = isRecord(data) ? data.presentation : undefined;
    const response = await service.updatePresentation(expectedRevision(data), presentation);
    if (ack && !ack.handled) {
      ack(null, response);
    }
  });
}
