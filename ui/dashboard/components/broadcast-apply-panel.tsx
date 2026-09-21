import { useState } from "react";
import type {
  ActiveConfig,
  DraftConfig,
  DraftSpeedrunSnapshot,
  IntegrationStatus,
  PlayerDirectory,
  RaceSession,
} from "../../../src/domain";
import { createBroadcastApi } from "../api/broadcast-api";
import { canApply, buildBroadcastApplySummary } from "../model/broadcast-controls";

export function BroadcastApplyPanel({
  draft,
  active,
  snapshot,
  integration,
  directory,
  session,
}: {
  draft: DraftConfig;
  active: ActiveConfig | null;
  snapshot: DraftSpeedrunSnapshot;
  integration: IntegrationStatus;
  directory: PlayerDirectory;
  session: RaceSession;
}) {
  const [applyPending, setApplyPending] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [issues, setIssues] = useState<{ code: string; message: string }[]>([]);
  const apply = async () => {
    setApplyPending(true);
    setApplyError(null);
    setIssues([]);
    try {
      const result = await createBroadcastApi(() => draft.revision).apply();
      if (!result.ok) {
        setApplyError(`${result.reason}: ${result.message}`);
        setIssues(result.issues ?? []);
      }
    } catch (cause) {
      setApplyError(cause instanceof Error ? cause.message : "NodeCG communication error");
    } finally {
      setApplyPending(false);
    }
  };
  const summary = buildBroadcastApplySummary(
    draft,
    snapshot,
    session,
    active?.revision ?? null,
    directory,
  );
  const applyAllowed = canApply(integration.broadcast.state, applyPending);
  return (
    <section className="subpanel">
      <h3>Broadcast Apply</h3>
      <dl>
        <dt>Race</dt>
        <dd>{summary.raceId}</dd>
        <dt>RaceTime Category</dt>
        <dd>{summary.racetimeCategory}</dd>
        <dt>Speedrun.com Game</dt>
        <dd>{summary.speedrunGame}</dd>
        <dt>Speedrun.com Category</dt>
        <dd>{summary.speedrunCategory}</dd>
        <dt>Draft revision</dt>
        <dd>{summary.draftRevision}</dd>
        <dt>Snapshot</dt>
        <dd>
          {summary.snapshotState}
          {summary.snapshotFetchedAt ? ` · ${summary.snapshotFetchedAt}` : ""}
        </dd>
        <dt>P1–P4</dt>
        <dd>{summary.slots.join(" · ")}</dd>
        <dt>Commentators</dt>
        <dd>{summary.commentators.join(" · ") || "None"}</dd>
        <dt>Active revision</dt>
        <dd>{summary.activeRevision ?? "—"}</dd>
      </dl>
      <p>
        Broadcast: <strong>{integration.broadcast.state}</strong>
        {integration.broadcast.message ? ` · ${integration.broadcast.message}` : ""}
      </p>
      <button disabled={!applyAllowed} onClick={() => void apply()}>
        {applyPending ? "Applying…" : "Apply Draft to Broadcast"}
      </button>
      {applyError && <p className="callout error">{applyError}</p>}
      {issues.map((issue) => (
        <p className="callout error" key={`${issue.code}-${issue.message}`}>
          {issue.code}: {issue.message}
        </p>
      ))}
    </section>
  );
}
