import type { PlayerId, RaceTimeUserId } from "./ids";
import type { RaceScreenSlot } from "./race-screen";

/**
 * Graphics view models. Graphics never read the active config or external API
 * responses directly; the extension resolves all identities and produces these
 * self-contained shapes.
 */

export type EventView = {
  name: string;
  shortName: string | null;
  logoUrl: string | null;
};

export type CommentatorView = {
  playerId: PlayerId;
  displayName: string;
  twitchLogin: string | null;
};

export type PlayerPersonalBestView = {
  time: string | null;
  rank: number | null;
};

export type RaceOverlayPlayer = {
  slot: RaceScreenSlot;
  displayName: string;
  twitchLogin: string | null;
  personalBest: PlayerPersonalBestView;
};

export type RaceOverlayPlayers = [
  RaceOverlayPlayer,
  RaceOverlayPlayer,
  RaceOverlayPlayer,
  RaceOverlayPlayer,
];

export type WorldRecordView = {
  time: string;
  holders: string[];
};

export type RaceOverlayData = {
  activeRevision: number;

  event: EventView;

  category: {
    name: string;
  };

  worldRecord: WorldRecordView | null;

  commentators: CommentatorView[];

  players: RaceOverlayPlayers;
};

export type ParticipantListEntry = {
  racetimeUserId: RaceTimeUserId;
  displayName: string;
  speedrunComName: string | null;
  personalBest: PlayerPersonalBestView;
};

export type ParticipantListData = {
  activeRevision: number;

  event: EventView;

  category: {
    name: string;
  };

  commentators: CommentatorView[];

  participants: ParticipantListEntry[];
};

export type LeaderboardPageEntry = {
  rank: number;
  name: string;
  secondaryName: string | null;
  time: string;
};

export type LeaderboardPageData = {
  activeRevision: number;

  event: EventView;

  category: {
    title: string;
    subtitle: string | null;
  };

  presentation: {
    ruleHeading: string | null;
    ruleLines: string[];
    leaderboardHeading: string;
    sourceLabel: string;
  };

  leaderboard: LeaderboardPageEntry[];
};

export type RaceResultStatus = "finished" | "dnf" | "dq" | "other";

export type RaceResultEntry = {
  racetimeUserId: string | null;

  place: number | null;
  placeLabel: string;

  name: string;
  secondaryName: string | null;

  time: string | null;

  status: RaceResultStatus;
};

export type RaceResultPageData = {
  activeRevision: number;

  event: EventView;

  category: {
    name: string;
  };

  results: RaceResultEntry[];
};
