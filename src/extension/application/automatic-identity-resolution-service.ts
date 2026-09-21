import type { DraftConfig, DraftPlayer, PlayerDirectory, PlayerId } from "../../domain";
import type { NodeCGLogger } from "../../types/nodecg";
import type {
  SpeedrunUserGetOutcome,
  SpeedrunUsersSearchOutcome,
} from "./speedrun-discovery-service";
import { mapWithConcurrency } from "./concurrency";
import {
  findDirectorySpeedrunConflict,
  findDraftSpeedrunConflict,
} from "./participant-identity-validation";

export const AUTOMATIC_RESOLUTION_CONCURRENCY = 4;
export const AUTOMATIC_RESOLUTION_SEARCH_LIMIT = 2;

export type SpeedrunUserSearchMode = "name" | "lookup" | "twitch";

/** Minimal Speedrun.com user lookup used by automatic resolution. */
export interface SpeedrunUserLookup {
  searchUsers(
    query: string,
    mode: SpeedrunUserSearchMode,
    limit?: number,
  ): Promise<SpeedrunUsersSearchOutcome>;
  getUser(userId: string): Promise<SpeedrunUserGetOutcome>;
}

export type AutomaticIdentityResolutionSummary = {
  attempted: number;
  linked: number;
  /** Attempted but zero exact candidates. */
  unresolved: number;
  ambiguous: number;
  conflicted: number;
  failed: number;
  rateLimited: boolean;
};

export type AutomaticIdentityResolutionResult = {
  draft: DraftConfig;
  summary: AutomaticIdentityResolutionSummary;
};

export interface AutomaticIdentityResolver {
  resolve(
    draft: DraftConfig,
    directory: PlayerDirectory,
  ): Promise<AutomaticIdentityResolutionResult>;
}

export const noopAutomaticIdentityResolver: AutomaticIdentityResolver = {
  resolve: async (draft) => ({
    draft,
    summary: {
      attempted: 0,
      linked: 0,
      unresolved: 0,
      ambiguous: 0,
      conflicted: 0,
      failed: 0,
      rateLimited: false,
    },
  }),
};

export type AutomaticIdentityResolutionServiceOptions = {
  lookup: SpeedrunUserLookup;
  log: NodeCGLogger;
  concurrency?: number;
};

function targetPlayerIds(draft: DraftConfig): PlayerId[] {
  const playerIds = new Set<PlayerId>();
  for (const participant of draft.participants) {
    if (!participant.playerId) {
      continue;
    }
    const player = draft.players[participant.playerId];
    if (player?.speedrunCom.state === "unresolved") {
      playerIds.add(participant.playerId);
    }
  }
  return [...playerIds];
}

function sameTwitchLogin(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * Best-effort automatic Speedrun.com identity resolution.
 *
 * Only `unresolved` Speedrun.com identities are touched; confirmed
 * `linked` / `none` values (operator or spreadsheet) are never overwritten. A
 * Speedrun.com failure never fails the caller's race load / reconcile.
 */
export class AutomaticIdentityResolutionService implements AutomaticIdentityResolver {
  private readonly lookup: SpeedrunUserLookup;
  private readonly log: NodeCGLogger;
  private readonly concurrency: number;

  constructor(options: AutomaticIdentityResolutionServiceOptions) {
    this.lookup = options.lookup;
    this.log = options.log;
    this.concurrency = options.concurrency ?? AUTOMATIC_RESOLUTION_CONCURRENCY;
  }

  async resolve(
    draft: DraftConfig,
    directory: PlayerDirectory,
  ): Promise<AutomaticIdentityResolutionResult> {
    const summary: AutomaticIdentityResolutionSummary = {
      attempted: 0,
      linked: 0,
      unresolved: 0,
      ambiguous: 0,
      conflicted: 0,
      failed: 0,
      rateLimited: false,
    };

    const targets = targetPlayerIds(draft);
    if (targets.length === 0) {
      return { draft, summary };
    }

    this.logEvent("identity.auto_resolution.started", { participantCount: targets.length });

    const players: Record<PlayerId, DraftPlayer> = { ...draft.players };

    // 1. Complete Twitch from RaceTime metadata (no API call).
    for (const playerId of targets) {
      const player = players[playerId];
      if (!player || player.twitch.state !== "unresolved") {
        continue;
      }
      if (player.racetime.state !== "linked") {
        continue;
      }
      const login = player.racetime.value.twitchLogin;
      if (login !== null && login.trim() !== "") {
        players[playerId] = {
          ...player,
          twitch: {
            state: "linked",
            value: { userId: null, login: login.trim() },
            source: "racetime",
          },
        };
      }
    }

    // 2. Resolve Speedrun.com via Twitch exact match.
    const targetSet = new Set(targets);
    const usedUserIds = new Set<string>();
    for (const [playerId, player] of Object.entries(players)) {
      if (!targetSet.has(playerId) && player.speedrunCom.state === "linked") {
        usedUserIds.add(player.speedrunCom.value.userId);
      }
    }
    for (const player of Object.values(directory)) {
      if (player.speedrunCom.state === "linked") {
        usedUserIds.add(player.speedrunCom.value.userId);
      }
    }

    let stop = false;

    await mapWithConcurrency(targets, this.concurrency, async (playerId) => {
      const player = players[playerId];
      if (!player || player.twitch.state !== "linked") {
        return;
      }
      const login = player.twitch.value.login.trim();
      if (login === "" || stop) {
        return;
      }

      summary.attempted += 1;

      let outcome: SpeedrunUsersSearchOutcome;
      try {
        outcome = await this.lookup.searchUsers(login, "twitch", AUTOMATIC_RESOLUTION_SEARCH_LIMIT);
      } catch {
        summary.failed += 1;
        return;
      }

      if (!outcome.ok) {
        summary.failed += 1;
        if (outcome.reason === "rate_limited") {
          summary.rateLimited = true;
          stop = true;
        }
        return;
      }

      const candidates = outcome.users.filter(
        (user) => user.twitchLogin !== null && sameTwitchLogin(user.twitchLogin, login),
      );
      if (candidates.length === 0) {
        summary.unresolved += 1;
        return;
      }
      if (candidates.length > 1) {
        summary.ambiguous += 1;
        return;
      }
      const candidate = candidates[0];
      if (!candidate) {
        summary.ambiguous += 1;
        return;
      }

      const draftConflict = findDraftSpeedrunConflict(
        { ...draft, players },
        playerId,
        candidate.userId,
      );
      const directoryConflict = findDirectorySpeedrunConflict(
        directory,
        playerId,
        candidate.userId,
      );
      if (usedUserIds.has(candidate.userId) || draftConflict || directoryConflict) {
        summary.conflicted += 1;
        return;
      }

      usedUserIds.add(candidate.userId);
      players[playerId] = {
        ...player,
        speedrunCom: {
          state: "linked",
          value: {
            userId: candidate.userId,
            name: candidate.name,
            twitchLogin: candidate.twitchLogin,
          },
          source: "auto",
        },
      };
      summary.linked += 1;
    });

    this.logEvent("identity.auto_resolution.completed", {
      participantCount: targets.length,
      attempted: summary.attempted,
      linked: summary.linked,
      unresolved: summary.unresolved,
      ambiguous: summary.ambiguous,
      conflicted: summary.conflicted,
      failed: summary.failed,
      rateLimited: summary.rateLimited,
    });

    return { draft: { ...draft, players }, summary };
  }

  private logEvent(event: string, fields: Record<string, unknown>): void {
    const parts: string[] = [];
    for (const [key, value] of Object.entries(fields)) {
      if (value === undefined) {
        continue;
      }
      parts.push(`${key}=${String(value)}`);
    }
    const message = parts.length > 0 ? `[${event}] ${parts.join(" ")}` : `[${event}]`;
    this.log.info(message);
  }
}
