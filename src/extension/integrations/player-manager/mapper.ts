import { resolveDisplayName } from "@nanahuse/player-manager-protocol";

import type { DraftPerson, PlayerSnapshot } from "../../../domain/draft-person";
import type { Player } from "./types";

export function playerToSnapshot(player: Player): PlayerSnapshot {
  return {
    playerId: player.playerId,
    displayName: resolveDisplayName(player),
    racetime: player.racetime
      ? { userId: player.racetime.userId, name: player.racetime.name }
      : null,
    speedrunCom: player.speedrunCom
      ? { userId: player.speedrunCom.userId, name: player.speedrunCom.name }
      : null,
    twitch: player.twitch
      ? {
          userId: player.twitch.userId,
          login: player.twitch.login,
          displayName: player.twitch.displayName ?? null,
        }
      : null,
    youtube: player.youtube,
  };
}

export function bindPlayerToDraftPerson(person: DraftPerson, player: Player): DraftPerson {
  return {
    ...person,
    playerId: player.playerId,
    player: playerToSnapshot(player),
    resolution: "matched",
  };
}
