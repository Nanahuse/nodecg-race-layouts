import { useEffect, useState } from "react";
import type {
  ActiveConfig,
  DraftConfig,
  IntegrationStatus,
  PlayerDirectory,
  PostApplyPersistenceState,
} from "../../../src/domain";
import { useReplicant } from "../hooks/use-replicant";
import { createPlayerDirectoryApi } from "../api/player-directory-api";
import {
  filterPlayers,
  getPlayerUsage,
  searchPlayers,
  sortPlayers,
  type PlayerFilter,
} from "./model";
import { PlayerList } from "./player-list";
import { PlayerDetail } from "./player-detail";

export function PlayerMappingApp() {
  const directory = useReplicant<PlayerDirectory>("player-directory");
  const draft = useReplicant<DraftConfig>("draft-config");
  const active = useReplicant<ActiveConfig | null>("active-config");
  const persistence = useReplicant<PostApplyPersistenceState>("post-apply-persistence");
  const integration = useReplicant<IntegrationStatus>("integration-status");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<PlayerFilter>("all");
  const [selected, setSelected] = useState<string | null>(null);
  const [reloadPending, setReloadPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    if (directory.ready && selected !== null && !directory.value[selected]) setSelected(null);
  }, [directory, selected]);
  if (![directory, draft, active, persistence, integration].every((item) => item.ready))
    return (
      <main className="player-mapping-shell">
        <p>Connecting to NodeCG…</p>
      </main>
    );
  if (!directory.ready || !draft.ready || !active.ready || !persistence.ready || !integration.ready)
    return null;
  const players = Object.values(directory.value);
  const usages = Object.fromEntries(
    players.map((player) => [
      player.playerId,
      getPlayerUsage(player.playerId, draft.value, active.value, persistence.value),
    ]),
  );
  const visible = sortPlayers(filterPlayers(searchPlayers(players, query), filter));
  const selectedPlayer = players.find((player) => player.playerId === selected);
  const reload = async () => {
    setReloadPending(true);
    setMessage(null);
    try {
      const result = await createPlayerDirectoryApi().reload();
      setMessage(
        result.ok ? `Loaded ${result.playerCount} players.` : `${result.reason}: ${result.message}`,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "NodeCG communication error");
    } finally {
      setReloadPending(false);
    }
  };
  return (
    <main className="player-mapping-shell">
      <header>
        <div>
          <span className="eyebrow">PLAYER MAPPING</span>
          <h1>Player Mapping</h1>
        </div>
        <div className="spreadsheet-status">
          Spreadsheet: <strong>{integration.value.spreadsheet.state}</strong>
          <button disabled={reloadPending} onClick={() => void reload()}>
            {reloadPending ? "Reloading…" : "Reload from Spreadsheet"}
          </button>
        </div>
      </header>
      {message && <p className="callout">{message}</p>}
      <div className="player-mapping-layout">
        <section className="player-list-pane">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search players"
          />
          <select
            value={filter}
            onChange={(event) => setFilter(event.target.value as PlayerFilter)}
          >
            <option value="all">All</option>
            <option value="missing-racetime">Missing RaceTime</option>
            <option value="missing-speedruncom">Missing Speedrun.com</option>
            <option value="missing-twitch">Missing Twitch</option>
          </select>
          <PlayerList
            players={visible}
            selected={selected}
            usages={usages}
            onSelect={setSelected}
          />
        </section>
        <section className="player-detail-pane">
          <PlayerDetail player={selectedPlayer} usage={selected ? usages[selected] : undefined} />
        </section>
      </div>
    </main>
  );
}
