import type {
  ActiveConfig,
  ActiveSpeedrunSnapshot,
  RaceOverlayData,
  ParticipantListData,
  LeaderboardPageData,
  RaceResultPageData,
  RaceSession,
} from "../../domain";
import type { EventConfig } from "../config";
import type { NodeCG, Replicant } from "../../types/nodecg";
import {
  buildLeaderboardPageData,
  buildParticipantListData,
  buildRaceOverlayData,
} from "./graphics-view-model-builder";
import { buildRaceResultPageData } from "./race-result-view-model-builder";

export class GraphicsProjectionService {
  constructor(
    private readonly deps: {
      activeConfig: Replicant<ActiveConfig | null>;
      activeSnapshot: Replicant<ActiveSpeedrunSnapshot | null>;
      activeSession: Replicant<RaceSession>;
      overlay: Replicant<RaceOverlayData | null>;
      participants: Replicant<ParticipantListData | null>;
      leaderboard: Replicant<LeaderboardPageData | null>;
      result: Replicant<RaceResultPageData | null>;
      event: EventConfig;
      log: NodeCG["log"];
    },
  ) {}
  rebuildStatic(): void {
    const c = this.deps.activeConfig.value,
      s = this.deps.activeSnapshot.value;
    if (!c || !s || c.revision !== s.activeRevision) {
      this.deps.log.debug("[graphics.projection.static.skipped]");
      return;
    }
    const a = buildRaceOverlayData(c, s, this.deps.event),
      b = buildParticipantListData(c, s, this.deps.event),
      d = buildLeaderboardPageData(c, s, this.deps.event);
    if (!a.ok || !b.ok || !d.ok) {
      this.deps.log.warn("[graphics.projection.static.failed]", [
        ...(!a.ok ? a.issues : []),
        ...(!b.ok ? b.issues : []),
        ...(!d.ok ? d.issues : []),
      ]);
      return;
    }
    this.deps.overlay.value = a.value;
    this.deps.participants.value = b.value;
    this.deps.leaderboard.value = d.value;
    this.deps.log.info("[graphics.projection.static.completed]", {
      activeRevision: c.revision,
      participantCount: c.participants.length,
      leaderboardEntryCount: d.value.leaderboard.length,
    });
  }
  rebuildResult(): void {
    const c = this.deps.activeConfig.value;
    if (!c) {
      this.deps.log.debug("[graphics.projection.result.skipped]");
      return;
    }
    const built = buildRaceResultPageData(c, this.deps.activeSession.value, this.deps.event);
    if (!built.ok) {
      this.deps.log.debug("[graphics.projection.result.skipped]", built.issues);
      return;
    }
    this.deps.result.value = built.value;
    this.deps.log.info("[graphics.projection.result.completed]", {
      activeRevision: c.revision,
      resultCount: built.value.results.length,
    });
  }
  rebuildAll(): void {
    this.rebuildStatic();
    this.rebuildResult();
  }
}
