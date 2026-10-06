import { eventMessageName } from "@nanahuse/player-manager-protocol";
import type { NodeCG } from "../../types/nodecg";
import type { Player } from "../integrations/player-manager/types";
import type { ParticipantDraftService } from "../application/participant-draft-service";
import {
  PARTICIPANT_REGISTRATION_START_MESSAGE,
  PLAYER_MANAGER_LIST_MESSAGE,
} from "../../protocol/participant";
export * from "../../protocol/participant";
export type ParticipantMutationRequest = { expectedDraftRevision: number; racetimeUserId: string };
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function stringValue(value: unknown, key: string): string {
  return isRecord(value) && typeof value[key] === "string" ? value[key] : "";
}
function revision(value: unknown): number {
  return isRecord(value) && typeof value.expectedDraftRevision === "number"
    ? value.expectedDraftRevision
    : Number.NaN;
}
export function registerParticipantMessages(
  nodecg: NodeCG,
  service: ParticipantDraftService,
): void {
  nodecg.listenFor(PARTICIPANT_REGISTRATION_START_MESSAGE, async (data, ack) => {
    try {
      ack(
        null,
        await service.beginRegistration(revision(data), stringValue(data, "racetimeUserId")),
      );
    } catch (error) {
      ack(null, {
        ok: false,
        reason: "operation_failed",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });
  nodecg.listenFor(PLAYER_MANAGER_LIST_MESSAGE, async (_data, ack) => {
    try {
      ack(null, { ok: true, players: await service.listPlayers() });
    } catch (error) {
      ack(null, { ok: false, message: error instanceof Error ? error.message : String(error) });
    }
  });
  nodecg.listenFor(eventMessageName("registrationCompleted"), async (data) => {
    if (!isRecord(data) || typeof data.registrationId !== "string" || !isRecord(data.player))
      return;
    await service.registrationCompleted(data as { registrationId: string; player: Player });
  });
  nodecg.listenFor(eventMessageName("registrationCancelled"), (data) => {
    service.registrationCancelled(stringValue(data, "registrationId"));
  });
}
