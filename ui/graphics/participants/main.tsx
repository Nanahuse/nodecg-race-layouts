import { createRoot } from "react-dom/client";
import type { ParticipantListData } from "../../../src/domain";
import { useReplicant } from "../common/use-replicant";
import { ParticipantListGraphic } from "./participant-list-graphic";
import "./participants.css";

export function ParticipantListPage() {
  const list = useReplicant<ParticipantListData | null>("participant-list-data");
  return <ParticipantListGraphic data={list.ready ? list.value : null} />;
}

createRoot(document.getElementById("root")!).render(<ParticipantListPage />);
