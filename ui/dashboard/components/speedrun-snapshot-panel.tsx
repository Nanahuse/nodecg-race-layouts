import { useState } from "react";
import type { DraftConfig, DraftSpeedrunSnapshot } from "../../../src/domain";
import { resolveDisplayName } from "../../../src/domain";
import { createSnapshotApi } from "../api/speedrun-snapshot-api";
export function SpeedrunSnapshotPanel({
  draft,
  snapshot,
}: {
  draft: DraftConfig;
  snapshot: DraftSpeedrunSnapshot;
}) {
  const api = createSnapshotApi(() => draft.revision);
  const [error, setError] = useState<string | null>(null);
  const refresh = async () => {
    setError(null);
    const result = await api.refresh();
    if (!result.ok) setError(result.message);
  };
  return (
    <section className="subpanel">
      <h3>Speedrun Snapshot</h3>
      <p>
        State: <strong>{snapshot.state}</strong>
        {snapshot.message ? ` · ${snapshot.message}` : ""}
      </p>
      <button disabled={snapshot.state === "fetching"} onClick={() => void refresh()}>
        Refresh Snapshot
      </button>
      {snapshot.snapshot && (
        <>
          <p>
            Fetched: {snapshot.snapshot.fetchedAt} · Snapshot: {snapshot.snapshot.snapshotId}
          </p>
          <p>
            World Record:{" "}
            {snapshot.snapshot.worldRecord
              ? `${snapshot.snapshot.worldRecord.formattedTime} — ${snapshot.snapshot.worldRecord.holders.map((holder) => holder.name).join(" / ")}`
              : "No WR / unavailable"}
          </p>
          <ol>
            {snapshot.snapshot.leaderboard.slice(0, 10).map((entry) => (
              <li key={`${entry.rank}-${entry.speedrunComUserId}`}>
                #{entry.rank} {entry.speedrunComName} — {entry.formattedTime}
              </li>
            ))}
          </ol>
          <h4>Participant PB</h4>
          <ul>
            {draft.participants.map((participant) => {
              const player = participant.playerId ? draft.players[participant.playerId] : undefined;
              if (!player || player.speedrunCom.state !== "linked") return null;
              const pb = snapshot.snapshot?.personalBests[player.speedrunCom.value.userId] ?? null;
              return (
                <li key={participant.racetimeUserId}>
                  {resolveDisplayName(player) ?? player.playerId}:{" "}
                  {pb ? `${pb.formattedTime} (rank ${pb.rank ?? "—"})` : "Unavailable"}
                </li>
              );
            })}
          </ul>
        </>
      )}
      {error && <p className="callout error">{error}</p>}
    </section>
  );
}
