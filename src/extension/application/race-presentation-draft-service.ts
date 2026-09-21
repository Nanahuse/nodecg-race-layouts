import type {
  DraftConfig,
  DraftPlayer,
  DraftRaceScreenSlots,
  DraftSpeedrunSnapshot,
  IntegrationStatus,
  PlayerDirectory,
  PlayerId,
} from "../../domain";
import {
  MAX_COMMENTATORS,
  RACE_SCREEN_SLOT_KEYS,
  retagDraftSpeedrunSnapshot,
  type RaceScreenSlotKey,
} from "../../domain";
import {
  createDefaultDraftConfig,
  createDefaultDraftSpeedrunSnapshot,
  createDefaultIntegrationStatus,
} from "../../replicants/defaults";
import type { NodeCGLogger, Replicant } from "../../types/nodecg";
import { jsonEquals } from "../integrations/racetime/equality";
import { computeDraftBroadcastState } from "./broadcast-status";
import { pruneUnreferencedDraftPlayers } from "./draft-player-references";
import { persistentPlayerToDraftPlayer } from "./player-resolution-service";
import { validateDraftIntegrity } from "./race-draft-service";

export type RacePresentationFailureReason =
  | "draft_changed"
  | "no_race_loaded"
  | "invalid_request"
  | "invalid_slots"
  | "slot_unknown_participant"
  | "duplicate_slot"
  | "player_not_found"
  | "too_many_commentators"
  | "duplicate_commentator"
  | "operation_failed";

export type RacePresentationOutcome =
  | { ok: true; changed: boolean; draftRevision: number }
  | { ok: false; reason: RacePresentationFailureReason; message: string };

export type RacePresentationDraftServiceOptions = {
  draftConfig: Replicant<DraftConfig>;
  draftSpeedrunSnapshot: Replicant<DraftSpeedrunSnapshot>;
  playerDirectory: Replicant<PlayerDirectory>;
  integrationStatus: Replicant<IntegrationStatus>;
  log: NodeCGLogger;
};

type ParsedSlots = { ok: true; slots: DraftRaceScreenSlots } | { ok: false; message: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseSlots(value: unknown): ParsedSlots {
  if (!isRecord(value)) {
    return { ok: false, message: "slots must be an object." };
  }
  const parsed = {} as Record<RaceScreenSlotKey, string | null>;
  for (const key of RACE_SCREEN_SLOT_KEYS) {
    if (!(key in value)) {
      return { ok: false, message: `slots.${key} is required.` };
    }
    const raw = value[key];
    if (raw === null) {
      parsed[key] = null;
      continue;
    }
    if (typeof raw !== "string") {
      return { ok: false, message: `slots.${key} must be a string or null.` };
    }
    const trimmed = raw.trim();
    parsed[key] = trimmed === "" ? null : trimmed;
  }
  return {
    ok: true,
    slots: { 1: parsed["1"], 2: parsed["2"], 3: parsed["3"], 4: parsed["4"] },
  };
}

function fail(reason: RacePresentationFailureReason, message: string): RacePresentationOutcome {
  return { ok: false, reason, message };
}

/**
 * Draft editing for race screen slots and commentators. Neither affects the
 * leaderboard conditions, so snapshots are retagged (never reset).
 */
export class RacePresentationDraftService {
  private readonly draftConfig: Replicant<DraftConfig>;
  private readonly draftSpeedrunSnapshot: Replicant<DraftSpeedrunSnapshot>;
  private readonly playerDirectory: Replicant<PlayerDirectory>;
  private readonly integrationStatus: Replicant<IntegrationStatus>;
  private readonly log: NodeCGLogger;

  constructor(options: RacePresentationDraftServiceOptions) {
    this.draftConfig = options.draftConfig;
    this.draftSpeedrunSnapshot = options.draftSpeedrunSnapshot;
    this.playerDirectory = options.playerDirectory;
    this.integrationStatus = options.integrationStatus;
    this.log = options.log;
  }

  async setSlots(
    expectedDraftRevision: number,
    slotsValue: unknown,
  ): Promise<RacePresentationOutcome> {
    const draft = this.currentDraft();
    const guard = this.guard(draft, expectedDraftRevision);
    if (guard) {
      return this.failAndLog("race_screen.slots.updated", guard);
    }

    const parsed = parseSlots(slotsValue);
    if (!parsed.ok) {
      return this.failAndLog("race_screen.slots.updated", {
        reason: "invalid_slots",
        message: parsed.message,
      });
    }

    const participantRacetimeIds = new Set(
      draft.participants.map((participant) => participant.racetimeUserId),
    );
    const slotOwners = new Map<string, RaceScreenSlotKey>();
    for (const key of RACE_SCREEN_SLOT_KEYS) {
      const value = parsed.slots[key];
      if (value === null) {
        continue;
      }
      if (!participantRacetimeIds.has(value)) {
        return this.failAndLog("race_screen.slots.updated", {
          reason: "slot_unknown_participant",
          message: `Race screen slot ${key} references unknown participant "${value}".`,
        });
      }
      const existing = slotOwners.get(value);
      if (existing !== undefined) {
        return this.failAndLog("race_screen.slots.updated", {
          reason: "duplicate_slot",
          message: `RaceTime user "${value}" is used in slots ${existing} and ${key}.`,
        });
      }
      slotOwners.set(value, key);
    }

    const candidate: DraftConfig = { ...draft, raceScreenSlots: parsed.slots };
    return this.finish(draft, candidate, "race_screen.slots.updated");
  }

  async setCommentators(
    expectedDraftRevision: number,
    playerIdsValue: unknown,
  ): Promise<RacePresentationOutcome> {
    const draft = this.currentDraft();
    const guard = this.guard(draft, expectedDraftRevision);
    if (guard) {
      return this.failAndLog("commentators.updated", guard);
    }

    if (
      !Array.isArray(playerIdsValue) ||
      playerIdsValue.some((value) => typeof value !== "string")
    ) {
      return this.failAndLog("commentators.updated", {
        reason: "invalid_request",
        message: "playerIds must be an array of strings.",
      });
    }
    const playerIds = playerIdsValue as string[];

    if (playerIds.length > MAX_COMMENTATORS) {
      return this.failAndLog("commentators.updated", {
        reason: "too_many_commentators",
        message: `At most ${MAX_COMMENTATORS} commentators are allowed.`,
      });
    }

    const seen = new Set<PlayerId>();
    for (const playerId of playerIds) {
      if (seen.has(playerId)) {
        return this.failAndLog("commentators.updated", {
          reason: "duplicate_commentator",
          message: `Commentator "${playerId}" is listed more than once.`,
        });
      }
      seen.add(playerId);
    }

    const directory = this.playerDirectory.value ?? {};
    const players: Record<PlayerId, DraftPlayer> = { ...draft.players };
    for (const playerId of playerIds) {
      if (players[playerId]) {
        continue;
      }
      const directoryPlayer = directory[playerId];
      if (!directoryPlayer) {
        return this.failAndLog("commentators.updated", {
          reason: "player_not_found",
          message: `Player "${playerId}" was not found.`,
        });
      }
      players[playerId] = persistentPlayerToDraftPlayer(directoryPlayer);
    }

    const candidate = pruneUnreferencedDraftPlayers({
      ...draft,
      players,
      commentatorPlayerIds: [...playerIds],
    });
    return this.finish(draft, candidate, "commentators.updated");
  }

  private guard(
    draft: DraftConfig,
    expectedDraftRevision: number,
  ): { reason: RacePresentationFailureReason; message: string } | null {
    if (!draft.race) {
      return { reason: "no_race_loaded", message: "No race is loaded." };
    }
    if (draft.revision !== expectedDraftRevision) {
      return {
        reason: "draft_changed",
        message: `Draft revision is ${draft.revision}, expected ${expectedDraftRevision}.`,
      };
    }
    return null;
  }

  private finish(
    original: DraftConfig,
    candidate: DraftConfig,
    event: string,
  ): RacePresentationOutcome {
    const integrityIssues = validateDraftIntegrity(candidate);
    if (integrityIssues.length > 0) {
      return this.failAndLog(event, {
        reason: "operation_failed",
        message: integrityIssues.map((issue) => issue.message).join("; "),
      });
    }

    const changed = !jsonEquals({ ...candidate, revision: original.revision }, original);
    if (!changed) {
      return { ok: true, changed: false, draftRevision: original.revision };
    }

    const next: DraftConfig = { ...candidate, revision: original.revision + 1 };
    this.draftConfig.value = next;
    this.draftSpeedrunSnapshot.value = retagDraftSpeedrunSnapshot(
      this.draftSpeedrunSnapshot.value ?? createDefaultDraftSpeedrunSnapshot(),
      next.revision,
    );
    this.recomputeBroadcastState(next);
    this.logEvent(event, {
      draftRevision: next.revision,
      commentatorCount: next.commentatorPlayerIds.length,
    });

    return { ok: true, changed: true, draftRevision: next.revision };
  }

  private failAndLog(
    event: string,
    failure: { reason: RacePresentationFailureReason; message: string },
  ): RacePresentationOutcome {
    this.logEvent("race_presentation.update.failed", { event, reason: failure.reason }, "warn");
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
