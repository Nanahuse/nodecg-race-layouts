import type { PlayerMapping } from "../../../src/domain";
import type { PlayerMappingEditInput } from "../../../src/protocol/player-directory";
import type { PlayerUsage } from "./model";

export function createEmptyPlayerInput(): PlayerMappingEditInput {
  return {
    manualDisplayName: "",
    racetime: { state: "none" },
    speedrunCom: { state: "none" },
    twitch: { state: "none" },
  };
}
export function playerMappingToEditInput(player: PlayerMapping): PlayerMappingEditInput {
  return {
    manualDisplayName: player.manualDisplayName ?? "",
    racetime:
      player.racetime.state === "linked"
        ? {
            state: "linked",
            userId: player.racetime.value.userId,
            name: player.racetime.value.name,
            twitchLogin: player.racetime.value.twitchLogin,
          }
        : { state: "none" },
    speedrunCom:
      player.speedrunCom.state === "linked"
        ? { state: "linked", userId: player.speedrunCom.value.userId }
        : { state: "none" },
    twitch:
      player.twitch.state === "linked"
        ? { state: "linked", login: player.twitch.value.login }
        : { state: "none" },
  };
}
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
export const isEditInputEqual = (a: PlayerMappingEditInput, b: PlayerMappingEditInput) =>
  equal(a, b);
export const isPlayerMappingEqual = (a: PlayerMapping, b: PlayerMapping) => equal(a, b);
export const isUsageBlockingEdit = (usage: PlayerUsage | undefined) =>
  Boolean(usage?.inDraft || usage?.onAir || usage?.pendingPersistence);
