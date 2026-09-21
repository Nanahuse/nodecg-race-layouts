import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: "ui/graphics",
  plugins: [react()],
  build: {
    outDir: "../../graphics",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        race: "ui/graphics/race.html",
        participants: "ui/graphics/participants.html",
        leaderboard: "ui/graphics/leaderboard.html",
      },
    },
  },
});
