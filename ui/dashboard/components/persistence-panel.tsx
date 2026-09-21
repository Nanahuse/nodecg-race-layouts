import { useState } from "react";
import type { PostApplyPersistenceState } from "../../../src/domain";
import { createPersistenceApi } from "../api/persistence-api";
import { canRetryPersistence } from "../model/broadcast-controls";
export function PersistencePanel({ persistence }: { persistence: PostApplyPersistenceState }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const retry = async () => {
    setPending(true);
    setError(null);
    try {
      const result = await createPersistenceApi().retry();
      if (!result.ok) setError(`${result.reason}: ${result.message}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "NodeCG communication error");
    } finally {
      setPending(false);
    }
  };
  return (
    <section className="subpanel">
      <h3>Persistence</h3>
      <p>
        State: <strong>{persistence.state}</strong> · Queue: {persistence.queue.length} · Last
        saved: {persistence.lastSavedActiveRevision ?? "—"}
      </p>
      {persistence.queue.map((item) => (
        <div className="persistence-item" key={item.activeRevision}>
          Active r{item.activeRevision} · Attempts {item.attempts}
          {item.lastError ? ` · ${item.lastError}` : ""}
        </div>
      ))}
      {canRetryPersistence(persistence.state, persistence.queue.length, pending) && (
        <button disabled={pending} onClick={() => void retry()}>
          {pending ? "Retrying…" : "Retry Persistence"}
        </button>
      )}
      {(error || persistence.message) && (
        <p className="callout error">{error ?? persistence.message}</p>
      )}
    </section>
  );
}
