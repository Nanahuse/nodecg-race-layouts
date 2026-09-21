import type { RaceOverlayData, RaceOverlayPlayer } from "../../../src/domain";

const accents = ["red", "green", "yellow", "blue"] as const;

function PlayerHud({ player }: { player: RaceOverlayPlayer }) {
  return (
    <article className={`player-hud slot-${player.slot}`} data-accent={accents[player.slot - 1]}>
      <strong>{player.displayName}</strong>
      {player.twitchLogin && <small>Twitch: {player.twitchLogin}</small>}
      {player.personalBest.time && (
        <small>
          PB {player.personalBest.time}
          {player.personalBest.rank !== null && ` · Rank #${player.personalBest.rank}`}
        </small>
      )}
    </article>
  );
}

export function RaceGraphic({ data }: { data: RaceOverlayData | null }) {
  if (!data) return null;
  const eventLabel = data.event.logoUrl ? (
    <img src={data.event.logoUrl} alt={data.event.shortName ?? data.event.name} />
  ) : (
    <span>{data.event.shortName ?? data.event.name}</span>
  );

  return (
    <main className="race-graphic">
      <header className="race-header">
        <div className="event">{eventLabel}</div>
        <div className="category">{data.category.name}</div>
      </header>
      <section className="players" aria-label="Race players">
        {data.players.map((player) => (
          <PlayerHud key={player.slot} player={player} />
        ))}
      </section>
      <footer className="race-footer">
        {data.worldRecord && (
          <div>
            WR {data.worldRecord.time} — {data.worldRecord.holders.join(", ")}
          </div>
        )}
        {data.commentators.length > 0 && (
          <div className="commentators">
            {data.commentators.map((commentator) => (
              <span key={commentator.playerId}>
                {commentator.displayName}
                {commentator.twitchLogin && <small> ({commentator.twitchLogin})</small>}
              </span>
            ))}
          </div>
        )}
      </footer>
    </main>
  );
}
