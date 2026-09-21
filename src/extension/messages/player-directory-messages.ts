import type { NodeCG } from "../../types/nodecg";
import type { PlayerMappingManagementService } from "../application/player-mapping-management-service";
import {
  PLAYER_DIRECTORY_CREATE_MESSAGE,
  PLAYER_DIRECTORY_DELETE_MESSAGE,
  PLAYER_DIRECTORY_RELOAD_MESSAGE,
  PLAYER_DIRECTORY_UPDATE_MESSAGE,
  type PlayerDirectoryCreateRequest,
  type PlayerDirectoryDeleteRequest,
  type PlayerDirectoryUpdateRequest,
} from "../../protocol/player-directory";

export * from "../../protocol/player-directory";

export function registerPlayerDirectoryMessages(
  nodecg: NodeCG,
  service: PlayerMappingManagementService,
): void {
  nodecg.listenFor(PLAYER_DIRECTORY_RELOAD_MESSAGE, async (_data, ack) => {
    ack(null, await service.reload());
  });
  nodecg.listenFor(PLAYER_DIRECTORY_CREATE_MESSAGE, async (data, ack) => {
    const request = data as PlayerDirectoryCreateRequest;
    ack(null, await service.create(request.input));
  });
  nodecg.listenFor(PLAYER_DIRECTORY_UPDATE_MESSAGE, async (data, ack) => {
    const request = data as PlayerDirectoryUpdateRequest;
    ack(null, await service.update(request.playerId, request.expectedPlayer, request.input));
  });
  nodecg.listenFor(PLAYER_DIRECTORY_DELETE_MESSAGE, async (data, ack) => {
    const request = data as PlayerDirectoryDeleteRequest;
    ack(null, await service.delete(request.playerId, request.expectedPlayer));
  });
}
