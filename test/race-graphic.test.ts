import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { RaceOverlayData } from "../src/domain";
import { RaceGraphic } from "../ui/graphics/race/race-graphic";

const data: RaceOverlayData = {
  activeRevision: 4,
  event: {
    name: "Private Event Name",
    shortName: "Private Event Short Name",
    logoUrl: "/private-logo.png",
  },
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

function render(value: RaceOverlayData | null = data): string {
  return renderToStaticMarkup(createElement(RaceGraphic, { data: value }));
}

describe("RaceGraphic", () => {
  it("renders four fixed race slots with video, badge, player bar, and timer frames", () => {
    const html = render();

    expect(html.match(/class="race-slot slot-/g)).toHaveLength(4);
    for (const slot of [1, 2, 3, 4]) {
      expect(html).toContain(`class="race-slot slot-${slot}"`);
      expect(html).toContain(`>P${slot}</span>`);
    }
    expect(html.match(/class="video-frame"/g)).toHaveLength(4);
    expect(html.match(/class="player-bar"/g)).toHaveLength(4);
    expect(html.match(/class="timer-frame"/g)).toHaveLength(4);
    expect(html.match(/class="race-meta"/g)).toHaveLength(1);
  });

  it("renders player identity, Twitch, PB placeholder, and only available World Rank", () => {
    const html = render();

    expect(html).toContain("Player 1");
    expect(html).toContain("@runner");
    expect(html).toContain("PB 12:34");
    expect(html).toContain("PB —");
    expect(html).toContain("#1");
    expect(html).not.toContain("#3");
    expect(html).not.toContain("Twitch:");
  });

  it("keeps the slot structure when Twitch, PB, or Rank is missing", () => {
    const html = render();
    const slot2 = html.slice(
      html.indexOf('class="race-slot slot-2"'),
      html.indexOf('class="race-slot slot-3"'),
    );
    const slot3 = html.slice(
      html.indexOf('class="race-slot slot-3"'),
      html.indexOf('class="race-slot slot-4"'),
    );

    expect(slot2).toContain("Player 2");
    expect(slot2).toContain("PB —");
    expect(slot2).not.toContain("player-twitch");
    expect(slot3).toContain("Player 3");
    expect(slot3).toContain("PB 12:34");
    expect(slot3).not.toContain("player-rank");
    expect(slot2).toContain("video-frame");
    expect(slot2).toContain("timer-frame");
  });

  it("always renders the World Record row, including its empty fallback", () => {
    expect(render()).toContain("WR 10:00 — Runner A / Runner B");
    expect(render({ ...data, worldRecord: null })).toContain("WR —");
  });

  it("keeps the information band stable with zero, one, or three commentators", () => {
    const noCommentators = render({ ...data, commentators: [] });
    const oneCommentator = render({ ...data, commentators: [data.commentators[0]!] });
    const threeCommentators = render({
      ...data,
      commentators: ["Alice", "Bob", "Carol"].map((displayName, index) => ({
        playerId: `caster-${index}`,
        displayName,
        twitchLogin: `caster${index}`,
      })),
    });

    for (const html of [noCommentators, oneCommentator, threeCommentators]) {
      expect(html.match(/class="race-meta"/g)).toHaveLength(1);
      expect(html.match(/class="commentators"/g)).toHaveLength(1);
    }
    expect(noCommentators).toContain("Commentary");
    expect(oneCommentator).toContain("Caster");
    expect(threeCommentators).toContain("Carol");
    expect(threeCommentators.match(/class="commentator"/g)).toHaveLength(3);
  });

  it("omits an unassigned slot entirely without moving the other slots", () => {
    const partial: RaceOverlayData = {
      ...data,
      players: data.players.map((player, index) =>
        index === 2
          ? {
              ...player,
              displayName: null,
              twitchLogin: null,
              personalBest: { time: null, rank: null },
            }
          : player,
      ) as RaceOverlayData["players"],
    };
    const html = render(partial);

    expect(html.match(/class="race-slot slot-/g)).toHaveLength(3);
    expect(html).not.toContain('class="race-slot slot-3"');
    expect(html).toContain('class="race-slot slot-1"');
    expect(html).toContain('class="race-slot slot-2"');
    expect(html).toContain('class="race-slot slot-4"');
    expect(html).not.toContain("Player 3");
  });

  it("does not render event branding or game names", () => {
    const html = render();

    expect(html).not.toContain("Private Event Name");
    expect(html).not.toContain("Private Event Short Name");
    expect(html).not.toContain("private-logo.png");
  });

  it("retains long player, category, World Record, and commentator text in the DOM", () => {
    const maximum: RaceOverlayData = {
      ...data,
      event: {
        name: "An extraordinarily long event name that must not appear",
        shortName: null,
        logoUrl: null,
      },
      category: { name: "An extraordinarily long category name that remains in the DOM" },
      commentators: ["Alice", "Bob", "Carol"].map((displayName, index) => ({
        playerId: `caster-${index}`,
        displayName: `${displayName} has a very long commentator display name`,
        twitchLogin: `very-long-commentator-login-${index}`,
      })),
      players: data.players.map((player) => ({
        ...player,
        displayName: "A very long player display name that must remain in the DOM",
        twitchLogin: "a-very-long-twitch-login-for-this-player",
      })) as RaceOverlayData["players"],
      worldRecord: {
        time: "10:00",
        holders: [
          "A very long World Record holder name that remains in the DOM",
          "Another very long World Record holder name that remains in the DOM",
        ],
      },
    };
    const html = render(maximum);

    expect(html.match(/class="race-slot slot-/g)).toHaveLength(4);
    expect(html.match(/class="commentator"/g)).toHaveLength(3);
    expect(html).toContain("A very long player display name that must remain in the DOM");
    expect(html).toContain("very-long-commentator-login-2");
    expect(html).toContain("An extraordinarily long category name that remains in the DOM");
    expect(html).toContain("Another very long World Record holder name that remains in the DOM");
    expect(html).not.toContain("An extraordinarily long event name");
  });

  it("renders no content while overlay data is unavailable", () => {
    expect(render(null)).toBe("");
  });
});
