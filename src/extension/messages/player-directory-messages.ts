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
  service: PlayerMappingManagementService | null,
): void {
  const unavailable = {
    ok: false as const,
    reason: "player_directory_unavailable" as const,
    message: "Player directory integration is unavailable.",
  };
  nodecg.listenFor(PLAYER_DIRECTORY_RELOAD_MESSAGE, async (_data, ack) => {
    ack(null, service ? await service.reload() : unavailable);
  });
  nodecg.listenFor(PLAYER_DIRECTORY_CREATE_MESSAGE, async (data, ack) => {
    const request = data as PlayerDirectoryCreateRequest;
    ack(null, service ? await service.create(request.input) : unavailable);
  });
  nodecg.listenFor(PLAYER_DIRECTORY_UPDATE_MESSAGE, async (data, ack) => {
    const request = data as PlayerDirectoryUpdateRequest;
    ack(
      null,
      service
        ? await service.update(request.playerId, request.expectedPlayer, request.input)
        : unavailable,
    );
  });
  nodecg.listenFor(PLAYER_DIRECTORY_DELETE_MESSAGE, async (data, ack) => {
    const request = data as PlayerDirectoryDeleteRequest;
    ack(
      null,
      service ? await service.delete(request.playerId, request.expectedPlayer) : unavailable,
    );
  });
}
