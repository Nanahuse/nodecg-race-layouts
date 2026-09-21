import type {
  RaceSessionRace,
  RaceTimeEntrant,
  RaceTimeResult,
  RaceTimeResultStatus,
} from "../../../domain";
import type { RaceTimeEntrantDto, RaceTimeRaceDto } from "./types";

/**
 * Normalize a RaceTime.gg entrant status into the broadcast result status.
 * See racetime-app `Entrant.summary`.
 */
export function normalizeResultStatus(status: string): RaceTimeResultStatus {
  switch (status) {
    case "done":
      return "finished";
    case "dnf":
      return "dnf";
    case "dq":
      return "dq";
    default:
      return "other";
  }
}

function mapEntrant(entrant: RaceTimeEntrantDto): RaceTimeEntrant {
  return {
    userId: entrant.userId,
    name: entrant.name,
    twitchLogin: entrant.twitchLogin,
    status: entrant.status,
  };
}

function mapResult(entrant: RaceTimeEntrantDto): RaceTimeResult {
  return {
    userId: entrant.userId,
    name: entrant.name,
    place: entrant.place,
    time: entrant.finishTime,
    status: normalizeResultStatus(entrant.status),
  };
}

/**
 * Map a Race Detail DTO into the normalized domain race. Entrant order is
 * preserved exactly as returned by the API; no sorting is performed here.
 */
export function mapRaceDetail(dto: RaceTimeRaceDto): RaceSessionRace {
  return {
    raceId: `${dto.categorySlug}/${dto.slug}`,
    categorySlug: dto.categorySlug,
    categoryName: dto.categoryName,
    goal: dto.goal,
    status: dto.status,
    entrants: dto.entrants.map(mapEntrant),
    results: dto.entrants.map(mapResult),
  };
}
