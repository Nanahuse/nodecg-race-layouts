import type {
  ActiveConfig,
  ActiveSpeedrunSnapshot,
  CommentatorView,
  LeaderboardPageData,
  ParticipantListData,
  RaceOverlayData,
  PlayerPersonalBestView,
} from "../../domain";
import type { EventConfig } from "../config";
import { RACE_SCREEN_SLOT_NUMBERS } from "../../domain/race-screen";
import { resolveDisplayName } from "../../domain/display-name";

export type BuildResult<T> = { ok: true; value: T } | { ok: false; issues: string[] };
const sourceLabel = "Speedrun.com";
const eventView = (e: EventConfig) => ({
  name: e.name,
  shortName: e.shortName,
  logoUrl: e.logoUrl,
});
const textEqual = (a: string, b: string) => a.trim() === b.trim();
function player(config: ActiveConfig, id: string) {
  return config.players[id];
}
function name(config: ActiveConfig, id: string): string | null {
  const p = player(config, id);
  return p ? resolveDisplayName(p) : null;
}
function pb(
  config: ActiveConfig,
  snapshot: ActiveSpeedrunSnapshot,
  id: string,
  limitRank = false,
): PlayerPersonalBestView {
  const p = player(config, id);
  const src =
    p?.speedrunCom.state === "linked"
      ? snapshot.snapshot.personalBests[p.speedrunCom.value.userId]
      : null;
  return {
    time: src?.formattedTime ?? null,
    rank: src && (!limitRank || src.rank === null || src.rank <= 20) ? src.rank : null,
  };
}
function commentators(config: ActiveConfig): BuildResult<CommentatorView[]> {
  const issues: string[] = [];
  const value = config.commentatorPlayerIds.map((id) => {
    const displayName = name(config, id);
    if (!player(config, id)) issues.push(`Commentator player missing: ${id}`);
    else if (!displayName) issues.push(`Display name unresolved: ${id}`);
    const p = player(config, id);
    return {
      playerId: id,
      displayName: displayName ?? "",
      twitchLogin: p?.twitch.state === "linked" ? p.twitch.value.login : null,
    };
  });
  return issues.length ? { ok: false, issues } : { ok: true, value };
}
export function buildRaceOverlayData(
  config: ActiveConfig,
  snapshot: ActiveSpeedrunSnapshot,
  event: EventConfig,
): BuildResult<RaceOverlayData> {
  if (config.revision !== snapshot.activeRevision)
    return { ok: false, issues: ["Active revision mismatch"] };
  const issues: string[] = [];
  const players = RACE_SCREEN_SLOT_NUMBERS.map((slot) => {
    const userId = config.raceScreenSlots[slot];
    if (userId === null) {
      return {
        slot,
        displayName: null,
        twitchLogin: null,
        personalBest: { time: null, rank: null },
      };
    }
    const part = config.participants.find((p) => p.racetimeUserId === userId);
    const displayName = part ? name(config, part.playerId) : null;
    if (!part) issues.push(`Slot participant missing: ${userId}`);
    else if (!displayName) issues.push(`Display name unresolved: ${part.playerId}`);
    const p = part ? player(config, part.playerId) : undefined;
    return {
      slot,
      displayName: displayName ?? "",
      twitchLogin: p?.twitch.state === "linked" ? p.twitch.value.login : null,
      personalBest: part ? pb(config, snapshot, part.playerId, true) : { time: null, rank: null },
    };
  });
  const cs = commentators(config);
  if (!cs.ok) issues.push(...cs.issues);
  if (issues.length) return { ok: false, issues };
  const wr = snapshot.snapshot.worldRecord;
  return {
    ok: true,
    value: {
      activeRevision: config.revision,
      event: eventView(event),
      category: { name: config.categorySelection.categoryName },
      worldRecord: wr ? { time: wr.formattedTime, holders: wr.holders.map((h) => h.name) } : null,
      commentators: cs.ok ? cs.value : [],
      players: players as RaceOverlayData["players"],
    },
  };
}
export function buildParticipantListData(
  config: ActiveConfig,
  snapshot: ActiveSpeedrunSnapshot,
  event: EventConfig,
): BuildResult<ParticipantListData> {
  if (config.revision !== snapshot.activeRevision)
    return { ok: false, issues: ["Active revision mismatch"] };
  const cs = commentators(config);
  if (!cs.ok) return cs;
  const entries: ParticipantListData["participants"] = [];
  for (const part of config.participants) {
    const displayName = name(config, part.playerId);
    if (!displayName) return { ok: false, issues: [`Display name unresolved: ${part.playerId}`] };
    const p = player(config, part.playerId);
    if (!p) return { ok: false, issues: [`Participant player missing: ${part.playerId}`] };
    entries.push({
      racetimeUserId: part.racetimeUserId,
      displayName,
      speedrunComName: p.speedrunCom.state === "linked" ? p.speedrunCom.value.name : null,
      personalBest: pb(config, snapshot, part.playerId),
    });
  }
  return {
    ok: true,
    value: {
      activeRevision: config.revision,
      event: eventView(event),
      category: { name: config.categorySelection.categoryName },
      commentators: cs.value,
      participants: entries,
    },
  };
}
export function buildLeaderboardPageData(
  config: ActiveConfig,
  snapshot: ActiveSpeedrunSnapshot,
  event: EventConfig,
): BuildResult<LeaderboardPageData> {
  for (const participant of config.participants)
    if (!player(config, participant.playerId))
      return { ok: false, issues: [`Participant player missing: ${participant.playerId}`] };
  if (config.revision !== snapshot.activeRevision)
    return { ok: false, issues: ["Active revision mismatch"] };
  const map = new Map<string, string>();
  for (const p of config.participants) {
    const playerValue = player(config, p.playerId);
    if (!playerValue) return { ok: false, issues: [`Participant player missing: ${p.playerId}`] };
    if (playerValue.speedrunCom.state === "linked") {
      const id = playerValue.speedrunCom.value.userId;
      if (map.has(id)) return { ok: false, issues: [`Duplicate SRC user mapping: ${id}`] };
      const n = name(config, p.playerId);
      if (!n) return { ok: false, issues: [`Display name unresolved: ${p.playerId}`] };
      map.set(id, n);
    }
  }
  const cat = config.categoryPresentation;
  const entries = snapshot.snapshot.leaderboard
    .filter((e) => e.rank <= 10)
    .map((e) => {
      const n = map.get(e.speedrunComUserId ?? "") ?? e.speedrunComName;
      return {
        rank: e.rank,
        name: n,
        secondaryName:
          map.has(e.speedrunComUserId ?? "") && !textEqual(n, e.speedrunComName)
            ? e.speedrunComName
            : null,
        time: e.formattedTime,
      };
    });
  return {
    ok: true,
    value: {
      activeRevision: config.revision,
      event: eventView(event),
      category: {
        title: cat?.title ?? config.categorySelection.categoryName,
        subtitle: cat?.subtitle ?? null,
      },
      presentation: {
        ruleHeading: cat?.ruleHeading ?? null,
        ruleLines: [...(cat?.ruleLines ?? [])],
        leaderboardHeading: cat?.leaderboardHeading ?? "Leaderboard",
        sourceLabel,
      },
      leaderboard: entries,
    },
  };
}
