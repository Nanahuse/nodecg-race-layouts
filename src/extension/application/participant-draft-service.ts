import type {
  DraftConfig,
  DraftSpeedrunSnapshot,
  IntegrationStatus,
  PlayerSnapshot,
} from "../../domain";
import { retagDraftSpeedrunSnapshot } from "../../domain";
import {
  createDefaultDraftConfig,
  createDefaultDraftSpeedrunSnapshot,
  createDefaultIntegrationStatus,
} from "../../replicants/defaults";
import type { NodeCGLogger, Replicant } from "../../types/nodecg";
import { jsonEquals } from "../integrations/racetime/equality";
import {
  bindDraftPersonFromDirectory,
  createRaceTimePlayerIndex,
  playerToSnapshot,
} from "../integrations/player-manager/mapper";
import type { PlayerManagerGateway } from "../integrations/player-manager/types";
import { computeDraftBroadcastState } from "./broadcast-status";
import {
  countUnresolvedPeople,
  participantSpeedrunUserIds,
  speedrunUserIdSetsEqual,
} from "./race-draft-reconciliation";
import { validateDraftIntegrity } from "./race-draft-service";

export type ParticipantFailureReason =
  "draft_changed" | "no_race_loaded" | "participant_not_found" | "operation_failed";
export type ParticipantMutationOutcome =
  | { ok: true; changed: boolean; draftRevision: number; unresolvedPlayerCount: number }
  | { ok: false; reason: ParticipantFailureReason; message: string };
export type ParticipantDraftServiceOptions = {
  draftConfig: Replicant<DraftConfig>;
  draftSpeedrunSnapshot: Replicant<DraftSpeedrunSnapshot>;
  integrationStatus: Replicant<IntegrationStatus>;
  playerManager: PlayerManagerGateway;
  log: NodeCGLogger;
};

export class ParticipantDraftService {
  private refreshPromise: Promise<ParticipantMutationOutcome> | null = null;
  private refreshAgain = false;

  constructor(private readonly options: ParticipantDraftServiceOptions) {}

  async listPlayers(): Promise<PlayerSnapshot[]> {
    return (await this.options.playerManager.list()).map(playerToSnapshot);
  }

  async beginRegistration(
    expectedDraftRevision: number,
    racetimeUserId: string,
  ): Promise<{ ok: true; registrationId: string; url: string } | ParticipantMutationOutcome> {
    const draft = this.current();
    const guard = this.guard(draft, expectedDraftRevision, racetimeUserId);
    if (guard) return this.fail(guard.reason, guard.message);
    const participant = draft.participants.find(
      (entry) => entry.racetimeUserId === racetimeUserId,
    )!;
    const registration = await this.options.playerManager.beginRegistration(
      { racetime: participant.racetimeUserId },
      [{ service: "racetime", value: participant.racetimeUserId }],
    );
    return { ok: true, ...registration };
  }

  refreshPlayerBindings(): Promise<ParticipantMutationOutcome> {
    if (this.refreshPromise) {
      this.refreshAgain = true;
      return this.refreshPromise;
    }
    this.refreshPromise = this.refreshPlayerBindingsLoop();
    return this.refreshPromise;
  }

  private async refreshPlayerBindingsLoop(): Promise<ParticipantMutationOutcome> {
    while (true) {
      this.refreshAgain = false;
      let outcome: ParticipantMutationOutcome;
      try {
        outcome = await this.refreshPlayerBindingsOnce();
      } catch (error) {
        if (this.refreshAgain) continue;
        this.refreshPromise = null;
        throw error;
      }
      if (this.refreshAgain) continue;
      // Clear the single-flight state in the same synchronous turn as the
      // final pending check, so a request can either join this run or start a
      // new one; it cannot slip into an unobserved gap.
      this.refreshPromise = null;
      return outcome;
    }
  }

  private async refreshPlayerBindingsOnce(): Promise<ParticipantMutationOutcome> {
    const beforeRequest = this.current();
    if (!beforeRequest.race) return this.fail("no_race_loaded", "No race is loaded.");
    const players = await this.options.playerManager.list();
    const playersByRaceTimeId = createRaceTimePlayerIndex(players);
    const playersById = new Map(players.map((player) => [player.playerId, player]));
    const draft = this.current();
    if (!draft.race) return this.fail("no_race_loaded", "No race is loaded.");
    if (draft.revision !== beforeRequest.revision) {
      this.refreshAgain = true;
      return {
        ok: true,
        changed: false,
        draftRevision: draft.revision,
        unresolvedPlayerCount: countUnresolvedPeople(draft),
      };
    }
    const persons = { ...draft.persons };
    for (const participant of draft.participants) {
      const person = draft.persons[participant.personRef];
      if (!person) continue;
      persons[person.ref] = bindDraftPersonFromDirectory(
        person,
        participant.racetimeUserId,
        playersByRaceTimeId,
      );
    }
    const commentatorPlayerIds = draft.commentatorPlayerIds.filter((id) => playersById.has(id));
    const commentators = Object.fromEntries(
      commentatorPlayerIds.map((id) => [id, playerToSnapshot(playersById.get(id)!)]),
    );
    const candidate = {
      ...draft,
      persons,
      commentatorPlayerIds,
      commentators,
    };
    return this.finish(draft, candidate, "participant.directory.refreshed");
  }

  private guard(
    draft: DraftConfig,
    revision: number,
    userId: string,
  ): { reason: ParticipantFailureReason; message: string } | null {
    if (!draft.race) return { reason: "no_race_loaded", message: "No race is loaded." };
    if (draft.revision !== revision)
      return {
        reason: "draft_changed",
        message: `Draft revision is ${draft.revision}, expected ${revision}.`,
      };
    const participant = draft.participants.find((entry) => entry.racetimeUserId === userId);
    if (!participant || !draft.persons[participant.personRef])
      return { reason: "participant_not_found", message: `Participant "${userId}" was not found.` };
    return null;
  }
  private finish(
    original: DraftConfig,
    candidate: DraftConfig,
    event: string,
  ): ParticipantMutationOutcome {
    const issues = validateDraftIntegrity(candidate);
    if (issues.length)
      return this.fail("operation_failed", issues.map((issue) => issue.message).join("; "));
    const changed = !jsonEquals({ ...candidate, revision: original.revision }, original);
    if (!changed)
      return {
        ok: true,
        changed: false,
        draftRevision: original.revision,
        unresolvedPlayerCount: countUnresolvedPeople(original),
      };
    const next = { ...candidate, revision: original.revision + 1 };
    this.options.draftConfig.value = next;
    const before = participantSpeedrunUserIds(original);
    const after = participantSpeedrunUserIds(next);
    const snapshot =
      this.options.draftSpeedrunSnapshot.value ?? createDefaultDraftSpeedrunSnapshot();
    this.options.draftSpeedrunSnapshot.value = speedrunUserIdSetsEqual(before, after)
      ? retagDraftSpeedrunSnapshot(snapshot, next.revision)
      : { draftRevision: next.revision, state: "empty", snapshot: null, message: null };
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
    return {
      ok: true,
      changed: true,
      draftRevision: next.revision,
      unresolvedPlayerCount: countUnresolvedPeople(next),
    };
  }
  private current(): DraftConfig {
    return this.options.draftConfig.value ?? createDefaultDraftConfig();
  }
  private fail(reason: ParticipantFailureReason, message: string): ParticipantMutationOutcome {
    return { ok: false, reason, message };
  }
}
