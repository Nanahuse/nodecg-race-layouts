import { useEffect, useState } from "react";
import type {
  ActiveConfig,
  DraftConfig,
  DraftSpeedrunSnapshot,
  IntegrationStatus,
  PostApplyPersistenceState,
  RaceSession,
} from "../../src/domain";
import type { PlayerSnapshot } from "../../src/domain";
import { raceApi } from "./api/race-api";
import { createParticipantApi } from "./api/participant-api";
import { createRacePresentationApi } from "./api/race-presentation-api";
import { useReplicant } from "./hooks/use-replicant";
import { statusTone } from "./model/status";
import { CategoryEditor } from "./components/category-editor";
import { CategoryPresentationEditor } from "./components/category-presentation-editor";
import { SpeedrunSnapshotPanel } from "./components/speedrun-snapshot-panel";
import { BroadcastApplyPanel } from "./components/broadcast-apply-panel";
import { PersistencePanel } from "./components/persistence-panel";
import { SpreadsheetSetupPanel } from "./components/spreadsheet-setup-panel";

function Badge({
  label,
  state,
  message,
}: {
  label: string;
  state: string;
  message: string | null;
}) {
  return (
    <div className={`status ${statusTone(state)}`} title={message ?? undefined}>
      <strong>{label}</strong>
      <span>{state}</span>
    </div>
  );
}

function ParticipantCard({
  draft,
  participant,
  entrantName,
}: {
  draft: DraftConfig;
  participant: DraftConfig["participants"][number];
  entrantName: string;
}) {
  const api = createParticipantApi(() => draft.revision);
  const person = draft.persons[participant.personRef];
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const register = async () => {
    setPending(true);
    setError(null);
    try {
      const result = await api.beginRegistration(participant.racetimeUserId);
      if (result.ok && result.url) window.open(result.url, "_blank", "noopener,noreferrer");
      else setError(result.message ?? "Registration could not be started.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Registration could not be started.");
    } finally {
      setPending(false);
    }
  };
  const status = person?.resolution ?? "conflict";
  const display = person?.player?.displayName ?? entrantName;
  return (
    <article className="participant-card">
      <header>
        <div>
          <h4>{entrantName}</h4>
          <p className="muted">RaceTime ID: {participant.racetimeUserId}</p>
        </div>
        <strong>{display}</strong>
      </header>
      <p>
        Player Manager: <strong>{status}</strong>
        {person?.playerId ? ` · ${person.playerId}` : ""}
      </p>
      <p>Display name: {person?.player?.displayName ?? "—"}</p>
      <p>
        Speedrun.com: {person?.player?.speedrunCom?.name ?? "—"}
        {person?.player?.speedrunCom?.userId ? ` (${person.player.speedrunCom.userId})` : ""}
      </p>
      <p>
        Twitch: {person?.player?.twitch?.login ?? "—"}
        {person?.player?.twitch?.userId ? ` (${person.player.twitch.userId})` : ""}
      </p>
      {status !== "matched" && (
        <button disabled={pending} onClick={() => void register()}>
          {pending ? "Starting…" : "Register / resolve in Player Manager"}
        </button>
      )}
      {error && (
        <p className="callout error" role="alert">
          {error}
        </p>
      )}
    </article>
  );
}

function PresentationEditor({
  draft,
  session,
  players,
}: {
  draft: DraftConfig;
  session: RaceSession;
  players: PlayerSnapshot[];
}) {
  const api = createRacePresentationApi(() => draft.revision);
  const [slots, setSlots] = useState(draft.raceScreenSlots);
  const [commentators, setCommentators] = useState(draft.commentatorPlayerIds);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setSlots(draft.raceScreenSlots);
    setCommentators(draft.commentatorPlayerIds);
  }, [draft.revision]);
  const save = async (kind: "slots" | "commentators") => {
    setPending(true);
    setError(null);
    try {
      const result =
        kind === "slots"
          ? await api.setSlots(slots)
          : await api.setCommentators(commentators.filter(Boolean));
      if (!result.ok) setError(result.message);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Presentation update failed.");
    } finally {
      setPending(false);
    }
  };
  const entrants = session.race?.entrants ?? [];
  return (
    <>
      <h3>Race Screen</h3>
      <div className="presentation-editor">
        {([1, 2, 3, 4] as const).map((slot) => (
          <label key={slot}>
            P{slot}
            <select
              value={slots[slot] ?? ""}
              disabled={pending}
              onChange={(event) => setSlots({ ...slots, [slot]: event.target.value || null })}
            >
              <option value="">Unassigned</option>
              {draft.participants.map((participant) => (
                <option key={participant.racetimeUserId} value={participant.racetimeUserId}>
                  {entrants.find((entrant) => entrant.userId === participant.racetimeUserId)
                    ?.name ?? participant.racetimeUserId}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <button disabled={pending} onClick={() => void save("slots")}>
        Save Slots
      </button>
      <h3>Commentators</h3>
      <div className="presentation-editor">
        {[0, 1, 2].map((index) => (
          <label key={index}>
            {index + 1}
            <select
              value={commentators[index] ?? ""}
              disabled={pending}
              onChange={(event) => {
                const next = [...commentators];
                next[index] = event.target.value;
                setCommentators(next);
              }}
            >
              <option value="">Unassigned</option>
              {players.map((player) => (
                <option key={player.playerId} value={player.playerId}>
                  {player.displayName}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <button disabled={pending} onClick={() => void save("commentators")}>
        Save Commentators
      </button>
      {error && (
        <p className="callout error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}

export function App() {
  const draft = useReplicant<DraftConfig | null>("draft-config");
  const active = useReplicant<ActiveConfig | null>("active-config");
  const session = useReplicant<RaceSession>("draft-race-session");
  const integration = useReplicant<IntegrationStatus>("integration-status");
  const persistence = useReplicant<PostApplyPersistenceState>("post-apply-persistence");
  const snapshot = useReplicant<DraftSpeedrunSnapshot>("draft-speedrun-snapshot");
  const [players, setPlayers] = useState<PlayerSnapshot[]>([]);
  const [url, setUrl] = useState("");
  const [operation, setOperation] = useState<"idle" | "load" | "reconcile">("idle");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void createParticipantApi(() => draft.value?.revision ?? 0)
      .listPlayers()
      .then((result) => {
        if (result.ok) setPlayers(result.players ?? []);
        else setError(result.message ?? "Player Manager is unavailable.");
      })
      .catch((cause: unknown) =>
        setError(cause instanceof Error ? cause.message : "Player Manager is unavailable."),
      );
  }, [draft.ready, draft.value?.revision]);
  if (![draft, active, session, integration, persistence, snapshot].every((item) => item.ready))
    return <main className="loading">Connecting to NodeCG…</main>;
  const d = draft.value!;
  const a = active.value!;
  const s = session.value!;
  const i = integration.value!;
  const p = persistence.value!;
  const snap = snapshot.value!;
  const run = async (kind: "load" | "reconcile") => {
    setOperation(kind);
    setError(null);
    try {
      const response =
        kind === "load" ? await raceApi.loadRace(url) : await raceApi.reconcileRace(d.revision);
      if (!response.ok) setError(response.message);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "NodeCG communication error");
    } finally {
      setOperation("idle");
    }
  };
  return (
    <main>
      <header>
        <h1>Race Control</h1>
        <div className="revisions">
          Draft r{i.broadcast.draftRevision ?? "—"} · Active r{i.broadcast.activeRevision ?? "—"}
        </div>
      </header>
      <section className="statusbar">
        <Badge label="RaceTime" state={i.racetime.state} message={i.racetime.message} />
        <Badge
          label="Player Manager"
          state={i.playerManager.state}
          message={i.playerManager.message}
        />
        <Badge label="Speedrun.com" state={i.speedrunCom.state} message={i.speedrunCom.message} />
        <Badge label="Spreadsheet" state={i.spreadsheet.state} message={i.spreadsheet.message} />
        <Badge label="Broadcast" state={i.broadcast.state} message={i.broadcast.message} />
      </section>
      <SpreadsheetSetupPanel />
      <div className="layout">
        <section className="panel">
          <span className="eyebrow">DRAFT</span>
          <h2>Draft Race</h2>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void run("load");
            }}
          >
            <label htmlFor="race-url">RaceTime.gg Race URL</label>
            <div className="formrow">
              <input
                id="race-url"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://racetime.gg/..."
              />
              <button disabled={operation !== "idle" || !url.trim()}>
                {operation === "load" ? "Loading…" : "Load Race"}
              </button>
            </div>
          </form>
          {i.broadcast.state === "reconciliation_required" && (
            <div className="callout warning">
              RaceTime.gg has changed.
              <button disabled={operation !== "idle"} onClick={() => void run("reconcile")}>
                Reconcile Draft
              </button>
            </div>
          )}
          {error && <div className="callout error">{error}</div>}
          <h3>RaceTime Session</h3>
          <p>
            Connection: <strong>{s.connection.state}</strong> · Race: {s.race?.status ?? "—"} ·
            Entrants: {s.race?.entrants.length ?? 0} · Revision: {s.revision}
          </p>
          <h3>Participants</h3>
          <div className="participants">
            {d.participants.map((participant) => (
              <ParticipantCard
                key={participant.racetimeUserId}
                draft={d}
                participant={participant}
                entrantName={
                  s.race?.entrants.find((entrant) => entrant.userId === participant.racetimeUserId)
                    ?.name ?? participant.racetimeUserId
                }
              />
            ))}
          </div>
          <PresentationEditor draft={d} session={s} players={players} />
          <CategoryEditor draft={d} />
          <CategoryPresentationEditor draft={d} />
          <SpeedrunSnapshotPanel draft={d} snapshot={snap} />
          <BroadcastApplyPanel draft={d} active={a} snapshot={snap} integration={i} session={s} />
        </section>
        <section className="panel">
          <span className="eyebrow">ON AIR</span>
          <h2>Active Race</h2>
          {a ? (
            <dl>
              <dt>Race ID</dt>
              <dd>{a.race.raceId}</dd>
              <dt>Category</dt>
              <dd>{a.race.categoryName}</dd>
              <dt>Goal</dt>
              <dd>{a.race.goal}</dd>
              <dt>Active revision</dt>
              <dd>{a.revision}</dd>
            </dl>
          ) : (
            <p>Nothing is currently applied.</p>
          )}
          <PersistencePanel persistence={p} />
        </section>
      </div>
    </main>
  );
}
