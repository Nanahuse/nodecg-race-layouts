export type ParticipantDensity = "expanded" | "compact" | "dense" | "extra-dense";

export type ParticipantLayout = {
  density: ParticipantDensity;
  columns: 2 | 3;
};

export function getParticipantLayout(count: number): ParticipantLayout {
  if (count <= 6) return { density: "expanded", columns: 2 };
  if (count <= 12) return { density: "compact", columns: 2 };
  if (count <= 18) return { density: "dense", columns: 3 };
  return { density: "extra-dense", columns: 3 };
}
