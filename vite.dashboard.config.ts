import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({ root: "ui/dashboard", plugins: [react()], build: { outDir: "../../dashboard", emptyOutDir: true, rollupOptions: { input: { "race-control": "ui/dashboard/race-control.html" } } } });
