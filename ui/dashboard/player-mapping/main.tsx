import { createRoot } from "react-dom/client";
import { PlayerMappingApp } from "./app";
import "../styles.css";
import "./player-mapping.css";
createRoot(document.getElementById("root")!).render(<PlayerMappingApp />);
