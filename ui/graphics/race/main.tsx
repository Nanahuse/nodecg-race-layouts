import { createRoot } from "react-dom/client";
import type { RaceOverlayData } from "../../../src/domain";
import { useReplicant } from "../common/use-replicant";
import { RaceGraphic } from "./race-graphic";
import "./race.css";

export function RacePage() {
  const overlay = useReplicant<RaceOverlayData | null>("race-overlay-data");
  return <RaceGraphic data={overlay.ready ? overlay.value : null} />;
}

createRoot(document.getElementById("root")!).render(<RacePage />);
