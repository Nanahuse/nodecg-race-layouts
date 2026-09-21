import type { ActiveConfig, RaceResultPageData, RaceSession } from "../../domain";
import type { EventConfig } from "../config";
import { resolveDisplayName } from "../../domain/display-name";
import { formatRaceTimeDuration } from "./racetime-duration";
import type { BuildResult } from "./graphics-view-model-builder";

export function buildRaceResultPageData(
  config: ActiveConfig,
  session: RaceSession,
  event: EventConfig,
): BuildResult<RaceResultPageData> {
  if (!session.race || session.race.raceId !== config.race.raceId)
    return { ok: false, issues: ["Active race mismatch"] };
  const results = config.participants.map((participant) => {
    const p = config.players[participant.playerId];
    if (!p)
      return {
        racetimeUserId: participant.racetimeUserId,
        place: null,
        placeLabel: "",
        name: "",
        secondaryName: null,
        time: null,
        status: "other" as const,
      };
    const displayName = resolveDisplayName(p) ?? "";
    const live = session.race?.results.find((r) => r.userId === participant.racetimeUserId);
    const status = live?.status ?? "other";
    const place = live?.place ?? null;
    const liveName = p.racetime.state === "linked" ? p.racetime.value.name : null;
    return {
      racetimeUserId: participant.racetimeUserId,
      place,
      placeLabel:
        place !== null ? String(place) : status === "dnf" ? "DNF" : status === "dq" ? "DQ" : "",
      name: displayName,
      secondaryName: liveName && liveName.trim() !== displayName.trim() ? liveName : null,
      time: status === "finished" && live?.time ? formatRaceTimeDuration(live.time) : null,
      status,
    };
  });
  results.sort((a, b) =>
    a.place !== null && b.place !== null
      ? a.place - b.place
      : a.place !== null
        ? -1
        : b.place !== null
          ? 1
          : 0,
  );
  return {
    ok: true,
    value: {
      activeRevision: config.revision,
      event: { name: event.name, shortName: event.shortName, logoUrl: event.logoUrl },
      category: { name: config.categorySelection.categoryName },
      results,
    },
  };
}
