import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { RaceOverlayData } from "../src/domain";
import { RaceGraphic } from "../ui/graphics/race/race-graphic";

const data: RaceOverlayData = {
  activeRevision: 4,
  event: { name: "Long Event", shortName: "LE", logoUrl: null },
  category: { name: "Any%" },
  worldRecord: { time: "10:00", holders: ["Runner A", "Runner B"] },
  commentators: [{ playerId: "caster-1", displayName: "Caster", twitchLogin: "caster" }],
  players: [1, 2, 3, 4].map((slot) => ({
    slot: slot as 1 | 2 | 3 | 4,
    displayName: `Player ${slot}`,
    twitchLogin: slot === 1 ? "runner" : null,
    personalBest: { time: slot === 2 ? null : "12:34", rank: slot === 3 ? null : slot },
  })) as RaceOverlayData["players"],
};

describe("RaceGraphic", () => {
  it("renders the overlay in slot order with optional fields", () => {
    const html = renderToStaticMarkup(createElement(RaceGraphic, { data }));
    expect(html.indexOf("Player 1")).toBeLessThan(html.indexOf("Player 2"));
    expect(html).toContain("Twitch: runner");
    expect(html).toContain("PB 12:34 · Rank #1");
    expect(html).not.toContain("PB null");
    expect(html).toContain("WR 10:00 — Runner A, Runner B");
    expect(html).toContain("Caster");
    expect(html).toContain("LE");
  });

  it("renders no content while overlay data is unavailable", () => {
    expect(renderToStaticMarkup(createElement(RaceGraphic, { data: null }))).toBe("");
  });

  it("renders the maximum commentary and long player content", () => {
    const maximum = {
      ...data,
      commentators: ["Alice", "Bob", "Carol"].map((displayName, index) => ({
        playerId: `caster-${index}`,
        displayName,
        twitchLogin: `very-long-twitch-login-${index}`,
      })),
      players: data.players.map((player) => ({
        ...player,
        displayName: "A very long player display name that must stay within its HUD",
      })) as RaceOverlayData["players"],
      worldRecord: {
        time: "10:00",
        holders: ["A very long holder name", "Another very long holder name"],
      },
    };
    const html = renderToStaticMarkup(createElement(RaceGraphic, { data: maximum }));
    expect(html.match(/class="player-hud/g)).toHaveLength(4);
    expect(html).toContain("Carol");
  });
});
