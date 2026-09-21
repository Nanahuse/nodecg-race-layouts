import type {
  DraftConfig,
  DraftPlayer,
  DraftRaceTimeAccountLink,
  DraftSpeedrunSnapshot,
  IntegrationStatus,
  PlayerDirectory,
  PlayerId,
  PlayerMapping,
} from "../../domain";
import { retagDraftSpeedrunSnapshot } from "../../domain";
import {
  createDefaultDraftConfig,
  createDefaultDraftSpeedrunSnapshot,
  createDefaultIntegrationStatus,
} from "../../replicants/defaults";
import type { NodeCGLogger, Replicant } from "../../types/nodecg";
import { jsonEquals } from "../integrations/racetime/equality";
import type { SpeedrunUserLookup } from "./automatic-identity-resolution-service";
import { computeDraftBroadcastState } from "./broadcast-status";
import { pruneUnreferencedDraftPlayers } from "./draft-player-references";
import {
  findDirectorySpeedrunConflict,
  findDirectoryTwitchConflict,
  validateDraftIdentityUniqueness,
} from "./participant-identity-validation";
import { playerMappingToDraftPlayer } from "./player-resolution-service";
import {
  countUnresolvedPlayers,
  participantSpeedrunUserIds,
  speedrunUserIdSetsEqual,
} from "./race-draft-reconciliation";
import { validateDraftIntegrity } from "./race-draft-service";

export type ParticipantFailureReason =
  | "draft_changed"
  | "no_race_loaded"
  | "participant_not_found"
  | "player_not_found"
  | "player_in_use"
  | "racetime_conflict"
  | "identity_conflict"
  | "invalid_twitch_login"
  | "speedrun_user_not_found"
  | "speedrun_lookup_failed"
  | "operation_failed";

export type ParticipantMutationOutcome =
  | {
      ok: true;
      changed: boolean;
      draftRevision: number;
      unresolvedPlayerCount: number;
    }
  | { ok: false; reason: ParticipantFailureReason; message: string };

export type ParticipantDraftServiceOptions = {
  draftConfig: Replicant<DraftConfig>;
  draftSpeedrunSnapshot: Replicant<DraftSpeedrunSnapshot>;
  playerDirectory: Replicant<PlayerDirectory>;
  integrationStatus: Replicant<IntegrationStatus>;
  lookup: SpeedrunUserLookup;
  log: NodeCGLogger;
};

type GuardFailure = { reason: ParticipantFailureReason; message: string };
type GuardResult = GuardFailure | { playerId: PlayerId };

function isGuardFailure(value: GuardResult): value is GuardFailure {
  return "reason" in value;
}

function fail(reason: ParticipantFailureReason, message: string): ParticipantMutationOutcome {
  return { ok: false, reason, message };
}

/**
 * Manual participant identity editing on the draft. Never writes to the player
 * directory / spreadsheet or to active state.
 */
export class ParticipantDraftService {
  private readonly draftConfig: Replicant<DraftConfig>;
  private readonly draftSpeedrunSnapshot: Replicant<DraftSpeedrunSnapshot>;
  private readonly playerDirectory: Replicant<PlayerDirectory>;
  private readonly integrationStatus: Replicant<IntegrationStatus>;
  private readonly lookup: SpeedrunUserLookup;
  private readonly log: NodeCGLogger;

  constructor(options: ParticipantDraftServiceOptions) {
    this.draftConfig = options.draftConfig;
    this.draftSpeedrunSnapshot = options.draftSpeedrunSnapshot;
    this.playerDirectory = options.playerDirectory;
    this.integrationStatus = options.integrationStatus;
    this.lookup = options.lookup;
    this.log = options.log;
  }

  async setPlayer(
    expectedDraftRevision: number,
    racetimeUserId: string,
    targetPlayerId: string,
  ): Promise<ParticipantMutationOutcome> {
    const draft = this.currentDraft();
    const guard = this.guard(draft, expectedDraftRevision, racetimeUserId);
    if (isGuardFailure(guard)) {
      return this.failAndLog("participant.player.updated", guard);
    }
    const { playerId: currentPlayerId } = guard;

    if (targetPlayerId === currentPlayerId) {
      return this.noChange(draft);
    }

    const directory = this.playerDirectory.value ?? {};
    const directoryPlayer = directory[targetPlayerId];
    const draftTarget = draft.players[targetPlayerId];
    if (!directoryPlayer && !draftTarget) {
      return this.failAndLog("participant.player.updated", {
        reason: "player_not_found",
        message: `Player "${targetPlayerId}" was not found.`,
      });
    }

    const usedByOtherParticipant = draft.participants.some(
      (participant) =>
        participant.racetimeUserId !== racetimeUserId && participant.playerId === targetPlayerId,
    );
    if (usedByOtherParticipant) {
      return this.failAndLog("participant.player.updated", {
        reason: "player_in_use",
        message: `Player "${targetPlayerId}" is already assigned to another participant.`,
      });
    }

    const currentPlayer = draft.players[currentPlayerId];
    if (!currentPlayer) {
      return this.failAndLog("participant.player.updated", {
        reason: "participant_not_found",
        message: `Participant "${racetimeUserId}" has no draft player.`,
      });
    }
    const currentRaceTime = currentPlayer.racetime;

    const conflict = this.raceTimeConflict(
      currentRaceTime,
      draftTarget,
      directoryPlayer,
      targetPlayerId,
    );
    if (conflict) {
      return this.failAndLog("participant.player.updated", conflict);
    }

    let targetDraftPlayer: DraftPlayer;
    if (draftTarget) {
      targetDraftPlayer = draftTarget;
    } else if (directoryPlayer) {
      targetDraftPlayer = playerMappingToDraftPlayer(
        directoryPlayer,
        this.linkedRaceTimeOrUnresolved(currentRaceTime),
      );
    } else {
      return this.failAndLog("participant.player.updated", {
        reason: "player_not_found",
        message: `Player "${targetPlayerId}" was not found.`,
      });
    }

    if (targetDraftPlayer.racetime.state !== "linked") {
      if (currentRaceTime.state !== "linked") {
        return this.failAndLog("participant.player.updated", {
          reason: "racetime_conflict",
          message: "The current participant has no RaceTime identity.",
        });
      }
      targetDraftPlayer = {
        ...targetDraftPlayer,
        racetime: { ...currentRaceTime, source: "manual" },
      };
    }

    const players: Record<PlayerId, DraftPlayer> = {
      ...draft.players,
      [targetPlayerId]: targetDraftPlayer,
    };
    const participants = draft.participants.map((participant) =>
      participant.racetimeUserId === racetimeUserId
        ? { ...participant, playerId: targetPlayerId }
        : participant,
    );
    const candidate = pruneUnreferencedDraftPlayers({ ...draft, players, participants });

    return this.finish(draft, candidate, targetPlayerId, "participant.player.updated");
  }

  async setSpeedrunCom(
    expectedDraftRevision: number,
    racetimeUserId: string,
    speedrunComUserId: string,
  ): Promise<ParticipantMutationOutcome> {
    const draft = this.currentDraft();
    const guard = this.guard(draft, expectedDraftRevision, racetimeUserId);
    if (isGuardFailure(guard)) {
      return this.failAndLog("participant.speedruncom.updated", guard);
    }
    const { playerId } = guard;

    const userId = typeof speedrunComUserId === "string" ? speedrunComUserId.trim() : "";
    if (userId === "") {
      return this.failAndLog("participant.speedruncom.updated", {
        reason: "speedrun_user_not_found",
        message: "A Speedrun.com user id is required.",
      });
    }

    const lookup = await this.lookup.getUser(userId);
    if (!lookup.ok) {
      return this.failAndLog("participant.speedruncom.updated", {
        reason:
          lookup.reason === "not_found" ? "speedrun_user_not_found" : "speedrun_lookup_failed",
        message: lookup.message,
      });
    }
    const user = lookup.user;

    // The draft may have changed while the API was in flight.
    const latest = this.currentDraft();
    if (latest.revision !== draft.revision) {
      return this.failAndLog("participant.speedruncom.updated", {
        reason: "draft_changed",
        message: `Draft revision is ${latest.revision}, expected ${draft.revision}.`,
      });
    }

    const directory = this.playerDirectory.value ?? {};
    const directoryConflict = findDirectorySpeedrunConflict(directory, playerId, user.userId);
    if (directoryConflict) {
      return this.failAndLog("participant.speedruncom.updated", {
        reason: "identity_conflict",
        message: `Speedrun.com user "${user.userId}" belongs to player "${directoryConflict}". Use participant.set-player instead.`,
      });
    }

    const player = latest.players[playerId];
    if (!player) {
      return this.failAndLog("participant.speedruncom.updated", {
        reason: "participant_not_found",
        message: `Participant "${racetimeUserId}" has no draft player.`,
      });
    }

    const twitchLogin = user.twitchLogin !== null ? user.twitchLogin.trim() : "";
    let twitch = player.twitch;
    if (twitch.state === "unresolved") {
      if (twitchLogin !== "") {
        twitch = {
          state: "linked",
          value: { userId: null, login: twitchLogin },
          source: "speedruncom",
        };
      }
    } else if (twitch.state === "linked" && twitch.source === "speedruncom") {
      twitch =
        twitchLogin !== ""
          ? { state: "linked", value: { userId: null, login: twitchLogin }, source: "speedruncom" }
          : { state: "unresolved" };
    }

    const nextPlayer: DraftPlayer = {
      ...player,
      speedrunCom: {
        state: "linked",
        value: { userId: user.userId, name: user.name, twitchLogin: user.twitchLogin },
        source: "manual",
      },
      twitch,
    };
    const candidate: DraftConfig = {
      ...latest,
      players: { ...latest.players, [playerId]: nextPlayer },
    };

    return this.finish(latest, candidate, playerId, "participant.speedruncom.updated");
  }

  async setSpeedrunComNone(
    expectedDraftRevision: number,
    racetimeUserId: string,
  ): Promise<ParticipantMutationOutcome> {
    const draft = this.currentDraft();
    const guard = this.guard(draft, expectedDraftRevision, racetimeUserId);
    if (isGuardFailure(guard)) {
      return this.failAndLog("participant.speedruncom.none", guard);
    }
    const { playerId } = guard;
    const player = draft.players[playerId];
    if (!player) {
      return this.failAndLog("participant.speedruncom.none", {
        reason: "participant_not_found",
        message: `Participant "${racetimeUserId}" has no draft player.`,
      });
    }

    const twitch =
      player.twitch.state === "linked" && player.twitch.source === "speedruncom"
        ? ({ state: "unresolved" } as const)
        : player.twitch;
    const nextPlayer: DraftPlayer = {
      ...player,
      speedrunCom: { state: "none", source: "manual" },
      twitch,
    };
    const candidate: DraftConfig = {
      ...draft,
      players: { ...draft.players, [playerId]: nextPlayer },
    };

    return this.finish(draft, candidate, playerId, "participant.speedruncom.none");
  }

  async setTwitch(
    expectedDraftRevision: number,
    racetimeUserId: string,
    login: string,
  ): Promise<ParticipantMutationOutcome> {
    const draft = this.currentDraft();
    const guard = this.guard(draft, expectedDraftRevision, racetimeUserId);
    if (isGuardFailure(guard)) {
      return this.failAndLog("participant.twitch.updated", guard);
    }
    const { playerId } = guard;

    const normalizedLogin = typeof login === "string" ? login.trim() : "";
    if (normalizedLogin === "") {
      return this.failAndLog("participant.twitch.updated", {
        reason: "invalid_twitch_login",
        message: "A Twitch login is required.",
      });
    }

    const directory = this.playerDirectory.value ?? {};
    const directoryConflict = findDirectoryTwitchConflict(directory, playerId, normalizedLogin);
    if (directoryConflict) {
      return this.failAndLog("participant.twitch.updated", {
        reason: "identity_conflict",
        message: `Twitch login "${normalizedLogin}" belongs to player "${directoryConflict}".`,
      });
    }

    const player = draft.players[playerId];
    if (!player) {
      return this.failAndLog("participant.twitch.updated", {
        reason: "participant_not_found",
        message: `Participant "${racetimeUserId}" has no draft player.`,
      });
    }

    const nextPlayer: DraftPlayer = {
      ...player,
      twitch: {
        state: "linked",
        value: { userId: null, login: normalizedLogin },
        source: "manual",
      },
    };
    const candidate: DraftConfig = {
      ...draft,
      players: { ...draft.players, [playerId]: nextPlayer },
    };

    return this.finish(draft, candidate, playerId, "participant.twitch.updated");
  }

  async setTwitchNone(
    expectedDraftRevision: number,
    racetimeUserId: string,
  ): Promise<ParticipantMutationOutcome> {
    const draft = this.currentDraft();
    const guard = this.guard(draft, expectedDraftRevision, racetimeUserId);
    if (isGuardFailure(guard)) {
      return this.failAndLog("participant.twitch.none", guard);
    }
    const { playerId } = guard;
    const player = draft.players[playerId];
    if (!player) {
      return this.failAndLog("participant.twitch.none", {
        reason: "participant_not_found",
        message: `Participant "${racetimeUserId}" has no draft player.`,
      });
    }

    const nextPlayer: DraftPlayer = {
      ...player,
      twitch: { state: "none", source: "manual" },
    };
    const candidate: DraftConfig = {
      ...draft,
      players: { ...draft.players, [playerId]: nextPlayer },
    };

    return this.finish(draft, candidate, playerId, "participant.twitch.none");
  }

  async setDisplayName(
    expectedDraftRevision: number,
    racetimeUserId: string,
    displayName: string | null,
  ): Promise<ParticipantMutationOutcome> {
    const draft = this.currentDraft();
    const guard = this.guard(draft, expectedDraftRevision, racetimeUserId);
    if (isGuardFailure(guard)) {
      return this.failAndLog("participant.display_name.updated", guard);
    }
    const { playerId } = guard;
    const player = draft.players[playerId];
    if (!player) {
      return this.failAndLog("participant.display_name.updated", {
        reason: "participant_not_found",
        message: `Participant "${racetimeUserId}" has no draft player.`,
      });
    }

    const trimmed = typeof displayName === "string" ? displayName.trim() : null;
    const manualDisplayName = trimmed === "" ? null : trimmed;
    const nextPlayer: DraftPlayer = { ...player, manualDisplayName };
    const candidate: DraftConfig = {
      ...draft,
      players: { ...draft.players, [playerId]: nextPlayer },
    };

    return this.finish(draft, candidate, playerId, "participant.display_name.updated");
  }

  private guard(
    draft: DraftConfig,
    expectedDraftRevision: number,
    racetimeUserId: string,
  ): GuardResult {
    if (!draft.race) {
      return { reason: "no_race_loaded", message: "No race is loaded." };
    }
    if (draft.revision !== expectedDraftRevision) {
      return {
        reason: "draft_changed",
        message: `Draft revision is ${draft.revision}, expected ${expectedDraftRevision}.`,
      };
    }
    const participant = draft.participants.find((entry) => entry.racetimeUserId === racetimeUserId);
    if (!participant || !participant.playerId) {
      return {
        reason: "participant_not_found",
        message: `Participant "${racetimeUserId}" was not found.`,
      };
    }
    return { playerId: participant.playerId };
  }

  private raceTimeConflict(
    currentRaceTime: DraftRaceTimeAccountLink,
    draftTarget: DraftPlayer | undefined,
    directoryPlayer: PlayerMapping | undefined,
    targetPlayerId: string,
  ): GuardFailure | null {
    if (currentRaceTime.state !== "linked") {
      return null;
    }
    const currentUserId = currentRaceTime.value.userId;
    if (
      draftTarget?.racetime.state === "linked" &&
      draftTarget.racetime.value.userId !== currentUserId
    ) {
      return {
        reason: "racetime_conflict",
        message: `Draft player "${targetPlayerId}" is linked to a different RaceTime user.`,
      };
    }
    if (
      directoryPlayer?.racetime.state === "linked" &&
      directoryPlayer.racetime.value.userId !== currentUserId
    ) {
      return {
        reason: "racetime_conflict",
        message: `Player "${targetPlayerId}" is linked to a different RaceTime user.`,
      };
    }
    return null;
  }

  private linkedRaceTimeOrUnresolved(
    currentRaceTime: DraftRaceTimeAccountLink,
  ): DraftRaceTimeAccountLink {
    if (currentRaceTime.state === "linked") {
      return { ...currentRaceTime, source: "manual" };
    }
    return { state: "unresolved" };
  }

  private finish(
    original: DraftConfig,
    candidate: DraftConfig,
    playerId: PlayerId,
    event: string,
  ): ParticipantMutationOutcome {
    const integrityIssues = validateDraftIntegrity(candidate);
    if (integrityIssues.length > 0) {
      return this.failAndLog(event, {
        reason: "operation_failed",
        message: integrityIssues.map((issue) => issue.message).join("; "),
      });
    }
    const identityIssues = validateDraftIdentityUniqueness(candidate);
    if (identityIssues.length > 0) {
      return this.failAndLog(event, {
        reason: "identity_conflict",
        message: identityIssues.join("; "),
      });
    }

    const changed = !jsonEquals({ ...candidate, revision: original.revision }, original);
    if (!changed) {
      return this.noChange(original);
    }

    const next: DraftConfig = { ...candidate, revision: original.revision + 1 };
    this.draftConfig.value = next;

    const srcSetChanged = !speedrunUserIdSetsEqual(
      participantSpeedrunUserIds(original),
      participantSpeedrunUserIds(next),
    );
    if (srcSetChanged) {
      this.draftSpeedrunSnapshot.value = {
        draftRevision: next.revision,
        state: "empty",
        snapshot: null,
        message: null,
      };
    } else {
      this.draftSpeedrunSnapshot.value = retagDraftSpeedrunSnapshot(
        this.draftSpeedrunSnapshot.value ?? createDefaultDraftSpeedrunSnapshot(),
        next.revision,
      );
    }

    this.recomputeBroadcastState(next);
    this.logEvent(event, { playerId, draftRevision: next.revision });

    return {
      ok: true,
      changed: true,
      draftRevision: next.revision,
      unresolvedPlayerCount: countUnresolvedPlayers(next),
    };
  }

  private noChange(draft: DraftConfig): ParticipantMutationOutcome {
    return {
      ok: true,
      changed: false,
      draftRevision: draft.revision,
      unresolvedPlayerCount: countUnresolvedPlayers(draft),
    };
  }

  private failAndLog(event: string, failure: GuardFailure): ParticipantMutationOutcome {
    this.logEvent("participant.update.failed", { event, reason: failure.reason }, "warn");
    return fail(failure.reason, failure.message);
  }

  private currentDraft(): DraftConfig {
    return this.draftConfig.value ?? createDefaultDraftConfig();
  }

  private recomputeBroadcastState(draft: DraftConfig): void {
    const current = this.integrationStatus.value ?? createDefaultIntegrationStatus();
    const snapshot = this.draftSpeedrunSnapshot.value ?? createDefaultDraftSpeedrunSnapshot();
    const state = computeDraftBroadcastState({
      current: current.broadcast.state,
      draft,
      snapshot,
    });
    this.integrationStatus.value = {
      ...current,
      broadcast: { ...current.broadcast, state, draftRevision: draft.revision, message: null },
    };
  }

  private logEvent(
    event: string,
    fields: Record<string, unknown>,
    level: "info" | "warn" | "error" = "info",
  ): void {
    const parts: string[] = [];
    for (const [key, value] of Object.entries(fields)) {
      if (value === undefined) {
        continue;
      }
      parts.push(`${key}=${String(value)}`);
    }
    const message = parts.length > 0 ? `[${event}] ${parts.join(" ")}` : `[${event}]`;

    if (level === "error") {
      this.log.error(message);
    } else if (level === "warn") {
      this.log.warn(message);
    } else {
      this.log.info(message);
    }
  }
}
