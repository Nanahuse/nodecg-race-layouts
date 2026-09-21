import { useEffect, useState } from "react";
import type {
  ActiveConfig,
  DraftConfig,
  DraftPlayer,
  IntegrationStatus,
  PlayerDirectory,
  PostApplyPersistenceState,
  RaceSession,
  DraftSpeedrunSnapshot,
} from "../../src/domain";
import { resolveDisplayName } from "../../src/domain";
import { raceApi } from "./api/race-api";
import { createParticipantApi } from "./api/participant-api";
import { createRacePresentationApi } from "./api/race-presentation-api";
import { useReplicant } from "./hooks/use-replicant";
import { statusTone } from "./model/status";
import { CategoryEditor } from "./components/category-editor";
import { CategoryPresentationEditor } from "./components/category-presentation-editor";
import { SpeedrunSnapshotPanel } from "./components/speedrun-snapshot-panel";
import { resetParticipantLocalState } from "./model/participant-state";

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

function Identity({
  label,
  link,
}: {
  label: string;
  link: DraftPlayer["speedrunCom"] | DraftPlayer["twitch"];
}) {
  if (link.state === "linked")
    return (
      <div className="identity">
        <strong>{label}</strong>
        <span className="identity-linked">
          linked:{" "}
          {"name" in link.value ? `${link.value.name} / ${link.value.userId}` : link.value.login}
        </span>
      </div>
    );
  return (
    <div className="identity">
      <strong>{label}</strong>
      <span className={link.state === "unresolved" ? "identity-unresolved" : "identity-none"}>
        {link.state}
      </span>
    </div>
  );
}

function ParticipantCard({
  participant,
  player,
  entrantName,
  directory,
  usedPlayerIds,
  revision,
}: {
  participant: DraftConfig["participants"][number];
  player: DraftPlayer | undefined;
  entrantName: string;
  directory: PlayerDirectory;
  usedPlayerIds: Set<string>;
  revision: number;
}) {
  const api = createParticipantApi(() => revision);
  const [displayName, setDisplayName] = useState(player?.manualDisplayName ?? "");
  const [speedrunId, setSpeedrunId] = useState("");
  const [twitchLogin, setTwitchLogin] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const next = resetParticipantLocalState(player);
    setDisplayName(next.displayName);
    setSpeedrunId(next.speedrunId);
    setTwitchLogin(next.twitchLogin);
    setError(next.error);
    setPending(null);
  }, [player?.playerId]);
  const run = async (
    operation: string,
    action: () => Promise<{ ok: boolean; message?: string }>,
  ) => {
    setPending(operation);
    setError(null);
    try {
      const result = await action();
      if (!result.ok) setError(result.message ?? "Participant update failed.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Participant update failed.");
    } finally {
      setPending(null);
    }
  };
  const currentDisplay = player ? (resolveDisplayName(player) ?? player.playerId) : "Unassigned";
  return (
    <article className="participant-card">
      <header>
        <div>
          <h4>{entrantName}</h4>
          <p className="muted">RaceTime ID: {participant.racetimeUserId}</p>
        </div>
        <strong>{currentDisplay}</strong>
      </header>
      {player ? (
        <>
          <label>
            Player Mapping
            <select
              value={player.playerId}
              disabled={pending !== null}
              onChange={(event) =>
                void run("player", () =>
                  api.setPlayer(participant.racetimeUserId, event.target.value),
                )
              }
            >
              <option value={player.playerId}>
                {currentDisplay} — {player.playerId}
              </option>
              {Object.values(directory)
                .filter((candidate) => candidate.playerId !== player.playerId)
                .map((candidate) => (
                  <option
                    key={candidate.playerId}
                    value={candidate.playerId}
                    disabled={usedPlayerIds.has(candidate.playerId)}
                  >
                    {resolveDisplayName(candidate) ?? candidate.playerId} — {candidate.playerId}
                    {usedPlayerIds.has(candidate.playerId) ? " (in use)" : ""}
                  </option>
                ))}
            </select>
          </label>
          <div className="identity-edit">
            <label>
              Display Name
              <input
                value={displayName}
                disabled={pending !== null}
                onChange={(event) => setDisplayName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void run("display", () =>
                      api.setDisplayName(participant.racetimeUserId, displayName.trim() || null),
                    );
                  }
                }}
              />
            </label>
            <button
              disabled={pending !== null}
              onClick={() =>
                void run("display", () =>
                  api.setDisplayName(participant.racetimeUserId, displayName.trim() || null),
                )
              }
            >
              Save
            </button>
          </div>
          <Identity label="Speedrun.com" link={player.speedrunCom} />
          <div className="identity-edit">
            <input
              placeholder="Speedrun.com user ID"
              value={speedrunId}
              disabled={pending !== null}
              onChange={(event) => setSpeedrunId(event.target.value)}
            />
            <button
              disabled={pending !== null || !speedrunId.trim()}
              onClick={() =>
                void run("speedrun", () =>
                  api.setSpeedrunCom(participant.racetimeUserId, speedrunId.trim()),
                )
              }
            >
              Set
            </button>
            <button
              disabled={pending !== null}
              onClick={() =>
                void run("speedrun-none", () => api.setSpeedrunComNone(participant.racetimeUserId))
              }
            >
              None
            </button>
          </div>
          <Identity label="Twitch" link={player.twitch} />
          <div className="identity-edit">
            <input
              placeholder="Twitch login"
              value={twitchLogin}
              disabled={pending !== null}
              onChange={(event) => setTwitchLogin(event.target.value)}
            />
            <button
              disabled={pending !== null || !twitchLogin.trim()}
              onClick={() =>
                void run("twitch", () =>
                  api.setTwitch(participant.racetimeUserId, twitchLogin.trim()),
                )
              }
            >
              Set
            </button>
            <button
              disabled={pending !== null}
              onClick={() =>
                void run("twitch-none", () => api.setTwitchNone(participant.racetimeUserId))
              }
            >
              None
            </button>
          </div>
        </>
      ) : (
        <p className="identity-unresolved">No Player Mapping assigned.</p>
      )}
      {pending && (
        <p className="pending" role="status">
          Updating {pending}…
        </p>
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
  directory,
}: {
  draft: DraftConfig;
  session: RaceSession;
  directory: PlayerDirectory;
}) {
  const api = createRacePresentationApi(() => draft.revision);
  const raceKey = draft.race?.raceId ?? "none";
  const [slots, setSlots] = useState(draft.raceScreenSlots);
  const [commentators, setCommentators] = useState<string[]>(draft.commentatorPlayerIds);
  const [pending, setPending] = useState<"slots" | "commentators" | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setSlots(draft.raceScreenSlots);
    setCommentators(draft.commentatorPlayerIds);
    setError(null);
  }, [raceKey]);
  const entrants = session.race?.entrants ?? [];
  const save = async (kind: "slots" | "commentators") => {
    setPending(kind);
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
      setPending(null);
    }
  };
  const slotValues = Object.values(slots);
  const playerCandidates = Object.values({ ...directory, ...draft.players });
  return (
    <>
      <h3>Race Screen</h3>
      <div className="presentation-editor">
        {([1, 2, 3, 4] as const).map((slot) => (
          <label key={slot}>
            P{slot}
            <select
              value={slots[slot] ?? ""}
              disabled={pending !== null}
              onChange={(event) => setSlots({ ...slots, [slot]: event.target.value || null })}
            >
              <option value="">Unassigned</option>
              {draft.participants.map((participant) => {
                const entrant = entrants.find((item) => item.userId === participant.racetimeUserId);
                const used =
                  slotValues.includes(participant.racetimeUserId) &&
                  slots[slot] !== participant.racetimeUserId;
                const player = participant.playerId
                  ? draft.players[participant.playerId]
                  : undefined;
                return (
                  <option
                    key={participant.racetimeUserId}
                    value={participant.racetimeUserId}
                    disabled={used}
                  >
                    {entrant?.name ?? participant.racetimeUserId}
                    {player ? ` — ${resolveDisplayName(player) ?? player.playerId}` : ""}
                    {used ? " (in use)" : ""}
                  </option>
                );
              })}
            </select>
          </label>
        ))}
      </div>
      <button disabled={pending !== null} onClick={() => void save("slots")}>
        {pending === "slots" ? "Saving slots…" : "Save Slots"}
      </button>
      <h3>Commentators</h3>
      <div className="presentation-editor">
        {[0, 1, 2].map((index) => (
          <label key={index}>
            {index + 1}
            <select
              value={commentators[index] ?? ""}
              disabled={pending !== null}
              onChange={(event) => {
                const next = [...commentators];
                next[index] = event.target.value;
                setCommentators(next);
              }}
            >
              <option value="">Unassigned</option>
              {playerCandidates.map((player) => {
                const used =
                  commentators.includes(player.playerId) && commentators[index] !== player.playerId;
                return (
                  <option key={player.playerId} value={player.playerId} disabled={used}>
                    {resolveDisplayName(player) ?? player.playerId}
                    {used ? " (in use)" : ""}
                  </option>
                );
              })}
            </select>
          </label>
        ))}
      </div>
      <button disabled={pending !== null} onClick={() => void save("commentators")}>
        {pending === "commentators" ? "Saving commentators…" : "Save Commentators"}
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
  const directory = useReplicant<PlayerDirectory>("player-directory");
  const integration = useReplicant<IntegrationStatus>("integration-status");
  const persistence = useReplicant<PostApplyPersistenceState>("post-apply-persistence");
  const snapshot = useReplicant<DraftSpeedrunSnapshot>("draft-speedrun-snapshot");
  const [url, setUrl] = useState("");
  const [operation, setOperation] = useState<"idle" | "load" | "reconcile">("idle");
  const [error, setError] = useState<string | null>(null);
  if (
    ![draft, active, session, directory, integration, persistence, snapshot].every(
      (item) => item.ready,
    )
  )
    return <main className="loading">Connecting to NodeCG…</main>;
  const d = draft.value!;
  const a = active.value!;
  const s = session.value!;
  const dir = directory.value!;
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
  const used = new Set(
    d.participants.map((item) => item.playerId).filter((id): id is string => id !== null),
  );
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
        <Badge label="Speedrun.com" state={i.speedrunCom.state} message={i.speedrunCom.message} />
        <Badge label="Spreadsheet" state={i.spreadsheet.state} message={i.spreadsheet.message} />
        <Badge label="Broadcast" state={i.broadcast.state} message={i.broadcast.message} />
      </section>
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
          <h3>Participants</h3>
          <div className="participants">
            {d.participants.map((participant) => (
              <ParticipantCard
                key={participant.racetimeUserId}
                participant={participant}
                player={participant.playerId ? d.players[participant.playerId] : undefined}
                entrantName={
                  s.race?.entrants.find((entrant) => entrant.userId === participant.racetimeUserId)
                    ?.name ?? participant.racetimeUserId
                }
                directory={dir}
                usedPlayerIds={used}
                revision={d.revision}
              />
            ))}
          </div>
          <h3>RaceTime Session</h3>
          <PresentationEditor draft={d} session={s} directory={dir} />
          <CategoryEditor draft={d} />
          <CategoryPresentationEditor draft={d} />
          <SpeedrunSnapshotPanel draft={d} snapshot={snap} />
          <p>
            Connection: <strong>{s.connection.state}</strong> · Race: {s.race?.status ?? "—"} ·
            Entrants: {s.race?.entrants.length ?? 0} · Revision: {s.revision}
          </p>
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
          <h2>Persistence</h2>
          <p className={`state ${statusTone(p.state)}`}>{p.state}</p>
          <p>
            {p.queue.length} pending saves · Last saved: {p.lastSavedActiveRevision ?? "—"}
          </p>
        </section>
      </div>
    </main>
  );
}
