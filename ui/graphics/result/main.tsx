import { createRoot } from "react-dom/client";
import type { RaceResultPageData } from "../../../src/domain";
import { useReplicant } from "../common/use-replicant";
import { ResultGraphic } from "./result-graphic";
import "./result.css";
import "../common/graphics-base.css";

export function ResultPage() {
  const result = useReplicant<RaceResultPageData | null>("race-result-page-data");
  return <ResultGraphic data={result.ready ? result.value : null} />;
}

createRoot(document.getElementById("root")!).render(<ResultPage />);
