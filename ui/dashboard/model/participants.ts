import type { DraftConfig, DraftPerson } from "../../../src/domain";

type Participant = DraftConfig["participants"][number];

export function isResolvedParticipant(person: DraftPerson | undefined): boolean {
  return person?.resolution === "matched" && person.playerId != null && person.player != null;
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
