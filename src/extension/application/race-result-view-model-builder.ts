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
  for (const participant of config.participants) {
    const player = config.players[participant.playerId];
    if (!player)
      return { ok: false, issues: [`Participant player missing: ${participant.playerId}`] };
    if (!resolveDisplayName(player)) {
      return { ok: false, issues: [`Display name unresolved: ${participant.playerId}`] };
    }
  }
  const results = config.participants.map((participant) => {
    const p = config.players[participant.playerId];
    if (!p) throw new Error("validated participant player is missing");
    const displayName = resolveDisplayName(p) as string;
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
