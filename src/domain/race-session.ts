/**
 * Normalized internal representation of a RaceTime.gg race session. Raw HTTP
 * or WebSocket payloads are converted into this shape before they are placed
 * into a replicant; provider-specific response types never reach the domain.
 */

export type RaceTimeEntrant = {
  userId: string;
  name: string;
  status: string;
};

export type RaceTimeResult = {
  userId: string | null;
  name: string;
  place: number | null;
  time: string | null;
  status: string;
};

export type RaceSessionConnectionState = "disconnected" | "connecting" | "connected" | "error";

export type RaceSessionConnection = {
  state: RaceSessionConnectionState;
  message: string | null;
};

export type RaceSessionRace = {
  raceId: string;

  categorySlug: string;
  categoryName: string;
  goal: string;

  status: string;

  entrants: RaceTimeEntrant[];
  results: RaceTimeResult[];
};

export type RaceSession = {
  revision: number;

  canonicalUrl: string | null;

  connection: RaceSessionConnection;

  race: RaceSessionRace | null;
};
