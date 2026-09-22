import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { LeaderboardPageData } from "../src/domain";
import {
  getLeaderboardDensity,
  LeaderboardGraphic,
} from "../ui/graphics/leaderboard/leaderboard-graphic";

const makeData = (count = 3): LeaderboardPageData => ({
  activeRevision: 1,
  event: { name: "Hidden Event", shortName: "HE", logoUrl: null },
  category: { title: "Hidden Category", subtitle: null },
  presentation: {
    ruleHeading: null,
    ruleLines: [],
    leaderboardHeading: "Hidden Heading",
    sourceLabel: "Hidden Source",
  },
  leaderboard: Array.from({ length: count }, (_, index) => ({
    rank: index + 1,
    name: `Runner ${index + 1}`,
    secondaryName: index === 1 ? null : `SRC ${index + 1}`,
    time: `3${index}:42`,
  })),
});

describe("LeaderboardGraphic", () => {
  it("preserves leaderboard order and renders entry fields", () => {
    const html = renderToStaticMarkup(createElement(LeaderboardGraphic, { data: makeData() }));
    expect(html.indexOf("Runner 1")).toBeLessThan(html.indexOf("Runner 2"));
    expect(html).toContain("1");
    expect(html).toContain("Runner 1");
    expect(html).toContain("SRC 1");
    expect(html).toContain("Runner 2");
    expect(html).toContain("32:42");
    expect(html).not.toContain("SRC 2");
    expect(html).not.toContain("Hidden Event");
    expect(html).not.toContain("Hidden Heading");
  });

  it("renders all ten supplied entries without filtering or sorting", () => {
    const data = makeData(10);
    data.leaderboard[0] = { rank: 99, name: "Supplied First", secondaryName: null, time: "9:99" };
    const html = renderToStaticMarkup(createElement(LeaderboardGraphic, { data }));
    expect(html).toContain("Supplied First");
    expect(html).toContain("99");
    expect(html).toContain("Runner 10");
    expect(html.match(/class="leaderboard-row"/g)).toHaveLength(10);
  });

  it.each([
    [11, "compact"],
    [12, "compact"],
    [16, "dense"],
    [20, "extra-dense"],
  ] as const)("renders all %i entries with %s density", (count, density) => {
    const data = makeData(count);
    const html = renderToStaticMarkup(createElement(LeaderboardGraphic, { data }));
    expect(getLeaderboardDensity(count)).toBe(density);
    expect(html.match(/class="leaderboard-row"/g)).toHaveLength(count);
    expect(html).toContain("Runner " + count);
  });

  it("renders no content when data is unavailable", () => {
    expect(renderToStaticMarkup(createElement(LeaderboardGraphic, { data: null }))).toBe("");
  });

  it("renders long names in the ten-entry fixture", () => {
    const data = makeData(10);
    data.leaderboard[0] = {
      ...data.leaderboard[0]!,
      name: "A very long leaderboard runner name that should be ellipsized",
      secondaryName: "A very long secondary leaderboard name",
    };
    const html = renderToStaticMarkup(createElement(LeaderboardGraphic, { data }));
    expect(html).toContain("A very long leaderboard runner name");
    expect(html).toContain("A very long secondary leaderboard name");
  });
});
