import { declareReplicants } from "../replicants";
import type { NodeCG } from "../types/nodecg";

/**
 * NodeCG extension entry point. This foundation PR only declares the Replicants
 * and their schemas; external service integrations and the apply pipeline are
 * intentionally out of scope.
 */
export = function extension(nodecg: NodeCG): void {
  declareReplicants(nodecg);
};
