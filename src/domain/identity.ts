/**
 * External service identities. These describe the raw facts we know about an
 * account on a given service. They are deliberately provider-shaped but contain
 * only the fields the rest of the domain needs; raw API responses never leak
 * into these types.
 */

export type RaceTimeIdentity = {
  userId: string;
  name: string;
  twitchLogin: string | null;
};

export type SpeedrunComIdentity = {
  userId: string;
  name: string;
  twitchLogin: string | null;
};

export type TwitchIdentity = {
  userId: string | null;
  login: string;
};
