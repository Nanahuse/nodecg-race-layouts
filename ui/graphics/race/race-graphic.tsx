import type { RaceOverlayData, RaceOverlayPlayer } from "../../../src/domain";

const accents = ["red", "green", "yellow", "blue"] as const;

function RaceSlot({ player }: { player: RaceOverlayPlayer }) {
  if (player.displayName === null) return null;

  return (
    <article className={`race-slot slot-${player.slot}`} data-accent={accents[player.slot - 1]}>
      <div className="video-frame" aria-hidden="true" />
      <span className="slot-badge">P{player.slot}</span>
      <div className="player-bar">
        <div className="player-identity">
          <strong className="player-name">{player.displayName}</strong>
          {player.twitchLogin && <span className="player-twitch">@{player.twitchLogin}</span>}
        </div>
        <div className="player-stats">
          <span className="player-pb">PB {player.personalBest.time ?? "—"}</span>
          {player.personalBest.rank !== null && (
            <span className="player-rank">#{player.personalBest.rank}</span>
          )}
        </div>
        <div className="timer-frame" aria-hidden="true" />
      </div>
    </article>
  );
}

export function RaceGraphic({ data }: { data: RaceOverlayData | null }) {
  if (!data) return null;

  return (
    <main className="race-graphic">
      {data.players.map((player) => (
        <RaceSlot key={player.slot} player={player} />
      ))}
      <section className="race-meta" aria-label="Race information">
        <div className="meta-topline">
          <div className="category" title={data.category.name}>
            {data.category.name}
          </div>
          <div className="world-record" title={data.worldRecord?.holders.join(" / ") ?? ""}>
            {data.worldRecord
              ? `WR ${data.worldRecord.time} — ${data.worldRecord.holders.join(" / ")}`
              : "WR —"}
          </div>
        </div>
        <div className="commentators">
          <strong className="commentary-label">Commentary</strong>
          <div className="commentator-list">
            {data.commentators.map((commentator) => (
              <span className="commentator" key={commentator.playerId}>
                <span className="commentator-name">{commentator.displayName}</span>
                {commentator.twitchLogin && (
                  <span className="commentator-twitch">@{commentator.twitchLogin}</span>
                )}
              </span>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
