import type { PlayerMapping } from "../../../src/domain";
import { resolveDisplayName } from "../../../src/domain";
import type { PlayerUsage } from "./model";

export function PlayerList({
  players,
  selected,
  usages,
  onSelect,
  disabled,
}: {
  players: PlayerMapping[];
  selected: string | null;
  usages: Record<string, PlayerUsage>;
  onSelect: (id: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="player-list">
      {players.map((player) => {
        const usage = usages[player.playerId];
        return (
          <button
            disabled={disabled}
            className={`player-row ${selected === player.playerId ? "selected" : ""}`}
            key={player.playerId}
            onClick={() => onSelect(player.playerId)}
          >
            <strong>{resolveDisplayName(player) ?? player.playerId}</strong>
            <small>{player.playerId}</small>
            <span className="identity-indicators">
              RT {player.racetime.state === "linked" ? "✓" : "—"} · SRC{" "}
              {player.speedrunCom.state === "linked" ? "✓" : "—"} · TW{" "}
              {player.twitch.state === "linked" ? "✓" : "—"}
            </span>
            <span className="usage-badges">
              {usage?.inDraft && <em>In Draft</em>}
              {usage?.onAir && <em>On Air</em>}
              {usage?.pendingPersistence && <em>Pending Persistence</em>}
            </span>
          </button>
        );
      })}
    </div>
  );
}
