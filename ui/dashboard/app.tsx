import { useState } from "react";
import type { ActiveConfig, DraftConfig, IntegrationStatus, PostApplyPersistenceState, RaceSession } from "../../src/domain";
import { raceApi } from "./api/race-api";
import { useReplicant } from "./hooks/use-replicant";
import { statusTone } from "./model/status";

function Badge({ label, state, message }: { label: string; state: string; message: string | null }) {
  return <div className={`status ${statusTone(state)}`} title={message ?? undefined}><strong>{label}</strong><span>{state}</span></div>;
}

export function App() {
  const draft = useReplicant<DraftConfig | null>("draft-config");
  const active = useReplicant<ActiveConfig | null>("active-config");
  const session = useReplicant<RaceSession>("draft-race-session");
  const integration = useReplicant<IntegrationStatus>("integration-status");
  const persistence = useReplicant<PostApplyPersistenceState>("post-apply-persistence");
  const [url, setUrl] = useState("");
  const [operation, setOperation] = useState<"idle" | "load" | "reconcile">("idle");
  const [error, setError] = useState<string | null>(null);
  if (![draft, active, session, integration, persistence].every((item) => item.ready)) return <main className="loading">Connecting to NodeCG…</main>;
  const d = draft.value!, a = active.value!, s = session.value!, i = integration.value!, p = persistence.value!;
  const run = async (kind: "load" | "reconcile") => {
    setOperation(kind); setError(null);
    try {
      const response = kind === "load" ? await raceApi.loadRace(url) : await raceApi.reconcileRace(d?.revision ?? 0);
      if (!response.ok) setError(response.message);
      else if (kind === "load" && s.canonicalUrl) setUrl(s.canonicalUrl);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "NodeCG communication error"); }
    finally { setOperation("idle"); }
  };
  return <main><header><h1>Race Control</h1><div className="revisions">Draft r{i.broadcast.draftRevision ?? "—"} · Active r{i.broadcast.activeRevision ?? "—"}</div></header>
    <section className="statusbar"><Badge label="RaceTime" state={i.racetime.state} message={i.racetime.message}/><Badge label="Speedrun.com" state={i.speedrunCom.state} message={i.speedrunCom.message}/><Badge label="Spreadsheet" state={i.spreadsheet.state} message={i.spreadsheet.message}/><Badge label="Broadcast" state={i.broadcast.state} message={i.broadcast.message}/></section>
    <div className="layout"><section className="panel"><span className="eyebrow">DRAFT</span><h2>Draft Race</h2><form onSubmit={(e) => { e.preventDefault(); void run("load"); }}><label htmlFor="race-url">RaceTime.gg Race URL</label><div className="formrow"><input id="race-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://racetime.gg/..."/><button disabled={operation !== "idle" || !url.trim()}>{operation === "load" ? "Loading…" : "Load Race"}</button></div></form>
      {i.broadcast.state === "reconciliation_required" && <div className="callout warning" role="status">RaceTime.gg has changed since this draft was created.<button disabled={operation !== "idle"} onClick={() => void run("reconcile")}>{operation === "reconcile" ? "Reconcile…" : "Reconcile Draft"}</button></div>}
      {error && <div className="callout error" aria-live="polite">{error}</div>}<h3>Current Draft Race</h3>{d?.race ? <dl><dt>Race ID</dt><dd>{d.race.raceId}</dd><dt>Category</dt><dd>{d.race.categoryName}</dd><dt>Goal</dt><dd>{d.race.goal}</dd><dt>Participants</dt><dd>{d.participants.length}</dd><dt>Revision</dt><dd>{d.revision}</dd></dl> : <p>No draft race loaded.</p>}<h3>RaceTime Session</h3><p>Connection: <strong>{s.connection.state}</strong> · Race: {s.race?.status ?? "—"} · Entrants: {s.race?.entrants.length ?? 0} · Revision: {s.revision}</p></section>
      <section className="panel"><span className="eyebrow">ON AIR</span><h2>Active Race</h2>{a ? <dl><dt>Race ID</dt><dd>{a.race.raceId}</dd><dt>Category</dt><dd>{a.race.categoryName}</dd><dt>Goal</dt><dd>{a.race.goal}</dd><dt>Active revision</dt><dd>{a.revision}</dd></dl> : <p>Nothing is currently applied.</p>}<h2>Persistence</h2><p className={`state ${statusTone(p.state)}`}>{p.state}</p><p>{p.queue.length} pending saves · Last saved: {p.lastSavedActiveRevision ?? "—"}</p>{p.message && <div className="callout error">{p.message}</div>}</section></div></main>;
}
