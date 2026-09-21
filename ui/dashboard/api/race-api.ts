import { nodecg } from "./nodecg-client";
import {
  RACE_LOAD_MESSAGE,
  RACE_RECONCILE_MESSAGE,
  type RaceLoadResponse,
  type RaceReconcileResponse,
} from "../../../src/protocol/race";
export const raceApi = {
  loadRace: (url: string) =>
    nodecg.sendMessage<RaceLoadResponse>(RACE_LOAD_MESSAGE, { url: url.trim() }),
  reconcileRace: (expectedDraftRevision: number) =>
    nodecg.sendMessage<RaceReconcileResponse>(RACE_RECONCILE_MESSAGE, { expectedDraftRevision }),
};
