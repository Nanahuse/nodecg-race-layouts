import type {
  DraftConfig,
  DraftSpeedrunSnapshot,
  IntegrationStatus,
  PlayerSnapshot,
} from "../../domain";
import { draftPersonResolutionInput, retagDraftSpeedrunSnapshot } from "../../domain";
import {
  createDefaultDraftConfig,
  createDefaultDraftSpeedrunSnapshot,
  createDefaultIntegrationStatus,
} from "../../replicants/defaults";
import type { NodeCGLogger, Replicant } from "../../types/nodecg";
import { jsonEquals } from "../integrations/racetime/equality";
import { bindPlayerToDraftPerson, playerToSnapshot } from "../integrations/player-manager/mapper";
import type { PlayerManagerGateway, Player } from "../integrations/player-manager/types";
import { computeDraftBroadcastState } from "./broadcast-status";
import {
  countUnresolvedPeople,
  participantSpeedrunUserIds,
  speedrunUserIdSetsEqual,
} from "./race-draft-reconciliation";
import { validateDraftIntegrity } from "./race-draft-service";

export type ParticipantFailureReason =
  | "draft_changed"
  | "no_race_loaded"
  | "participant_not_found"
  | "operation_failed";
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
  private readonly registrations = new Map<string, string>();
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
    const person = draft.persons[participant.personRef]!;
    const registration = await this.options.playerManager.beginRegistration(
      draftPersonResolutionInput(person),
    );
    this.registrations.set(registration.registrationId, person.ref);
    return { ok: true, ...registration };
  }

  async registrationCompleted(result: { registrationId: string; player: Player }): Promise<void> {
    const ref = this.registrations.get(result.registrationId);
    if (!ref) return;
    this.registrations.delete(result.registrationId);
    const draft = this.current();
    const person = draft.persons[ref];
    if (!person) return;
    const candidate = {
      ...draft,
      persons: {
        ...draft.persons,
        [ref]: bindPlayerToDraftPerson(
          { ...person, playerId: result.player.playerId, resolution: "matched" },
          result.player,
        ),
      },
    };
    this.finish(draft, candidate, "participant.registration.completed");
  }

  registrationCancelled(registrationId: string): void {
    this.registrations.delete(registrationId);
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
