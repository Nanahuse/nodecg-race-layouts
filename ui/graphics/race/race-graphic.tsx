import { useState } from "react";
import type { RaceOverlayData, RaceOverlayPlayer } from "../../../src/domain";

const accents = ["red", "green", "yellow", "blue"] as const;

function VideoSlot({ player }: { player: RaceOverlayPlayer }) {
  if (player.displayName === null) return null;

  return (
    <div className={`video-slot p${player.slot}`} data-accent={accents[player.slot - 1]}>
      <div className="video-frame" aria-hidden="true" />
      <span className="slot-tag">P{player.slot}</span>
    </div>
  );
}

function PlayerCard({ player }: { player: RaceOverlayPlayer }) {
  return (
    <article
      className={`player-card player-card-${player.slot}${player.displayName === null ? " unassigned" : ""}`}
      data-accent={accents[player.slot - 1]}
      aria-label={
        player.displayName === null ? `P${player.slot} unassigned` : `P${player.slot} player card`
      }
    >
      {player.displayName !== null && (
        <>
          <div className="timer-frame" aria-label={`P${player.slot} timer crop area`} />
          <strong className="player-name">{player.displayName}</strong>
          <span className="player-twitch">
            {player.twitchLogin ? `@${player.twitchLogin}` : ""}
          </span>
          <div className="player-stats">
            <span className="personal-best-label">PERSONAL BEST</span>
            <div className="personal-best-value">
              <span className="personal-best-time">{player.personalBest.time ?? "—"}</span>
              {player.personalBest.rank !== null && (
                <span className="rank-badge">#{player.personalBest.rank}</span>
              )}
            </div>
          </div>
        </>
      )}
    </article>
  );
}

function EventBranding({ data }: { data: RaceOverlayData["event"] }) {
  const [logoFailed, setLogoFailed] = useState(false);
  const fallback = data.shortName || data.name;

  return (
    <div className="event-branding">
      {data.logoUrl && !logoFailed ? (
        <img
          className="event-logo"
          src={data.logoUrl}
          alt={fallback}
          onError={() => setLogoFailed(true)}
        />
      ) : (
        <strong className="event-name">{fallback}</strong>
      )}
    </div>
  );
}

function Commentators({ data }: { data: RaceOverlayData["commentators"] }) {
  return (
    <div className="commentators" aria-label="Commentators">
      <span className="commentary-label">COMMENTARY</span>
      <div className="commentator-list">
        {data.map((commentator) => (
          <span className="commentator" key={commentator.playerId}>
            <span className="commentator-name">{commentator.displayName}</span>
            {commentator.twitchLogin && (
              <span className="commentator-twitch">@{commentator.twitchLogin}</span>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}

function CategoryAndRecord({ data }: { data: RaceOverlayData }) {
  return (
    <section className="category-wr" aria-label="Category and World Record">
      <div className="category" title={data.category.name}>
        {data.category.name}
      </div>
      <div className="world-record">
        <span className="world-record-label">WORLD RECORD</span>
        <strong className="world-record-time">{data.worldRecord?.time ?? "—"}</strong>
        {data.worldRecord && (
          <span className="world-record-holders" title={data.worldRecord.holders.join(" / ")}>
            {data.worldRecord.holders.join(" / ")}
          </span>
        )}
      </div>
    </section>
  );
}

export function RaceGraphic({ data }: { data: RaceOverlayData | null }) {
  if (!data) return null;

  const players = [1, 2, 3, 4].map((slot) =>
    data.players.find((player) => player.slot === slot)!,
  ) as RaceOverlayData["players"];

  return (
    <main className="race-graphic">
      <div className="race-layout">
        {players.map((player) => (
          <VideoSlot key={`video-${player.slot}`} player={player} />
        ))}
        <section className="center-column" aria-label="Race information">
          <header className="event-header">
            <EventBranding data={data.event} />
            <Commentators data={data.commentators} />
          </header>
          <div className="player-pair top-pair">
            <PlayerCard player={players[0]} />
            <PlayerCard player={players[1]} />
          </div>
          <div className="player-pair bottom-pair">
            <PlayerCard player={players[2]} />
            <PlayerCard player={players[3]} />
          </div>
          <CategoryAndRecord data={data} />
        </section>
      </div>
    </main>
  );
}
