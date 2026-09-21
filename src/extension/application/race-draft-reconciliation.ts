import type {
  DraftConfig,
  DraftPlayer,
  DraftRaceParticipant,
  DraftRaceScreenSlots,
  DraftRaceTimeAccountLink,
  PlayerDirectory,
  PlayerId,
  RaceReference,
  RaceSession,
  RaceTimeEntrant,
} from "../../domain";
import { categorySelectionFromMapping } from "../../domain";
import { jsonEquals } from "../integrations/racetime/equality";
import type { CategoryPreset } from "./category-preset-provider";
import {
  resolveEntrants,
  type PlayerIdFactory,
  type ResolvedEntrant,
} from "./player-resolution-service";

type EntrantIdentity = {
  userId: string;
  name: string | null;
  twitchLogin: string | null;
};

function draftEntrantIdentities(draft: DraftConfig): EntrantIdentity[] {
  return draft.participants.map((participant) => {
    const player = participant.playerId ? draft.players[participant.playerId] : undefined;
    const racetime = player?.racetime;
    if (racetime && racetime.state === "linked") {
      return {
        userId: participant.racetimeUserId,
        name: racetime.value.name,
        twitchLogin: racetime.value.twitchLogin,
      };
    }
    return { userId: participant.racetimeUserId, name: null, twitchLogin: null };
  });
}

/**
 * Decide whether the RaceTime session contains structural changes that must be
 * pulled into the draft. Result-only changes (status, finish time, place, DNF,
 * DQ) are deliberately ignored.
 */
export function needsDraftReconciliation(draft: DraftConfig, session: RaceSession): boolean {
  if (!draft.race || !session.race) {
    return false;
  }

  if (draft.race.raceId !== session.race.raceId) {
    return true;
  }
  if (draft.race.categorySlug !== session.race.categorySlug) {
    return true;
  }
  if (draft.race.goal !== session.race.goal) {
    return true;
  }
  // A display-name-only change still updates the draft race reference (but not
  // the saved category preset).
  if (draft.race.categoryName !== session.race.categoryName) {
    return true;
  }

  const current = draftEntrantIdentities(draft);
  const next = session.race.entrants.map((entrant) => ({
    userId: entrant.userId,
    name: entrant.name,
    twitchLogin: entrant.twitchLogin,
  }));

  if (current.length !== next.length) {
    return true;
  }
  for (let index = 0; index < current.length; index += 1) {
    const currentEntrant = current[index];
    const nextEntrant = next[index];
    if (!currentEntrant || !nextEntrant) {
      return true;
    }
    if (
      currentEntrant.userId !== nextEntrant.userId ||
      currentEntrant.name !== nextEntrant.name ||
      currentEntrant.twitchLogin !== nextEntrant.twitchLogin
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Effective Speedrun.com user ids referenced by draft participants. Used to
 * decide whether a snapshot must be reset (set changed) or merely retagged.
 */
export function participantSpeedrunUserIds(draft: DraftConfig): Set<string> {
  const userIds = new Set<string>();
  for (const participant of draft.participants) {
    if (!participant.playerId) {
      continue;
    }
    const player = draft.players[participant.playerId];
    if (player?.speedrunCom.state === "linked") {
      userIds.add(player.speedrunCom.value.userId);
    }
  }
  return userIds;
}

export function speedrunUserIdSetsEqual(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a.size !== b.size) {
    return false;
  }
  for (const value of a) {
    if (!b.has(value)) {
      return false;
    }
  }
  return true;
}

export function countUnresolvedPlayers(draft: DraftConfig): number {
  const referenced = new Set<PlayerId>();
  for (const participant of draft.participants) {
    if (participant.playerId) {
      referenced.add(participant.playerId);
    }
  }
  for (const playerId of draft.commentatorPlayerIds) {
    referenced.add(playerId);
  }

  let count = 0;
  for (const playerId of referenced) {
    const player = draft.players[playerId];
    if (!player) {
      continue;
    }
    if (
      player.racetime.state === "unresolved" ||
      player.speedrunCom.state === "unresolved" ||
      player.twitch.state === "unresolved"
    ) {
      count += 1;
    }
  }
  return count;
}

export type ReconcileDraftInput = {
  draft: DraftConfig;
  session: RaceSession;
  directory: PlayerDirectory;
  playerIdFactory: PlayerIdFactory;
  /** Preset for the new category key, when the category/goal changed. */
  categoryPreset?: CategoryPreset;
};

export type DraftReconcileOutcome = {
  draft: DraftConfig;
  changed: boolean;
  participantsChanged: boolean;
  categoryChanged: boolean;
  unresolvedPlayerCount: number;
};

function updateRaceTimeLink(
  existing: DraftRaceTimeAccountLink,
  entrant: RaceTimeEntrant,
): DraftRaceTimeAccountLink {
  const source = existing.state === "linked" ? existing.source : "racetime";
  return {
    state: "linked",
    value: {
      userId: entrant.userId,
      name: entrant.name,
      twitchLogin: entrant.twitchLogin,
    },
    source,
  };
}

function keepSlot(value: string | null, participantIds: ReadonlySet<string>): string | null {
  return value !== null && participantIds.has(value) ? value : null;
}

function participantSetChanged(
  previous: readonly DraftRaceParticipant[],
  next: readonly DraftRaceParticipant[],
): boolean {
  const previousIds = new Set(previous.map((participant) => participant.racetimeUserId));
  const nextIds = new Set(next.map((participant) => participant.racetimeUserId));
  if (previousIds.size !== nextIds.size) {
    return true;
  }
  for (const id of previousIds) {
    if (!nextIds.has(id)) {
      return true;
    }
  }
  return false;
}

/**
 * Apply the latest RaceTime session to the draft, preserving operator edits,
 * valid slots and commentators. Pure.
 */
export function reconcileDraft(input: ReconcileDraftInput): DraftReconcileOutcome {
  const { draft, session } = input;
  const sessionRace = session.race;
  const sessionUrl = session.canonicalUrl;

  if (!sessionRace || !sessionUrl) {
    throw new Error("Cannot reconcile without a loaded race.");
  }

  if (!needsDraftReconciliation(draft, session)) {
    return {
      draft,
      changed: false,
      participantsChanged: false,
      categoryChanged: false,
      unresolvedPlayerCount: countUnresolvedPlayers(draft),
    };
  }

  const categoryChanged =
    draft.race?.categorySlug !== sessionRace.categorySlug || draft.race?.goal !== sessionRace.goal;

  const existingByRacetimeUserId = new Map<string, DraftRaceParticipant>();
  for (const participant of draft.participants) {
    existingByRacetimeUserId.set(participant.racetimeUserId, participant);
  }

  const players: Record<PlayerId, DraftPlayer> = { ...draft.players };
  const usedPlayerIds = new Set<PlayerId>();
  const newEntrants: RaceTimeEntrant[] = [];

  // Keep existing participants and refresh their RaceTime identity.
  for (const entrant of sessionRace.entrants) {
    const existing = existingByRacetimeUserId.get(entrant.userId);
    if (!existing) {
      newEntrants.push(entrant);
      continue;
    }
    const playerId = existing.playerId;
    if (!playerId) {
      continue;
    }
    usedPlayerIds.add(playerId);
    const player = players[playerId];
    if (player) {
      players[playerId] = { ...player, racetime: updateRaceTimeLink(player.racetime, entrant) };
    }
  }

  const resolution = resolveEntrants({
    entrants: newEntrants,
    directory: input.directory,
    usedPlayerIds,
    playerIdFactory: input.playerIdFactory,
  });

  const resolvedByRacetimeUserId = new Map<string, ResolvedEntrant>();
  for (const entry of resolution.resolved) {
    resolvedByRacetimeUserId.set(entry.entrant.userId, entry);
    players[entry.playerId] = entry.player;
    usedPlayerIds.add(entry.playerId);
  }

  const participants: DraftRaceParticipant[] = [];
  for (const entrant of sessionRace.entrants) {
    const existing = existingByRacetimeUserId.get(entrant.userId);
    if (existing) {
      participants.push({ racetimeUserId: entrant.userId, playerId: existing.playerId });
      continue;
    }
    const resolved = resolvedByRacetimeUserId.get(entrant.userId);
    if (!resolved) {
      throw new Error(`Failed to resolve entrant "${entrant.userId}".`);
    }
    participants.push({ racetimeUserId: entrant.userId, playerId: resolved.playerId });
  }

  const participantRacetimeIds = new Set(participants.map((p) => p.racetimeUserId));
  const raceScreenSlots: DraftRaceScreenSlots = {
    1: keepSlot(draft.raceScreenSlots[1], participantRacetimeIds),
    2: keepSlot(draft.raceScreenSlots[2], participantRacetimeIds),
    3: keepSlot(draft.raceScreenSlots[3], participantRacetimeIds),
    4: keepSlot(draft.raceScreenSlots[4], participantRacetimeIds),
  };

  const race: RaceReference = {
    canonicalUrl: sessionUrl,
    raceId: sessionRace.raceId,
    categorySlug: sessionRace.categorySlug,
    categoryName: sessionRace.categoryName,
    goal: sessionRace.goal,
  };

  // Keep only players referenced by participants or commentators.
  const referencedPlayerIds = new Set<PlayerId>();
  for (const participant of participants) {
    if (participant.playerId) {
      referencedPlayerIds.add(participant.playerId);
    }
  }
  for (const playerId of draft.commentatorPlayerIds) {
    referencedPlayerIds.add(playerId);
  }
  const prunedPlayers: Record<PlayerId, DraftPlayer> = {};
  for (const playerId of referencedPlayerIds) {
    const player = players[playerId];
    if (player) {
      prunedPlayers[playerId] = player;
    }
  }

  const candidate: DraftConfig = {
    revision: draft.revision,
    race,
    participants,
    players: prunedPlayers,
    raceScreenSlots,
    commentatorPlayerIds: [...draft.commentatorPlayerIds],
    categorySelection: categoryChanged
      ? categorySelectionFromMapping(input.categoryPreset?.mapping ?? null)
      : draft.categorySelection,
    categoryPresentation: categoryChanged
      ? (input.categoryPreset?.presentation ?? null)
      : draft.categoryPresentation,
  };

  const changed = !jsonEquals(candidate, draft);
  const finalDraft = changed ? { ...candidate, revision: draft.revision + 1 } : draft;

  return {
    draft: finalDraft,
    changed,
    participantsChanged: participantSetChanged(draft.participants, participants),
    categoryChanged,
    unresolvedPlayerCount: countUnresolvedPlayers(finalDraft),
  };
}
