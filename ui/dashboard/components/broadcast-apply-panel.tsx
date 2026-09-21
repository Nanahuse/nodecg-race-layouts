import { useState } from "react";
import type {
  ActiveConfig,
  DraftConfig,
  DraftSpeedrunSnapshot,
  IntegrationStatus,
  PlayerDirectory,
  PostApplyPersistenceState,
  RaceSession,
} from "../../../src/domain";
import { resolveDisplayName } from "../../../src/domain";
import { createBroadcastApi } from "../api/broadcast-api";
import { createPersistenceApi } from "../api/persistence-api";

export function BroadcastApplyPanel({
  draft,
  active,
  snapshot,
  integration,
  directory,
  session,
  persistence,
}: {
  draft: DraftConfig;
  active: ActiveConfig | null;
  snapshot: DraftSpeedrunSnapshot;
  integration: IntegrationStatus;
  directory: PlayerDirectory;
  session: RaceSession;
  persistence: PostApplyPersistenceState;
}) {
  const [applyPending, setApplyPending] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [issues, setIssues] = useState<{ code: string; message: string }[]>([]);
  const [retryPending, setRetryPending] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
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
  const retry = async () => {
    setRetryPending(true);
    setRetryError(null);
    try {
      const result = await createPersistenceApi().retry();
      if (!result.ok) setRetryError(`${result.reason}: ${result.message}`);
    } catch (cause) {
      setRetryError(cause instanceof Error ? cause.message : "NodeCG communication error");
    } finally {
      setRetryPending(false);
    }
  };
  const entrantName = (id: string | null) =>
    id ? (session.race?.entrants.find((item) => item.userId === id)?.name ?? id) : "Unassigned";
  const playerName = (id: string) => {
    const player = draft.players[id] ?? directory[id];
    return player ? (resolveDisplayName(player) ?? id) : id;
  };
  const canApply = integration.broadcast.state === "ready" && !applyPending;
  return (
    <section className="subpanel">
      <h3>Broadcast Apply</h3>
      <dl>
        <dt>Race</dt>
        <dd>{draft.race?.raceId ?? "—"}</dd>
        <dt>Category</dt>
        <dd>{draft.race?.categoryName ?? "—"}</dd>
        <dt>Draft revision</dt>
        <dd>{draft.revision}</dd>
        <dt>Snapshot</dt>
        <dd>
          {snapshot.state}
          {snapshot.snapshot ? ` · ${snapshot.snapshot.fetchedAt}` : ""}
        </dd>
        <dt>P1–P4</dt>
        <dd>
          {([1, 2, 3, 4] as const)
            .map((slot) => entrantName(draft.raceScreenSlots[slot]))
            .join(" · ")}
        </dd>
        <dt>Commentators</dt>
        <dd>{draft.commentatorPlayerIds.map(playerName).join(" · ") || "None"}</dd>
        <dt>Active revision</dt>
        <dd>{active?.revision ?? "—"}</dd>
      </dl>
      <p>
        Broadcast: <strong>{integration.broadcast.state}</strong>
        {integration.broadcast.message ? ` · ${integration.broadcast.message}` : ""}
      </p>
      <button disabled={!canApply} onClick={() => void apply()}>
        {applyPending ? "Applying…" : "Apply Draft to Broadcast"}
      </button>
      {applyError && <p className="callout error">{applyError}</p>}
      {issues.map((issue) => (
        <p className="callout error" key={`${issue.code}-${issue.message}`}>
          {issue.code}: {issue.message}
        </p>
      ))}
      <h3>Persistence</h3>
      <p>
        State: <strong>{persistence.state}</strong> · Queue: {persistence.queue.length} · Last
        saved: {persistence.lastSavedActiveRevision ?? "—"}
      </p>
      {persistence.queue.map((item) => (
        <div className="persistence-item" key={item.activeRevision}>
          Active r{item.activeRevision} · Attempts {item.attempts} · {item.lastError ?? "No error"}
        </div>
      ))}
      {persistence.state === "error" && persistence.queue.length > 0 && (
        <button disabled={retryPending} onClick={() => void retry()}>
          {retryPending ? "Retrying…" : "Retry Persistence"}
        </button>
      )}
      {(retryError || persistence.message) && (
        <p className="callout error">{retryError ?? persistence.message}</p>
      )}
    </section>
  );
}
