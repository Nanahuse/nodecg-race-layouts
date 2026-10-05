import type { IdentityResolutionInput, Resolution } from "@nanahuse/player-manager-protocol";

export type PlayerSnapshot = {
  playerId: string;
  displayName: string;
  racetime: { userId: string; name: string } | null;
  speedrunCom: { userId: string; name: string } | null;
  twitch: { userId: string | null; login: string; displayName: string | null } | null;
  youtube: string | null;
};

export type DraftPersonRef = string;
export type DraftPersonResolution = "matched" | "unresolved" | "ambiguous" | "conflict";

export type DraftPerson = {
  ref: DraftPersonRef;
  playerId: string | null;
  identity: {
    racetimeUserId: string | null;
    twitchLogin: string | null;
    speedrunComUserId: string | null;
  };
  player: PlayerSnapshot | null;
  resolution: DraftPersonResolution;
};

export type DraftParticipantV2 = {
  racetimeUserId: string;
  personRef: DraftPersonRef;
};

export type DraftPeopleState = {
  participants: DraftParticipantV2[];
  persons: Record<DraftPersonRef, DraftPerson>;
};

export function createDraftPersonFromEntrant(input: {
  racetimeUserId: string;
  racetimeName: string;
  twitchLogin: string | null;
  ref: DraftPersonRef;
}): DraftPerson {
  return {
    ref: input.ref,
    playerId: null,
    identity: {
      racetimeUserId: input.racetimeUserId,
      twitchLogin: input.twitchLogin,
      speedrunComUserId: null,
    },
    player: null,
    resolution: "unresolved",
  };
}

export function applyResolutionToDraftPerson(
  person: DraftPerson,
  resolution: Resolution,
): DraftPerson {
  if (resolution.status === "matched") {
    if (resolution.playerId) {
      return { ...person, playerId: resolution.playerId, player: null, resolution: "matched" };
    }
    return { ...person, playerId: null, player: null, resolution: "unresolved" };
  }
  if (
    resolution.status === "unresolved" ||
    resolution.status === "ambiguous" ||
    resolution.status === "conflict"
  ) {
    return { ...person, playerId: null, player: null, resolution: resolution.status };
  }
  return person;
}

export function draftPersonResolutionInput(person: DraftPerson): IdentityResolutionInput {
  return {
    racetime: person.identity.racetimeUserId ? { userId: person.identity.racetimeUserId } : null,
    twitch: person.identity.twitchLogin ? { login: person.identity.twitchLogin } : null,
    speedrunCom: person.identity.speedrunComUserId
      ? { userId: person.identity.speedrunComUserId }
      : null,
  };
}
