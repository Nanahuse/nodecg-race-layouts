import { describe, expect, it } from "vitest";

import { SheetValidationError } from "../src/extension/integrations/spreadsheet/errors";
import { SpreadsheetCategoryMappingsRepository } from "../src/extension/integrations/spreadsheet/category-mappings-repository";
import { SpreadsheetCategoryPresentationRepository } from "../src/extension/integrations/spreadsheet/category-presentation-repository";
import { FakeSpreadsheetClient } from "./support/fakes";
import {
  makeCategoryMapping,
  makeMappingRow,
  makePresentation,
  makePresentationRow,
  mappingSheetValues,
  presentationSheetValues,
} from "./support/category-fakes";

const UPDATED_AT = "2026-09-21T05:30:00.000Z";

function mappingsRepository(values: ReturnType<typeof mappingSheetValues>) {
  const client = new FakeSpreadsheetClient(values);
  const repository = new SpreadsheetCategoryMappingsRepository(client, {
    sheetName: "CategoryMappings",
    now: () => new Date(UPDATED_AT),
  });
  return { client, repository };
}

function presentationRepository(values: ReturnType<typeof presentationSheetValues>) {
  const client = new FakeSpreadsheetClient(values);
  const repository = new SpreadsheetCategoryPresentationRepository(client, {
    sheetName: "CategoryPresentation",
    now: () => new Date(UPDATED_AT),
  });
  return { client, repository };
}

describe("SpreadsheetCategoryMappingsRepository", () => {
  it("finds a mapping by category slug and goal", async () => {
    const { repository } = mappingsRepository(mappingSheetValues([makeMappingRow()]));
    const mapping = await repository.find("ootr", "Defeat Ganon");
    expect(mapping?.speedrunCom.gameId).toBe("j1l9qz1g");
  });

  it("returns null when there is no match", async () => {
    const { repository } = mappingsRepository(mappingSheetValues([makeMappingRow()]));
    expect(await repository.find("ootr", "Other Goal")).toBeNull();
  });

  it("updates an existing row instead of appending", async () => {
    const { client, repository } = mappingsRepository(mappingSheetValues([makeMappingRow()]));
    await repository.upsert(
      makeCategoryMapping({ speedrunCom: { ...makeCategoryMapping().speedrunCom, gameId: "new" } }),
    );
    expect(client.updates).toHaveLength(1);
    expect(client.appends).toHaveLength(0);
    expect(client.updates[0]?.values[0]?.[3]).toBe("new");
  });

  it("appends a new mapping", async () => {
    const { client, repository } = mappingsRepository(mappingSheetValues([]));
    await repository.upsert(makeCategoryMapping());
    expect(client.updates).toHaveLength(0);
    expect(client.appends).toHaveLength(1);
  });

  it("rejects a duplicate key for the whole sheet", async () => {
    const { repository } = mappingsRepository(
      mappingSheetValues([makeMappingRow(), makeMappingRow()]),
    );
    await expect(repository.find("ootr", "Defeat Ganon")).rejects.toBeInstanceOf(
      SheetValidationError,
    );
  });

  it("rejects an invalid row for the whole sheet", async () => {
    const { repository } = mappingsRepository(
      mappingSheetValues([makeMappingRow({ src_game_id: "" })]),
    );
    await expect(repository.find("ootr", "Defeat Ganon")).rejects.toBeInstanceOf(
      SheetValidationError,
    );
  });

  it("rejects an invalid incoming mapping", async () => {
    const { repository } = mappingsRepository(mappingSheetValues([]));
    await expect(
      repository.upsert(
        makeCategoryMapping({
          speedrunCom: { ...makeCategoryMapping().speedrunCom, gameId: "" },
        }),
      ),
    ).rejects.toBeInstanceOf(SheetValidationError);
  });
});

describe("SpreadsheetCategoryPresentationRepository", () => {
  it("finds a presentation by key", async () => {
    const { repository } = presentationRepository(presentationSheetValues([makePresentationRow()]));
    const presentation = await repository.find("ootr", "Defeat Ganon");
    expect(presentation?.title).toBe("Any%");
  });

  it("returns null when there is no match", async () => {
    const { repository } = presentationRepository(presentationSheetValues([makePresentationRow()]));
    expect(await repository.find("ootr", "Other")).toBeNull();
  });

  it("updates an existing row", async () => {
    const { client, repository } = presentationRepository(
      presentationSheetValues([makePresentationRow()]),
    );
    await repository.upsert("ootr", "Defeat Ganon", makePresentation({ title: "Updated" }));
    expect(client.updates).toHaveLength(1);
    expect(client.updates[0]?.values[0]?.[2]).toBe("Updated");
  });

  it("appends a new presentation", async () => {
    const { client, repository } = presentationRepository(presentationSheetValues([]));
    await repository.upsert("ootr", "Defeat Ganon", makePresentation());
    expect(client.appends).toHaveLength(1);
  });

  it("rejects a duplicate key for the whole sheet", async () => {
    const { repository } = presentationRepository(
      presentationSheetValues([makePresentationRow(), makePresentationRow()]),
    );
    await expect(repository.find("ootr", "Defeat Ganon")).rejects.toBeInstanceOf(
      SheetValidationError,
    );
  });
});
