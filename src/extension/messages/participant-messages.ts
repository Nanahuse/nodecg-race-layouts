import { eventMessageName } from "@nanahuse/player-manager-protocol";
import type { NodeCG } from "../../types/nodecg";
import type { ParticipantDraftService } from "../application/participant-draft-service";
import {
  PARTICIPANT_REGISTRATION_START_MESSAGE,
  PLAYER_MANAGER_LIST_MESSAGE,
} from "../../protocol/participant";
export * from "../../protocol/participant";
export type ParticipantMutationRequest = { expectedDraftRevision: number; racetimeUserId: string };
export async function requestPlayerManagerDirectorySync(
  nodecg: NodeCG,
  service: ParticipantDraftService,
): Promise<void> {
  try {
    const outcome = await service.refreshPlayerBindings();
    if (!outcome.ok && outcome.reason !== "no_race_loaded")
      nodecg.log.warn(
        `[participant.directory.refresh_failed] reason=${outcome.reason} message=${outcome.message}`,
      );
  } catch (error) {
    nodecg.log.error(
      `[participant.directory.refresh_failed] ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
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
  const refreshDirectory = () => requestPlayerManagerDirectorySync(nodecg, service);
  nodecg.listenFor(eventMessageName("registrationCompleted"), "player-manager", refreshDirectory);
  nodecg.listenFor(eventMessageName("directoryChanged"), "player-manager", refreshDirectory);
}
