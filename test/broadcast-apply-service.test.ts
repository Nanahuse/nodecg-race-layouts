import { describe, expect, it } from "vitest";
import { buildActiveConfig } from "../src/extension/application/active-config-builder";
import { validateDraftReadiness } from "../src/extension/application/draft-readiness";
import type { DraftConfig, DraftPerson } from "../src/domain";
import { makeActiveConfig, makeDraftConfig } from "./factories";

function readyDraft(): DraftConfig {
  const active = makeActiveConfig();
  const participants = active.participants.map((participant, index) => ({
    racetimeUserId: participant.racetimeUserId,
    personRef: `ref-${index}`,
  }));
  const persons = Object.fromEntries(
    participants.map((participant, index) => {
      const playerId = active.participants[index]!.playerId;
      const snapshot = active.players[playerId]!;
      return [
        participant.personRef,
        {
          ref: participant.personRef,
          playerId,
          identity: {
            racetimeUserId: participant.racetimeUserId,
            twitchLogin: snapshot.twitch?.login ?? null,
            speedrunComUserId: snapshot.speedrunCom?.userId ?? null,
          },
          player: snapshot,
          resolution: "matched" as const,
        },
      ];
    }),
  );
  return {
    ...makeDraftConfig(),
    revision: 4,
    race: active.race,
    participants,
    persons,
    raceScreenSlots: active.raceScreenSlots,
    categorySelection: {
      selection: active.categorySelection,
      source: "manual" as const,
      savedMappingState: "none" as const,
    },
  };
}
describe("broadcast apply readiness with Player Manager", () => {
  it("freezes canonical player snapshots for matched entrants", () => {
    const draft = readyDraft();
    expect(validateDraftReadiness(draft)).toEqual([]);
    const result = buildActiveConfig(draft, 1);
    expect(result.ok).toBe(true);
    if (result.ok) expect(Object.keys(result.config.players).sort()).toHaveLength(4);
  });
  it("blocks apply while any participant is unresolved", () => {
    const draft = readyDraft();
    const first = draft.participants[0]!;
    const unresolved: DraftPerson = {
      ...draft.persons[first.personRef]!,
      playerId: null,
      player: null,
      resolution: "conflict",
    };
    draft.persons[first.personRef] = unresolved;
    expect(
      validateDraftReadiness(draft).some(
        (issue) => issue.code === "participant_resolution_required",
      ),
    ).toBe(true);
    expect(buildActiveConfig(draft, 1).ok).toBe(false);
  });
});
