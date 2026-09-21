import { resolveDisplayName } from "./display-name";
import type { PlayerId } from "./ids";
import type { PlayerMapping } from "./player";

/**
 * Cross-player integrity rules for a Player Directory. These are independent of
 * where the directory came from (spreadsheet, future API, ...), so they live in
 * the domain rather than in the spreadsheet integration.
 *
 * Row-level concerns (missing columns, unknown account state, missing linked
 * fields) are handled by the spreadsheet conversion layer.
 */
export const PLAYER_DIRECTORY_ISSUE_CODES = {
  playerIdDuplicate: "player_id_duplicate",
  racetimeUserIdDuplicate: "racetime_user_id_duplicate",
  speedrunComUserIdDuplicate: "speedruncom_user_id_duplicate",
  twitchUserIdDuplicate: "twitch_user_id_duplicate",
  twitchLoginDuplicate: "twitch_login_duplicate",
  displayNameUnresolved: "display_name_unresolved",
} as const;

export type PlayerDirectoryIssue = {
  code: string;
  message: string;
  playerId: PlayerId | null;
};

function addDuplicateIssue(
  issues: PlayerDirectoryIssue[],
  code: string,
  label: string,
  value: string,
  previousPlayerId: PlayerId,
  playerId: PlayerId,
): void {
  issues.push({
    code,
    message: `${label} "${value}" is used by both "${previousPlayerId}" and "${playerId}".`,
    playerId,
  });
}

/**
 * Validate the integrity of a whole directory. Returns an empty array when the
 * directory is valid.
 */
export function validatePlayerDirectory(players: readonly PlayerMapping[]): PlayerDirectoryIssue[] {
  const issues: PlayerDirectoryIssue[] = [];

  const seenPlayerIds = new Set<string>();
  const seenRacetimeUserIds = new Map<string, PlayerId>();
  const seenSpeedrunComUserIds = new Map<string, PlayerId>();
  const seenTwitchUserIds = new Map<string, PlayerId>();
  const seenTwitchLogins = new Map<string, PlayerId>();

  for (const player of players) {
    if (seenPlayerIds.has(player.playerId)) {
      issues.push({
        code: PLAYER_DIRECTORY_ISSUE_CODES.playerIdDuplicate,
        message: `Duplicate player_id "${player.playerId}".`,
        playerId: player.playerId,
      });
    } else {
      seenPlayerIds.add(player.playerId);
    }

    if (player.racetime.state === "linked") {
      const userId = player.racetime.value.userId;
      const previous = seenRacetimeUserIds.get(userId);
      if (userId !== "" && previous !== undefined) {
        addDuplicateIssue(
          issues,
          PLAYER_DIRECTORY_ISSUE_CODES.racetimeUserIdDuplicate,
          "RaceTime.gg user id",
          userId,
          previous,
          player.playerId,
        );
      } else if (userId !== "") {
        seenRacetimeUserIds.set(userId, player.playerId);
      }
    }

    if (player.speedrunCom.state === "linked") {
      const userId = player.speedrunCom.value.userId;
      const previous = seenSpeedrunComUserIds.get(userId);
      if (userId !== "" && previous !== undefined) {
        addDuplicateIssue(
          issues,
          PLAYER_DIRECTORY_ISSUE_CODES.speedrunComUserIdDuplicate,
          "Speedrun.com user id",
          userId,
          previous,
          player.playerId,
        );
      } else if (userId !== "") {
        seenSpeedrunComUserIds.set(userId, player.playerId);
      }
    }

    const twitchLogins = player.twitch.state === "linked" ? [player.twitch.value.login] : [];
    if (player.speedrunCom.state === "linked" && player.speedrunCom.value.twitchLogin) {
      twitchLogins.push(player.speedrunCom.value.twitchLogin);
    }
    if (player.twitch.state === "linked") {
      const userId = player.twitch.value.userId;
      if (userId !== null && userId !== "") {
        const previous = seenTwitchUserIds.get(userId);
        if (previous !== undefined) {
          addDuplicateIssue(
            issues,
            PLAYER_DIRECTORY_ISSUE_CODES.twitchUserIdDuplicate,
            "Twitch user id",
            userId,
            previous,
            player.playerId,
          );
        } else {
          seenTwitchUserIds.set(userId, player.playerId);
        }
      }
    }
    for (const rawLogin of twitchLogins) {
      const login = rawLogin.trim().toLowerCase();
      if (login !== "") {
        const previous = seenTwitchLogins.get(login);
        if (previous !== undefined) {
          addDuplicateIssue(
            issues,
            PLAYER_DIRECTORY_ISSUE_CODES.twitchLoginDuplicate,
            "Twitch login",
            login,
            previous,
            player.playerId,
          );
        } else {
          seenTwitchLogins.set(login, player.playerId);
        }
      }
    }

    if (resolveDisplayName(player) === null) {
      issues.push({
        code: PLAYER_DIRECTORY_ISSUE_CODES.displayNameUnresolved,
        message: `Player "${player.playerId}" has no resolvable display name.`,
        playerId: player.playerId,
      });
    }
  }

  return issues;
}
