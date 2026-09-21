import type { DraftConfig, DraftPlayer, PlayerId } from "../../domain";

/**
 * Player ids referenced by the draft: participants and commentators. Race
 * screen slots reference RaceTime user ids, so they do not keep players alive.
 */
export function referencedDraftPlayerIds(draft: DraftConfig): Set<PlayerId> {
  const playerIds = new Set<PlayerId>();
  for (const participant of draft.participants) {
    if (participant.playerId) {
      playerIds.add(participant.playerId);
    }
  }
  for (const playerId of draft.commentatorPlayerIds) {
    playerIds.add(playerId);
  }
  return playerIds;
}

/** Drop draft players no participant or commentator references. */
export function pruneUnreferencedDraftPlayers(draft: DraftConfig): DraftConfig {
  const referenced = referencedDraftPlayerIds(draft);
  const players: Record<PlayerId, DraftPlayer> = {};
  for (const playerId of referenced) {
    const player = draft.players[playerId];
    if (player) {
      players[playerId] = player;
    }
  }
  return { ...draft, players };
}
