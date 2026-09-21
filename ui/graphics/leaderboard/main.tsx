import { createRoot } from "react-dom/client";
import type { LeaderboardPageData } from "../../../src/domain";
import { useReplicant } from "../common/use-replicant";
import { LeaderboardGraphic } from "./leaderboard-graphic";
import "./leaderboard.css";
import "../common/graphics-base.css";

export function LeaderboardPage() {
  const leaderboard = useReplicant<LeaderboardPageData | null>("leaderboard-page-data");
  return <LeaderboardGraphic data={leaderboard.ready ? leaderboard.value : null} />;
}

createRoot(document.getElementById("root")!).render(<LeaderboardPage />);
