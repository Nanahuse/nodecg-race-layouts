import { nodecg } from "./nodecg-client";
import {
  PERSISTENCE_RETRY_MESSAGE,
  type PersistenceRetryResponse,
} from "../../../src/protocol/persistence";
export function createPersistenceApi() {
  return { retry: () => nodecg.sendMessage<PersistenceRetryResponse>(PERSISTENCE_RETRY_MESSAGE) };
}
