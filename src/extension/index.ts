import type { NodeCG } from "../types/nodecg";
import { bootstrapExtension } from "./setup";

/**
 * NodeCG extension entry point.
 *
 * Each integration is set up independently: a missing/invalid spreadsheet
 * config disables only the spreadsheet integration, while RaceTime and the
 * `race.load` / `race.reconcile` messages remain available.
 */
export = function extension(nodecg: NodeCG): void {
  bootstrapExtension(nodecg);
};
