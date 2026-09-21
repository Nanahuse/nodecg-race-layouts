import type { DraftConfig, DraftSpeedrunSnapshot } from "../../../src/domain";
import { createSnapshotApi } from "../api/speedrun-snapshot-api";
export function SpeedrunSnapshotPanel({
  draft,
  snapshot,
}: {
  draft: DraftConfig;
  snapshot: DraftSpeedrunSnapshot;
}) {
  const api = createSnapshotApi(() => draft.revision);
  return (
    <section className="subpanel">
      <h3>Speedrun Snapshot</h3>
      <p>
        State: <strong>{snapshot.state}</strong>
        {snapshot.message ? ` · ${snapshot.message}` : ""}
      </p>
      <button disabled={snapshot.state === "fetching"} onClick={() => void api.refresh()}>
        Refresh Snapshot
      </button>
      {snapshot.snapshot && (
        <>
          <p>
            Fetched: {snapshot.snapshot.fetchedAt} · Snapshot: {snapshot.snapshot.snapshotId}
          </p>
          <p>
            World Record: {snapshot.snapshot.worldRecord?.formattedTime ?? "No WR / unavailable"}
          </p>
          <ol>
            {snapshot.snapshot.leaderboard.slice(0, 10).map((entry) => (
              <li key={`${entry.rank}-${entry.speedrunComUserId}`}>
                #{entry.rank} {entry.speedrunComName} — {entry.formattedTime}
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}
