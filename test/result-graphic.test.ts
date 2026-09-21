import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { RaceResultPageData } from "../src/domain";
import { ResultGraphic } from "../ui/graphics/result/result-graphic";

const makeData = (count = 3): RaceResultPageData => ({
  activeRevision: 1,
  event: { name: "Hidden Event", shortName: "HE", logoUrl: null },
  category: { name: "Hidden Category" },
  results: Array.from({ length: count }, (_, index) => ({
    racetimeUserId: `user-${index + 1}`,
    place: index + 1,
    placeLabel: `${index + 1}`,
    name: `Runner ${index + 1}`,
    secondaryName: index === 1 ? null : `RaceTime ${index + 1}`,
    time: index === 2 ? null : `3${index}:42`,
    status: "finished" as const,
  })),
});

describe("ResultGraphic", () => {
  it("preserves result order and renders supplied fields", () => {
    const html = renderToStaticMarkup(createElement(ResultGraphic, { data: makeData() }));
    expect(html.indexOf("Runner 1")).toBeLessThan(html.indexOf("Runner 2"));
    expect(html).toContain("1");
    expect(html).toContain("Runner 1");
    expect(html).toContain("RaceTime 1");
    expect(html).toContain("30:42");
    expect(html).not.toContain("RaceTime 2");
    expect(html).not.toContain("Hidden Event");
  });

  it("uses status only as an attribute and leaves labels and time unchanged", () => {
    const data = makeData(2);
    data.results[0] = { ...data.results[0], placeLabel: "DNF", status: "dnf", time: null };
    data.results[1] = { ...data.results[1], placeLabel: "DQ", status: "dq", time: "" };
    const html = renderToStaticMarkup(createElement(ResultGraphic, { data }));
    expect(html).toContain('data-status="dnf"');
    expect(html).toContain('data-status="dq"');
    expect(html).toContain("DNF");
    expect(html).toContain("DQ");
  });

  it("renders all 24 supplied results in three columns without filtering", () => {
    const html = renderToStaticMarkup(createElement(ResultGraphic, { data: makeData(24) }));
    expect(html).toContain("density-extra-dense");
    expect(html.match(/class="result-row"/g)).toHaveLength(24);
    expect(html).toContain("Runner 24");
  });

  it("renders no content when data is unavailable", () => {
    expect(renderToStaticMarkup(createElement(ResultGraphic, { data: null }))).toBe("");
  });

  it("renders long names in the 24-result fixture", () => {
    const data = makeData(24);
    data.results[0] = {
      ...data.results[0],
      name: "A very long result runner name that should be ellipsized",
      secondaryName: "A very long secondary result name",
    };
    const html = renderToStaticMarkup(createElement(ResultGraphic, { data }));
    expect(html).toContain("A very long result runner name");
    expect(html).toContain("A very long secondary result name");
  });
});
