import type {
  DraftConfig,
  DraftPerson,
  DraftRaceScreenSlots,
  RaceReference,
  RaceSession,
} from "../../domain";
import { categorySelectionFromMapping } from "../../domain";
import { jsonEquals } from "../integrations/racetime/equality";
import type { CategoryPreset } from "./category-preset-provider";

type EntrantIdentity = { userId: string; twitchLogin: string | null };

function entrantIdentities(draft: DraftConfig): EntrantIdentity[] {
  return draft.participants.map((participant) => ({
    userId: participant.racetimeUserId,
    twitchLogin: draft.persons[participant.personRef]?.identity.twitchLogin ?? null,
  }));
}

export function needsDraftReconciliation(draft: DraftConfig, session: RaceSession): boolean {
  if (!draft.race || !session.race) return false;
  if (
    draft.race.raceId !== session.race.raceId ||
    draft.race.categorySlug !== session.race.categorySlug ||
    draft.race.goal !== session.race.goal ||
    draft.race.categoryName !== session.race.categoryName
  )
    return true;
  const current = entrantIdentities(draft);
  const next = session.race.entrants.map((entrant) => ({
    userId: entrant.userId,
    twitchLogin: entrant.twitchLogin,
  }));
  return (
    current.length !== next.length ||
    current.some((entrant, index) => {
      const candidate = next[index];
      return (
        !candidate ||
        entrant.userId !== candidate.userId ||
        entrant.twitchLogin !== candidate.twitchLogin
      );
    })
  );
}

export function participantSpeedrunUserIds(draft: DraftConfig): Set<string> {
  return new Set(
    draft.participants.flatMap((participant) => {
      const userId = draft.persons[participant.personRef]?.player?.speedrunCom?.userId;
      return userId ? [userId] : [];
    }),
  );
}

export function speedrunUserIdSetsEqual(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  return a.size === b.size && [...a].every((value) => b.has(value));
}

export function countUnresolvedPeople(draft: DraftConfig): number {
  return draft.participants.reduce((count, participant) => {
    const person = draft.persons[participant.personRef];
    return count + (person?.resolution === "matched" && person.playerId && person.player ? 0 : 1);
  }, 0);
}

export type ReconcileDraftInput = {
  draft: DraftConfig;
  session: RaceSession;
  resolvedNewPersons: ReadonlyMap<string, DraftPerson>;
  resolvedExistingPersons?: ReadonlyMap<string, DraftPerson>;
  categoryPreset?: CategoryPreset;
};

export type DraftReconcileOutcome = {
  draft: DraftConfig;
  changed: boolean;
  participantsChanged: boolean;
  categoryChanged: boolean;
  unresolvedPlayerCount: number;
};

function keepSlot(value: string | null, participantIds: ReadonlySet<string>): string | null {
  return value !== null && participantIds.has(value) ? value : null;
}

function participantSetChanged(
  previous: DraftConfig["participants"],
  next: DraftConfig["participants"],
): boolean {
  return (
    previous.length !== next.length ||
    previous.some(
      (participant) =>
        !next.some((candidate) => candidate.racetimeUserId === participant.racetimeUserId),
    )
  );
}

export function reconcileDraft(input: ReconcileDraftInput): DraftReconcileOutcome {
  const { draft, session } = input;
  const sessionRace = session.race;
  const sessionUrl = session.canonicalUrl;
  if (!sessionRace || !sessionUrl) throw new Error("Cannot reconcile without a loaded race.");
  if (!needsDraftReconciliation(draft, session)) {
    return {
      draft,
      changed: false,
      participantsChanged: false,
      categoryChanged: false,
      unresolvedPlayerCount: countUnresolvedPeople(draft),
    };
  }

  const categoryChanged =
    draft.race?.categorySlug !== sessionRace.categorySlug || draft.race?.goal !== sessionRace.goal;
  const existingByUserId = new Map(
    draft.participants.map((participant) => [participant.racetimeUserId, participant]),
  );
  const participants = sessionRace.entrants.map((entrant) => {
    const existing = existingByUserId.get(entrant.userId);
    if (existing) return existing;
    const person = input.resolvedNewPersons.get(entrant.userId);
    if (!person)
      throw new Error(`Missing Player Manager resolution for entrant "${entrant.userId}".`);
    return { racetimeUserId: entrant.userId, personRef: person.ref };
  });

  const persons: DraftConfig["persons"] = {};
  for (const participant of participants) {
    const entrant = sessionRace.entrants.find(
      (candidate) => candidate.userId === participant.racetimeUserId,
    );
    const existingPerson = draft.persons[participant.personRef];
    const updatedPerson = input.resolvedExistingPersons?.get(participant.racetimeUserId);
    const person =
      updatedPerson ?? existingPerson ?? input.resolvedNewPersons.get(participant.racetimeUserId);
    if (!person)
      throw new Error(`Missing DraftPerson for entrant "${participant.racetimeUserId}".`);
    persons[person.ref] = {
      ...person,
      identity: {
        ...person.identity,
        racetimeUserId: entrant?.userId ?? person.identity.racetimeUserId,
        twitchLogin: entrant?.twitchLogin ?? null,
      },
    };
  }

  const participantIds = new Set(participants.map((participant) => participant.racetimeUserId));
  const raceScreenSlots: DraftRaceScreenSlots = {
    1: keepSlot(draft.raceScreenSlots[1], participantIds),
    2: keepSlot(draft.raceScreenSlots[2], participantIds),
    3: keepSlot(draft.raceScreenSlots[3], participantIds),
    4: keepSlot(draft.raceScreenSlots[4], participantIds),
  };
  const race: RaceReference = {
    canonicalUrl: sessionUrl,
    raceId: sessionRace.raceId,
    categorySlug: sessionRace.categorySlug,
    categoryName: sessionRace.categoryName,
    goal: sessionRace.goal,
  };
  const candidate: DraftConfig = {
    ...draft,
    race,
    participants,
    persons,
    raceScreenSlots,
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
    unresolvedPlayerCount: countUnresolvedPeople(finalDraft),
  };
}
