import { describe, expect, it } from "vitest";

import {
  CATEGORY_PRESENTATION_ROW_ISSUE_CODES,
  categoryPresentationSheetRowToEntry,
  categoryPresentationToSheetRow,
  splitRuleLines,
} from "../src/extension/integrations/spreadsheet/category-presentation-row";
import { makePresentation, makePresentationRow } from "./support/category-fakes";

const UPDATED_AT = "2026-09-21T05:30:00.000Z";

function convert(row: ReturnType<typeof makePresentationRow>) {
  const result = categoryPresentationSheetRowToEntry(row);
  if (!result.ok) {
    throw new Error(`expected conversion to succeed: ${JSON.stringify(result.issues)}`);
  }
  return result.entry;
}

describe("splitRuleLines", () => {
  it("splits LF", () => {
    expect(splitRuleLines("a\nb\nc")).toEqual(["a", "b", "c"]);
  });

  it("splits CRLF", () => {
    expect(splitRuleLines("a\r\nb\r\nc")).toEqual(["a", "b", "c"]);
  });

  it("drops empty lines and trailing newlines", () => {
    expect(splitRuleLines("a\n\nb\n")).toEqual(["a", "b"]);
  });
});

describe("categoryPresentationSheetRowToEntry", () => {
  it("parses a multi-line rule text", () => {
    const entry = convert(
      makePresentationRow({
        rule_text: "No Starworld\nNo Cape Cheese\nTiming starts on file select",
      }),
    );
    expect(entry.presentation.ruleLines).toEqual([
      "No Starworld",
      "No Cape Cheese",
      "Timing starts on file select",
    ]);
  });

  it("parses CRLF rule text", () => {
    const entry = convert(makePresentationRow({ rule_text: "a\r\nb" }));
    expect(entry.presentation.ruleLines).toEqual(["a", "b"]);
  });

  it("handles a null subtitle and empty rule lines", () => {
    const entry = convert(makePresentationRow({ display_subtitle: "", rule_text: "" }));
    expect(entry.presentation.subtitle).toBeNull();
    expect(entry.presentation.ruleLines).toEqual([]);
  });

  it("rejects missing title and headings", () => {
    expect(categoryPresentationSheetRowToEntry(makePresentationRow({ display_title: "" })).ok).toBe(
      false,
    );
    const result = categoryPresentationSheetRowToEntry(makePresentationRow({ rule_heading: "" }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.map((issue) => issue.code)).toContain(
        CATEGORY_PRESENTATION_ROW_ISSUE_CODES.ruleHeadingMissing,
      );
    }
  });

  it("rejects a missing key", () => {
    expect(categoryPresentationSheetRowToEntry(makePresentationRow({ racetime_goal: "" })).ok).toBe(
      false,
    );
  });
});

describe("categoryPresentationToSheetRow", () => {
  it("round trips a presentation", () => {
    const presentation = makePresentation({
      subtitle: "No Major Glitches",
      ruleLines: ["one", "two", "three"],
    });
    const row = categoryPresentationToSheetRow("ootr", "Defeat Ganon", presentation, UPDATED_AT);
    expect(row.rule_text).toBe("one\ntwo\nthree");

    const entry = convert(row);
    expect(entry.categorySlug).toBe("ootr");
    expect(entry.goal).toBe("Defeat Ganon");
    expect(entry.presentation).toEqual(presentation);
  });

  it("round trips empty rule lines", () => {
    const presentation = makePresentation({ ruleLines: [] });
    const entry = convert(
      categoryPresentationToSheetRow("ootr", "Defeat Ganon", presentation, UPDATED_AT),
    );
    expect(entry.presentation.ruleLines).toEqual([]);
  });
});
