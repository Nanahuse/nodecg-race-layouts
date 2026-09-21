import type {
  ActiveConfig,
  DraftConfig,
  PlayerMapping,
  PostApplyPersistenceState,
} from "../../../src/domain";
import { resolveDisplayName } from "../../../src/domain";

export type PlayerUsage = { inDraft: boolean; onAir: boolean; pendingPersistence: boolean };
export type PlayerFilter = "all" | "missing-racetime" | "missing-speedruncom" | "missing-twitch";

export function getPlayerUsage(
  id: string,
  draft: DraftConfig,
  active: ActiveConfig | null,
  persistence: PostApplyPersistenceState,
): PlayerUsage {
  return {
    inDraft:
      draft.participants.some((item) => item.playerId === id) ||
      draft.commentatorPlayerIds.includes(id),
    onAir: Boolean(
      active &&
      (active.participants.some((item) => item.playerId === id) ||
        active.commentatorPlayerIds.includes(id)),
    ),
    pendingPersistence: persistence.queue.some((item) =>
      item.players.some((player) => player.playerId === id),
    ),
  };
}

export function searchPlayers(players: PlayerMapping[], query: string): PlayerMapping[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return players;
  return players.filter((player) => {
    const values = [player.playerId, resolveDisplayName(player) ?? ""];
    if (player.racetime.state === "linked")
      values.push(
        player.racetime.value.userId,
        player.racetime.value.name,
        player.racetime.value.twitchLogin ?? "",
      );
    if (player.speedrunCom.state === "linked")
      values.push(
        player.speedrunCom.value.userId,
        player.speedrunCom.value.name,
        player.speedrunCom.value.twitchLogin ?? "",
      );
    if (player.twitch.state === "linked")
      values.push(player.twitch.value.userId ?? "", player.twitch.value.login);
    return values.some((value) => value.toLowerCase().includes(normalized));
  });
}

export function filterPlayers(players: PlayerMapping[], filter: PlayerFilter): PlayerMapping[] {
  if (filter === "all") return players;
  return players.filter((player) =>
    filter === "missing-racetime"
      ? player.racetime.state === "none"
      : filter === "missing-speedruncom"
        ? player.speedrunCom.state === "none"
        : player.twitch.state === "none",
  );
}

export function sortPlayers(players: PlayerMapping[]): PlayerMapping[] {
  return [...players].sort(
    (a, b) =>
      (resolveDisplayName(a) ?? "").localeCompare(resolveDisplayName(b) ?? "") ||
      a.playerId.localeCompare(b.playerId),
  );
}
