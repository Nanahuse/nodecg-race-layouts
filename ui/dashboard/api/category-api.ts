import { nodecg } from "./nodecg-client";
import {
  CATEGORY_MAPPING_REGISTER_MESSAGE,
  CATEGORY_MAPPING_REVERT_MESSAGE,
  CATEGORY_MAPPING_UPDATE_MESSAGE,
  CATEGORY_PRESENTATION_REVERT_MESSAGE,
  CATEGORY_PRESENTATION_SAVE_MESSAGE,
  CATEGORY_PRESENTATION_UPDATE_MESSAGE,
  CATEGORY_SELECT_MESSAGE,
  type CategoryResponse,
} from "../../../src/protocol/category";
export function createCategoryApi(getRevision: () => number) {
  const send = (name: string, data: object) => nodecg.sendMessage<CategoryResponse>(name, data);
  return {
    select: (selection: unknown) =>
      send(CATEGORY_SELECT_MESSAGE, { expectedDraftRevision: getRevision(), selection }),
    registerMapping: () =>
      send(CATEGORY_MAPPING_REGISTER_MESSAGE, { expectedDraftRevision: getRevision() }),
    updateMapping: () =>
      send(CATEGORY_MAPPING_UPDATE_MESSAGE, { expectedDraftRevision: getRevision() }),
    revertMapping: () =>
      send(CATEGORY_MAPPING_REVERT_MESSAGE, { expectedDraftRevision: getRevision() }),
    updatePresentation: (presentation: unknown) =>
      send(CATEGORY_PRESENTATION_UPDATE_MESSAGE, {
        expectedDraftRevision: getRevision(),
        presentation,
      }),
    savePresentation: () =>
      send(CATEGORY_PRESENTATION_SAVE_MESSAGE, { expectedDraftRevision: getRevision() }),
    revertPresentation: () =>
      send(CATEGORY_PRESENTATION_REVERT_MESSAGE, { expectedDraftRevision: getRevision() }),
  };
}
