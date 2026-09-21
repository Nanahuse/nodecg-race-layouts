import type { DraftConfig, PlayerDirectory, PlayerId, PlayerMapping } from "../../domain";

function normalizeTwitchLogin(login: string): string {
  return login.trim().toLowerCase();
}

/** Detect duplicate Speedrun.com user ids / Twitch logins across draft players. */
export function validateDraftIdentityUniqueness(draft: DraftConfig): string[] {
  const issues: string[] = [];
  const speedrunUserIds = new Map<string, PlayerId>();
  const twitchLogins = new Map<string, PlayerId>();

  for (const [playerId, player] of Object.entries(draft.players)) {
    if (player.speedrunCom.state === "linked") {
      const userId = player.speedrunCom.value.userId;
      const previous = speedrunUserIds.get(userId);
      if (previous) {
        issues.push(
          `Speedrun.com user "${userId}" is linked to both "${previous}" and "${playerId}".`,
        );
      } else {
        speedrunUserIds.set(userId, playerId);
      }
    }
    if (player.twitch.state === "linked") {
      const login = normalizeTwitchLogin(player.twitch.value.login);
      if (login === "") {
        continue;
      }
      const previous = twitchLogins.get(login);
      if (previous) {
        issues.push(`Twitch login "${login}" is linked to both "${previous}" and "${playerId}".`);
      } else {
        twitchLogins.set(login, playerId);
      }
    }
  }

  return issues;
}

/** Find a different draft player already linked to this Speedrun.com user. */
export function findDraftSpeedrunConflict(
  draft: DraftConfig,
  excludePlayerId: PlayerId,
  userId: string,
): PlayerId | null {
  for (const [playerId, player] of Object.entries(draft.players)) {
    if (playerId === excludePlayerId) {
      continue;
    }
    if (player.speedrunCom.state === "linked" && player.speedrunCom.value.userId === userId) {
      return playerId;
    }
  }
  return null;
}

/** Find a different persistent player already linked to this Speedrun.com user. */
export function findDirectorySpeedrunConflict(
  directory: PlayerDirectory,
  excludePlayerId: PlayerId,
  userId: string,
): PlayerId | null {
  for (const [playerId, player] of Object.entries(directory)) {
    if (playerId === excludePlayerId) {
      continue;
    }
    if (player.speedrunCom.state === "linked" && player.speedrunCom.value.userId === userId) {
      return playerId;
    }
  }
  return null;
}

function directoryUsesTwitchLogin(player: PlayerMapping, login: string): boolean {
  if (
    player.twitch.state === "linked" &&
    normalizeTwitchLogin(player.twitch.value.login) === login
  ) {
    return true;
  }
  if (
    player.speedrunCom.state === "linked" &&
    player.speedrunCom.value.twitchLogin !== null &&
    normalizeTwitchLogin(player.speedrunCom.value.twitchLogin) === login
  ) {
    return true;
  }
  return false;
}

/** Find a different draft player already linked to this Twitch login. */
export function findDraftTwitchConflict(
  draft: DraftConfig,
  excludePlayerId: PlayerId,
  login: string,
): PlayerId | null {
  const normalized = normalizeTwitchLogin(login);
  for (const [playerId, player] of Object.entries(draft.players)) {
    if (playerId === excludePlayerId) {
      continue;
    }
    if (
      player.twitch.state === "linked" &&
      normalizeTwitchLogin(player.twitch.value.login) === normalized
    ) {
      return playerId;
    }
  }
  return null;
}

/** Find a different persistent player already linked to this Twitch login. */
export function findDirectoryTwitchConflict(
  directory: PlayerDirectory,
  excludePlayerId: PlayerId,
  login: string,
): PlayerId | null {
  const normalized = normalizeTwitchLogin(login);
  for (const [playerId, player] of Object.entries(directory)) {
    if (playerId === excludePlayerId) {
      continue;
    }
    if (directoryUsesTwitchLogin(player, normalized)) {
      return playerId;
    }
  }
  return null;
}
