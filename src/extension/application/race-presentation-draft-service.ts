import type {
  DraftConfig,
  DraftRaceScreenSlots,
  DraftSpeedrunSnapshot,
  IntegrationStatus,
  PlayerSnapshot,
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
import { playerToSnapshot } from "../integrations/player-manager/mapper";
import type { PlayerManagerGateway } from "../integrations/player-manager/types";
import { computeDraftBroadcastState } from "./broadcast-status";
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
  integrationStatus: Replicant<IntegrationStatus>;
  playerManager: PlayerManagerGateway;
  log: NodeCGLogger;
};
type Guard = { reason: RacePresentationFailureReason; message: string };
type ParsedSlots = { ok: true; slots: DraftRaceScreenSlots } | { ok: false; message: string };
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function parseSlots(value: unknown): ParsedSlots {
  if (!isRecord(value)) return { ok: false, message: "slots must be an object." };
  const parsed = {} as Record<RaceScreenSlotKey, string | null>;
  for (const key of RACE_SCREEN_SLOT_KEYS) {
    if (!(key in value)) return { ok: false, message: `slots.${key} is required.` };
    const raw = value[key];
    if (raw === null) {
      parsed[key] = null;
      continue;
    }
    if (typeof raw !== "string")
      return { ok: false, message: `slots.${key} must be a string or null.` };
    parsed[key] = raw.trim() || null;
  }
  return { ok: true, slots: { 1: parsed["1"], 2: parsed["2"], 3: parsed["3"], 4: parsed["4"] } };
}

export class RacePresentationDraftService {
  constructor(private readonly options: RacePresentationDraftServiceOptions) {}
  async setSlots(revision: number, value: unknown): Promise<RacePresentationOutcome> {
    const draft = this.current();
    const guard = this.guard(draft, revision);
    if (guard) return this.fail(guard.reason, guard.message);
    const parsed = parseSlots(value);
    if (!parsed.ok) return this.fail("invalid_slots", parsed.message);
    const ids = new Set(draft.participants.map((participant) => participant.racetimeUserId));
    const owners = new Set<string>();
    for (const key of RACE_SCREEN_SLOT_KEYS) {
      const id = parsed.slots[key];
      if (id === null) continue;
      if (!ids.has(id))
        return this.fail(
          "slot_unknown_participant",
          `Race screen slot ${key} references unknown participant "${id}".`,
        );
      if (owners.has(id))
        return this.fail("duplicate_slot", `RaceTime user "${id}" is assigned to multiple slots.`);
      owners.add(id);
    }
    return this.finish(
      draft,
      { ...draft, raceScreenSlots: parsed.slots },
      "race_screen.slots.updated",
    );
  }
  async setCommentators(revision: number, value: unknown): Promise<RacePresentationOutcome> {
    const draft = this.current();
    const guard = this.guard(draft, revision);
    if (guard) return this.fail(guard.reason, guard.message);
    if (!Array.isArray(value) || value.some((id) => typeof id !== "string"))
      return this.fail("invalid_request", "playerIds must be an array of strings.");
    const ids = value as string[];
    if (ids.length > MAX_COMMENTATORS)
      return this.fail(
        "too_many_commentators",
        `At most ${MAX_COMMENTATORS} commentators are allowed.`,
      );
    if (new Set(ids).size !== ids.length)
      return this.fail("duplicate_commentator", "Commentators must be unique.");
    const listed = await this.options.playerManager.list();
    const byId = new Map(listed.map((player) => [player.playerId, player]));
    const commentators: Record<string, PlayerSnapshot> = {};
    for (const id of ids) {
      const player = byId.get(id) ?? (await this.options.playerManager.get(id));
      if (!player) return this.fail("player_not_found", `Player "${id}" was not found.`);
      commentators[id] = playerToSnapshot(player);
    }
    return this.finish(
      draft,
      { ...draft, commentatorPlayerIds: [...ids], commentators },
      "commentators.updated",
    );
  }
  private guard(draft: DraftConfig, revision: number): Guard | null {
    if (!draft.race) return { reason: "no_race_loaded", message: "No race is loaded." };
    if (draft.revision !== revision)
      return {
        reason: "draft_changed",
        message: `Draft revision is ${draft.revision}, expected ${revision}.`,
      };
    return null;
  }
  private finish(
    original: DraftConfig,
    candidate: DraftConfig,
    event: string,
  ): RacePresentationOutcome {
    const issues = validateDraftIntegrity(candidate);
    if (issues.length)
      return this.fail("operation_failed", issues.map((issue) => issue.message).join("; "));
    if (jsonEquals({ ...candidate, revision: original.revision }, original))
      return { ok: true, changed: false, draftRevision: original.revision };
    const next = { ...candidate, revision: original.revision + 1 };
    this.options.draftConfig.value = next;
    this.options.draftSpeedrunSnapshot.value = retagDraftSpeedrunSnapshot(
      this.options.draftSpeedrunSnapshot.value ?? createDefaultDraftSpeedrunSnapshot(),
      next.revision,
    );
    const status = this.options.integrationStatus.value ?? createDefaultIntegrationStatus();
    this.options.integrationStatus.value = {
      ...status,
      broadcast: {
        ...status.broadcast,
        state: computeDraftBroadcastState({
          current: status.broadcast.state,
          draft: next,
          snapshot: this.options.draftSpeedrunSnapshot.value,
        }),
        draftRevision: next.revision,
        message: null,
      },
    };
    this.options.log.info(`[${event}] draftRevision=${next.revision}`);
    return { ok: true, changed: true, draftRevision: next.revision };
  }
  private current() {
    return this.options.draftConfig.value ?? createDefaultDraftConfig();
  }
  private fail(reason: RacePresentationFailureReason, message: string): RacePresentationOutcome {
    return { ok: false, reason, message };
  }
}
