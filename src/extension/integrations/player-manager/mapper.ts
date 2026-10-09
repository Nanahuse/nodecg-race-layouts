import { resolveDisplayName } from "@nanahuse/player-manager-protocol";

import type { DraftPerson, PlayerSnapshot } from "../../../domain/draft-person";
import type { DraftRaceParticipant } from "../../../domain/participant";
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

export function createRaceTimePlayerIndex(players: Player[]): ReadonlyMap<string, Player> {
  return new Map(
    players.flatMap((player) =>
      player.racetime ? [[player.racetime.userId, player] as const] : [],
    ),
  );
}

export function bindDraftPersonFromDirectory(
  person: DraftPerson,
  racetimeUserId: DraftRaceParticipant["racetimeUserId"],
  playersByRaceTimeId: ReadonlyMap<string, Player>,
): DraftPerson {
  const player = playersByRaceTimeId.get(racetimeUserId);
  return player
    ? bindPlayerToDraftPerson(person, player)
    : { ...person, playerId: null, player: null, resolution: "unresolved" };
}
