import type { RaceTimeIdentity, SpeedrunComIdentity, TwitchIdentity } from "./identity";

/**
 * Account link state.
 *
 * The confirmed (Active) representation deliberately has no `unresolved`
 * variant: anything that reaches broadcast must be fully resolved. Only the
 * draft representation may carry `unresolved`, and it additionally records
 * where the link came from so the UI can explain and override it.
 *
 * The per-service aliases below spell out the unions explicitly instead of
 * instantiating the generic helpers. Generic instantiations would produce JSON
 * Schema definition names containing `<`/`>` (e.g. `AccountLink<SpeedrunCom>`),
 * which do not survive `$ref` URI encoding cleanly.
 */

export type LinkSource = "spreadsheet" | "racetime" | "speedruncom" | "auto" | "manual";

export type LinkedAccountLink<T> = {
  state: "linked";
  value: T;
};

export type NoneAccountLink = {
  state: "none";
};

export type AccountLink<T> = LinkedAccountLink<T> | NoneAccountLink;

export type RaceTimeAccountLink =
  | {
      state: "linked";
      value: RaceTimeIdentity;
    }
  | NoneAccountLink;

export type SpeedrunComAccountLink =
  | {
      state: "linked";
      value: SpeedrunComIdentity;
    }
  | NoneAccountLink;

export type TwitchAccountLink =
  | {
      state: "linked";
      value: TwitchIdentity;
    }
  | NoneAccountLink;

export type DraftLinkedAccountLink<T> = {
  state: "linked";
  value: T;
  source: LinkSource;
};

export type DraftNoneAccountLink = {
  state: "none";
  source: "spreadsheet" | "manual";
};

export type DraftUnresolvedAccountLink = {
  state: "unresolved";
};

export type DraftAccountLink<T> =
  DraftLinkedAccountLink<T> | DraftNoneAccountLink | DraftUnresolvedAccountLink;

export type DraftRaceTimeAccountLink =
  | {
      state: "linked";
      value: RaceTimeIdentity;
      source: LinkSource;
    }
  | DraftNoneAccountLink
  | DraftUnresolvedAccountLink;

export type DraftSpeedrunComAccountLink =
  | {
      state: "linked";
      value: SpeedrunComIdentity;
      source: LinkSource;
    }
  | DraftNoneAccountLink
  | DraftUnresolvedAccountLink;

export type DraftTwitchAccountLink =
  | {
      state: "linked";
      value: TwitchIdentity;
      source: LinkSource;
    }
  | DraftNoneAccountLink
  | DraftUnresolvedAccountLink;
