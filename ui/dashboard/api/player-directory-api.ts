import { nodecg } from "./nodecg-client";
import {
  PLAYER_DIRECTORY_CREATE_MESSAGE,
  PLAYER_DIRECTORY_DELETE_MESSAGE,
  PLAYER_DIRECTORY_RELOAD_MESSAGE,
  PLAYER_DIRECTORY_UPDATE_MESSAGE,
  type PlayerDirectoryCreateResponse,
  type PlayerDirectoryDeleteResponse,
  type PlayerDirectoryReloadResponse,
  type PlayerDirectoryUpdateResponse,
  type PlayerMappingEditInput,
} from "../../../src/protocol/player-directory";
import type { PlayerMapping } from "../../../src/domain";

export function createPlayerDirectoryApi() {
  return {
    reload: () =>
      nodecg.sendMessage<PlayerDirectoryReloadResponse>(PLAYER_DIRECTORY_RELOAD_MESSAGE),
    create: (input: PlayerMappingEditInput) =>
      nodecg.sendMessage<PlayerDirectoryCreateResponse>(PLAYER_DIRECTORY_CREATE_MESSAGE, { input }),
    update: (playerId: string, expectedPlayer: PlayerMapping, input: PlayerMappingEditInput) =>
      nodecg.sendMessage<PlayerDirectoryUpdateResponse>(PLAYER_DIRECTORY_UPDATE_MESSAGE, {
        playerId,
        expectedPlayer,
        input,
      }),
    delete: (playerId: string, expectedPlayer: PlayerMapping) =>
      nodecg.sendMessage<PlayerDirectoryDeleteResponse>(PLAYER_DIRECTORY_DELETE_MESSAGE, {
        playerId,
        expectedPlayer,
      }),
  };
}
