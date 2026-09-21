import type { NodeCG } from "../types/nodecg";
import { REPLICANT_DEFINITIONS } from "./defaults";

export { REPLICANT_DEFINITIONS, createDefaultDraftConfig } from "./defaults";
export { REPLICANT_NAMES, type ReplicantName } from "./names";
export { REPLICANT_SCHEMA_TYPES } from "./schema-types";
export type { ReplicantValueMap, ReplicantValueOf } from "./value-types";

/**
 * Declare every Replicant this bundle owns. NodeCG resolves each schema from
 * the default location `schemas/<name>.json`.
 */
export function declareReplicants(nodecg: NodeCG): void {
  for (const definition of REPLICANT_DEFINITIONS) {
    nodecg.Replicant(definition.name, {
      defaultValue: definition.defaultValue,
      persistent: definition.persistent,
    });
  }
}
