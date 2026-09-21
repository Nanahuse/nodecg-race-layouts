import type { PlayerMapping } from "../../../src/domain";
import { resolveDisplayName } from "../../../src/domain";
import type { PlayerUsage } from "./model";

function LinkDetail({
  label,
  link,
}: {
  label: string;
  link: PlayerMapping["racetime"] | PlayerMapping["speedrunCom"] | PlayerMapping["twitch"];
}) {
  if (link.state === "none")
    return (
      <>
        <dt>{label}</dt>
        <dd>None</dd>
      </>
    );
  return (
    <>
      <dt>{label} State</dt>
      <dd>Linked</dd>
      {"userId" in link.value && (
        <>
          <dt>{label} User ID</dt>
          <dd>{link.value.userId ?? "—"}</dd>
        </>
      )}
      {"name" in link.value && (
        <>
          <dt>{label} Name</dt>
          <dd>{link.value.name}</dd>
        </>
      )}
      {"twitchLogin" in link.value && (
        <>
          <dt>{label} Twitch login</dt>
          <dd>{link.value.twitchLogin ?? "—"}</dd>
        </>
      )}
      {"login" in link.value && (
        <>
          <dt>{label} Login</dt>
          <dd>{link.value.login}</dd>
        </>
      )}
    </>
  );
}
export function PlayerDetail({
  player,
  usage,
}: {
  player: PlayerMapping | undefined;
  usage?: PlayerUsage;
}) {
  if (!player) return <div className="empty-detail">Select a player to view details.</div>;
  return (
    <div className="player-detail">
      <div className="usage-badges">
        {usage?.inDraft && <em>In Draft</em>}
        {usage?.onAir && <em>On Air</em>}
        {usage?.pendingPersistence && <em>Pending Persistence</em>}
      </div>
      <dl>
        <dt>Resolved Display Name</dt>
        <dd>{resolveDisplayName(player) ?? "—"}</dd>
        <dt>Manual Display Name</dt>
        <dd>{player.manualDisplayName ?? "—"}</dd>
        <dt>Player ID</dt>
        <dd>{player.playerId}</dd>
        <LinkDetail label="RaceTime" link={player.racetime} />
        <LinkDetail label="Speedrun.com" link={player.speedrunCom} />
        <LinkDetail label="Twitch" link={player.twitch} />
      </dl>
    </div>
  );
}
