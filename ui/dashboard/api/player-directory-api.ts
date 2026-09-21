import { nodecg } from "./nodecg-client";
import {
  PLAYER_DIRECTORY_RELOAD_MESSAGE,
  type PlayerDirectoryReloadResponse,
} from "../../../src/protocol/player-directory";

export function createPlayerDirectoryApi() {
  return {
    reload: () =>
      nodecg.sendMessage<PlayerDirectoryReloadResponse>(PLAYER_DIRECTORY_RELOAD_MESSAGE),
  };
}
