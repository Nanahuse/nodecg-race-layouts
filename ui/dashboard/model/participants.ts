import type { DraftConfig, DraftPerson, PlayerSnapshot } from "../../../src/domain";

type Participant = DraftConfig["participants"][number];

export function isResolvedParticipant(
  person: DraftPerson | undefined,
): person is DraftPerson & { resolution: "matched"; playerId: string; player: PlayerSnapshot } {
  return (
    person?.resolution === "matched" &&
    person.playerId != null &&
    person.playerId.trim().length > 0 &&
    person.player != null &&
    person.player.playerId === person.playerId
  );
}

export function participantAction(person: DraftPerson | undefined): {
  label: "Resolve in Player Manager" | "Edit in Player Manager";
  style: "primary" | "secondary";
} {
  return isResolvedParticipant(person)
    ? { label: "Edit in Player Manager", style: "secondary" }
    : { label: "Resolve in Player Manager", style: "primary" };
}

export function groupParticipants(draft: DraftConfig): {
  needsAttention: Participant[];
  resolved: Participant[];
} {
  const needsAttention = draft.participants.filter(
    (participant) => !isResolvedParticipant(draft.persons[participant.personRef]),
  );
  const resolved = draft.participants.filter((participant) =>
    isResolvedParticipant(draft.persons[participant.personRef]),
  );
  return { needsAttention, resolved };
}
