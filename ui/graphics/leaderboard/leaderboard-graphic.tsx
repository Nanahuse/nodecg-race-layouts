import type { LeaderboardPageData, LeaderboardPageEntry } from "../../../src/domain";

export type LeaderboardDensity = "normal" | "compact" | "dense" | "extra-dense";

export function getLeaderboardDensity(count: number): LeaderboardDensity {
  if (count >= 17) return "extra-dense";
  if (count >= 13) return "dense";
  if (count >= 11) return "compact";
  return "normal";
}

function LeaderboardRow({ entry }: { entry: LeaderboardPageEntry }) {
  return (
    <div className="leaderboard-row">
      <span className="leaderboard-rank">{entry.rank}</span>
      <span className="leaderboard-name">
        <strong>{entry.name}</strong>
        {entry.secondaryName !== null && <small>{entry.secondaryName}</small>}
      </span>
      <span className="leaderboard-time">{entry.time}</span>
    </div>
  );
}

export function LeaderboardGraphic({ data }: { data: LeaderboardPageData | null }) {
  if (!data) return null;
  const density = getLeaderboardDensity(data.leaderboard.length);
  return (
    <main className="leaderboard-graphic">
      <section className={"leaderboard-panel leaderboard-" + density} aria-label="Leaderboard">
        <div className="leaderboard-heading" aria-hidden="true">
          <span>Rank</span>
          <span>Name</span>
          <span>Time</span>
        </div>
        <div className="leaderboard-rows">
          {data.leaderboard.map((entry) => (
            <LeaderboardRow key={`${entry.rank}-${entry.name}`} entry={entry} />
          ))}
        </div>
      </section>
    </main>
  );
}
