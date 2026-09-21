import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ParticipantListData } from "../src/domain";
import { ParticipantListGraphic } from "../ui/graphics/participants/participant-list-graphic";

const makeData = (count = 3): ParticipantListData => ({
  activeRevision: 1,
  event: { name: "Long Event", shortName: "LE", logoUrl: null },
  category: { name: "Any%" },
  commentators: [],
  participants: Array.from({ length: count }, (_, index) => ({
    racetimeUserId: `user-${index + 1}`,
    displayName: `Player ${index + 1}`,
    speedrunComName: index === 0 ? "SRC Player 1" : null,
    personalBest: { time: index === 1 ? null : "12:34", rank: index === 2 ? null : index + 1 },
  })),
});

describe("ParticipantListGraphic", () => {
  it("preserves participant order and renders participant metadata", () => {
    const html = renderToStaticMarkup(
      createElement(ParticipantListGraphic, {
        data: {
          ...makeData(),
          commentators: [{ playerId: "caster", displayName: "Alice", twitchLogin: null }],
        },
      }),
    );
    expect(html.indexOf("Player 1")).toBeLessThan(html.indexOf("Player 2"));
    expect(html).toContain("SRC Player 1");
    expect(html).toContain("PB 12:34 · 1");
    expect(html).toContain("PB — · 2");
    expect(html).toContain("PB 12:34 · —");
    expect(html).toContain("COMMENTARY Alice");
    expect(html).toContain("LE");
  });

  it("renders all 24 participants with extra-dense layout", () => {
    const html = renderToStaticMarkup(
      createElement(ParticipantListGraphic, { data: makeData(24) }),
    );
    expect(html).toContain("density-extra-dense");
    expect(html.match(/class="participant-card"/g)).toHaveLength(24);
    expect(html).toContain("Player 24");
  });

  it("renders no content when data is unavailable", () => {
    expect(renderToStaticMarkup(createElement(ParticipantListGraphic, { data: null }))).toBe("");
  });
});
