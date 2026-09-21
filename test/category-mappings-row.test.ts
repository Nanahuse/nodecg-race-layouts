import { describe, expect, it } from "vitest";

import {
  CATEGORY_MAPPING_ROW_ISSUE_CODES,
  categoryMappingSheetRowToMapping,
  categoryMappingToSheetRow,
  type CategoryMappingSheetRow,
} from "../src/extension/integrations/spreadsheet/category-mappings-row";
import { makeCategoryMapping, makeMappingRow } from "./support/category-fakes";

const UPDATED_AT = "2026-09-21T05:30:00.000Z";

function convert(row: ReturnType<typeof makeMappingRow>) {
  const result = categoryMappingSheetRowToMapping(row);
  if (!result.ok) {
    throw new Error(`expected conversion to succeed: ${JSON.stringify(result.issues)}`);
  }
  return result.mapping;
}

describe("categoryMappingSheetRowToMapping", () => {
  it("converts a complete mapping", () => {
    const mapping = convert(makeMappingRow());
    expect(mapping.racetime).toEqual({
      categorySlug: "ootr",
      categoryName: "Ocarina of Time Randomizer",
      goal: "Defeat Ganon",
    });
    expect(mapping.speedrunCom).toEqual({
      gameId: "j1l9qz1g",
      gameName: "The Legend of Zelda",
      categoryId: "7dgrrxk4",
      categoryName: "Any%",
      levelId: null,
      variables: {},
      platformId: null,
      regionId: null,
      emulator: null,
      timingMethod: "realtime",
    });
  });

  it("parses variables and nullable fields", () => {
    const mapping = convert(
      makeMappingRow({
        src_variables: '{"var-1":"value-a","var-2":"value-b"}',
        src_level_id: "lvl",
        src_platform_id: "plat",
        src_region_id: "reg",
        src_emulator: "false",
        src_timing_method: "ingame",
      }),
    );

    expect(mapping.speedrunCom.variables).toEqual({ "var-1": "value-a", "var-2": "value-b" });
    expect(mapping.speedrunCom.levelId).toBe("lvl");
    expect(mapping.speedrunCom.platformId).toBe("plat");
    expect(mapping.speedrunCom.regionId).toBe("reg");
    expect(mapping.speedrunCom.emulator).toBe(false);
    expect(mapping.speedrunCom.timingMethod).toBe("ingame");
  });

  it("handles emulator true and blank", () => {
    expect(convert(makeMappingRow({ src_emulator: "true" })).speedrunCom.emulator).toBe(true);
    expect(convert(makeMappingRow({ src_emulator: "" })).speedrunCom.emulator).toBeNull();
  });

  it("handles each timing method and blank", () => {
    expect(
      convert(makeMappingRow({ src_timing_method: "realtime" })).speedrunCom.timingMethod,
    ).toBe("realtime");
    expect(
      convert(makeMappingRow({ src_timing_method: "realtime_noloads" })).speedrunCom.timingMethod,
    ).toBe("realtime_noloads");
    expect(convert(makeMappingRow({ src_timing_method: "ingame" })).speedrunCom.timingMethod).toBe(
      "ingame",
    );
    expect(convert(makeMappingRow({ src_timing_method: "" })).speedrunCom.timingMethod).toBeNull();
  });

  it("rejects missing required fields", () => {
    const cases: [keyof CategoryMappingSheetRow, string][] = [
      ["racetime_category_slug", CATEGORY_MAPPING_ROW_ISSUE_CODES.categorySlugMissing],
      ["racetime_goal", CATEGORY_MAPPING_ROW_ISSUE_CODES.goalMissing],
      ["src_game_id", CATEGORY_MAPPING_ROW_ISSUE_CODES.gameIdMissing],
      ["src_game_name", CATEGORY_MAPPING_ROW_ISSUE_CODES.gameNameMissing],
      ["src_category_id", CATEGORY_MAPPING_ROW_ISSUE_CODES.categoryIdMissing],
      ["src_category_name", CATEGORY_MAPPING_ROW_ISSUE_CODES.categoryNameMissing],
    ];
    for (const [field, code] of cases) {
      const result = categoryMappingSheetRowToMapping(
        makeMappingRow({ [field]: "" } as Partial<CategoryMappingSheetRow>),
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.issues.map((issue) => issue.code)).toContain(code);
      }
    }
  });

  it("rejects invalid variables", () => {
    expect(categoryMappingSheetRowToMapping(makeMappingRow({ src_variables: "not json" })).ok).toBe(
      false,
    );
    expect(categoryMappingSheetRowToMapping(makeMappingRow({ src_variables: "[1,2]" })).ok).toBe(
      false,
    );
    const result = categoryMappingSheetRowToMapping(makeMappingRow({ src_variables: '{"a":1}' }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.map((issue) => issue.code)).toContain(
        CATEGORY_MAPPING_ROW_ISSUE_CODES.variablesValueInvalid,
      );
    }
  });

  it("rejects invalid emulator and timing method", () => {
    expect(categoryMappingSheetRowToMapping(makeMappingRow({ src_emulator: "yes" })).ok).toBe(
      false,
    );
    expect(categoryMappingSheetRowToMapping(makeMappingRow({ src_timing_method: "fast" })).ok).toBe(
      false,
    );
  });
});

describe("categoryMappingToSheetRow", () => {
  it("serializes a mapping", () => {
    const mapping = makeCategoryMapping({
      speedrunCom: {
        ...makeCategoryMapping().speedrunCom,
        variables: { a: "1" },
        levelId: "lvl",
        emulator: true,
        timingMethod: "realtime_noloads",
      },
    });
    const row = categoryMappingToSheetRow(mapping, UPDATED_AT);

    expect(row.racetime_category_slug).toBe("ootr");
    expect(row.src_variables).toBe('{"a":"1"}');
    expect(row.src_level_id).toBe("lvl");
    expect(row.src_emulator).toBe("true");
    expect(row.src_timing_method).toBe("realtime_noloads");
    expect(row.updated_at).toBe(UPDATED_AT);
  });

  it("round trips", () => {
    const mapping = makeCategoryMapping({
      speedrunCom: {
        ...makeCategoryMapping().speedrunCom,
        variables: { a: "1", b: "2" },
        platformId: "plat",
        emulator: false,
      },
    });
    const restored = convert(categoryMappingToSheetRow(mapping, UPDATED_AT));
    expect(restored).toEqual(mapping);
  });
});
