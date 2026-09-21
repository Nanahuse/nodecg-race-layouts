import type {
  DraftRaceTimeAccountLink,
  DraftSpeedrunComAccountLink,
  DraftTwitchAccountLink,
  RaceTimeAccountLink,
  SpeedrunComAccountLink,
  TwitchAccountLink,
} from "./account-link";
import type { PlayerId } from "./ids";

/**
 * A reusable person master record. `playerId` is the internal primary key; we
 * intentionally do not use a RaceTime.gg user id as the primary key, because a
 * player may exist before (or without) a RaceTime account.
 */
export type PlayerMapping = {
  playerId: PlayerId;

  manualDisplayName: string | null;

  racetime: RaceTimeAccountLink;
  speedrunCom: SpeedrunComAccountLink;
  twitch: TwitchAccountLink;
};

/** Active representation: unresolved identities are impossible. */
export type ActivePlayer = PlayerMapping;

/** Draft representation: may contain unresolved identities. */
export type DraftPlayer = {
  playerId: PlayerId;

  manualDisplayName: string | null;

  racetime: DraftRaceTimeAccountLink;
  speedrunCom: DraftSpeedrunComAccountLink;
  twitch: DraftTwitchAccountLink;
};

export type PlayerDirectory = Record<PlayerId, PlayerMapping>;
