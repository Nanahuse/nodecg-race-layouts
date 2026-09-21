# nodecg-race-layouts

NodeCG layouts for RTA race events.

## Requirements

- Node.js 24 or newer (see `.node-version` / `.nvmrc`).

## Foundation

The repository contains the domain/replicant/schema foundation, the **Player
Directory** persistence layer and the **RaceTime.gg race session** integration.
Not yet implemented: Speedrun.com, player resolution, the apply pipeline and the
dashboard/graphics UI.

```
src/domain/       Domain types, display-name resolution, active validation
src/replicants/   Replicant names, value types, safe defaults and declaration
src/extension/    NodeCG extension entry point, application services and
                  spreadsheet / racetime integrations
src/types/        Minimal structural typings for the NodeCG API we use
scripts/          JSON Schema generation from the TypeScript domain types
schemas/          Generated JSON Schemas (do not edit by hand)
test/             Unit and schema tests
```

### Player Directory spreadsheet

The `player-directory` replicant is persisted to a Google Spreadsheet. The
spreadsheet integration lives in `src/extension/integrations/spreadsheet` and is
split into a thin `SpreadsheetClient`, a `SpreadsheetPlayersRepository` and a
`PlayerDirectoryService` that owns the replicant updates.

The `Players` sheet columns (matched by header name, not position):

```
player_id, manual_display_name,
racetime_state, racetime_user_id, racetime_name, racetime_twitch_login,
speedruncom_state, speedruncom_user_id, speedruncom_name, speedruncom_twitch_login,
twitch_state, twitch_user_id, twitch_login,
updated_at
```

Only confirmed account states (`linked` / `none`) are stored; `unresolved` is a
draft-only state. If a spreadsheet load fails, the last valid
`player-directory` is kept and `integration-status.spreadsheet` becomes
`error`.

Authentication uses Google Application Default Credentials (e.g. the
`GOOGLE_APPLICATION_CREDENTIALS` environment variable). No credentials are
stored in the repository or in the bundle config.

Configure the bundle in NodeCG's `cfg/nodecg-race-layouts.json` (validated
against `configschema.json`; see `config.example.json`):

```json
{
  "spreadsheet": {
    "spreadsheetId": "your-spreadsheet-id",
    "playersSheet": "Players"
  }
}
```

### RaceTime.gg race sessions

`src/extension/integrations/racetime` watches a race and keeps the normalized
`draft-race-session` / `active-race-session` replicants up to date.

- `url.ts` validates operator URLs (`https://racetime.gg/<category>/<race>`) and
  builds the Race Detail URL internally, so an arbitrary URL is never fetched.
- `client.ts` performs the Race Detail GET (`/<category>/<race>/data`) with a
  timeout, using the Node.js global `fetch`; `parseRaceDetail` validates the
  untrusted payload.
- `mapper.ts` maps the integration DTO to the domain `RaceSessionRace` and
  normalizes result statuses (`done`→`finished`, `dnf`→`dnf`, `dq`→`dq`, else
  `other`).
- `watcher.ts` treats the Race WebSocket as an invalidation signal only: a
  `race.data` message triggers a full Race Detail re-fetch (coalesced). Chat and
  other events are ignored. Disconnects keep the last race and reconnect with
  bounded backoff, re-fetching before reconnecting.
- `race-session-service.ts` runs one watcher per role (`draft` / `active`),
  manages revisions, protects against stale callbacks and aggregates
  `integration-status.racetime`.

### Race load & reconciliation

`race.load` and `race.reconcile` are NodeCG messages handled in
`src/extension/messages/race-messages.ts`; the workflow lives in
`race-draft-service.ts` and never touches active state.

- `race.load { url }` loads a race for the `draft` role, resolves RaceTime
  entrants to the persisted `player-directory` and writes `draft-config` once
  (participants, players, P1–P4 slots). New draft players are **not** written to
  the spreadsheet.
- Player resolution (`player-resolution-service.ts`) is pure and prioritized:
  RaceTime user id exact match, then an unambiguous case-insensitive Twitch
  login exact match, otherwise a new draft player. No fuzzy/name matching.
- RaceTime-side structural changes are detected via
  `needsDraftReconciliation` and surface as
  `integration-status.broadcast.state = "reconciliation_required"` without
  modifying the draft. Result-only changes (status, time, place, DNF/DQ) are
  ignored.
- `race.reconcile { expectedDraftRevision }` applies those changes while
  preserving operator edits, valid slots and commentators, and resets the
  category selection when the category slug/goal changes.

### Category mapping & presentation

`category.*` messages (handled in `messages/category-messages.ts`, workflow in
`category-draft-service.ts`) keep the per-race selection separate from the
persisted preset:

- `CategoryMappings` and `CategoryPresentation` are separate sheets, keyed by
  `racetime_category_slug + racetime_goal`.
- On `race.load`/`race.reconcile` the preset for the race's category key is
  looked up and applied to the draft. A spreadsheet lookup failure only leaves
  the selection/presentation empty; it never fails the race load.
- `category.select` sets a manual selection and recomputes `savedMappingState`
  (`none`/`matches`/`overridden`) without writing to the spreadsheet.
- `category.mapping.register` / `update` / `revert` and
  `category.presentation.update` / `save` / `revert` are the **only** operations
  that persist to the spreadsheet, and all require `expectedDraftRevision`.
- Changing the leaderboard conditions invalidates `draft-speedrun-snapshot`;
  presentation edits never do.

### Speedrun.com discovery

`src/extension/integrations/speedruncom` is a read-only Speedrun.com API v1
client. It never mutates the draft, active state or player directory; it only
updates `integration-status.speedrunCom`.

- `client.ts` performs the HTTP calls with the Node.js global `fetch`, a 10s
  timeout, `AbortSignal` support, a descriptive `User-Agent`, pagination
  (`max`/`offset`, bounded by a max page count) and a small in-memory cache with
  request coalescing.
- `parser.ts` removes the `{ data }` / `{ data, pagination }` envelopes;
  `mapper.ts` validates only the fields we use and normalizes them.
- Errors are structured (`not_found`, `rate_limited` with `Retry-After`,
  `timeout`, `network_error`, `invalid_json`, `invalid_payload`, ...); no
  automatic retry.
- `speedrun-discovery-service.ts` exposes game search / detail / options,
  category variables and user search / detail, and drives the in-flight-aware
  `integration-status.speedrunCom` (`fetching`/`ready`/`error`).
- `speedrun.games.search`, `speedrun.game.get`, `speedrun.game.options`,
  `speedrun.category.variables`, `speedrun.users.search` and `speedrun.user.get`
  are registered in `messages/speedrun-messages.ts`.

### Speedrun.com leaderboard snapshot

`speedrun.snapshot.refresh { expectedDraftRevision }` (handled in
`speedrun-snapshot-messages.ts`, workflow in `speedrun-snapshot-service.ts`)
builds `draft-speedrun-snapshot` from the current category selection and the
participants' linked Speedrun.com identities.

- The request is derived from the single `LeaderboardKey`: full-game or
  individual-level path, plus `platform`/`region`/`emulators`/`timing`/`var-*`
  filters and `embed=players`.
- `top=20` means **top 20 places**, so ties are kept (more than 20 entries).
- WR / Top20 / Participant PB / rank all come from the same leaderboard
  conditions. Top-20 participants reuse their leaderboard entry instead of a PB
  request; only linked participants outside the top 20 fetch
  `/users/{id}/personal-bests?game=` (bounded concurrency).
- A personal-best `place` is only used as a rank when no extra filters are
  applied; otherwise `rank` is `null`.
- A leaderboard failure sets the snapshot to `error`; an individual PB failure
  keeps the snapshot `ready` with `personalBests[userId] = null` and a warning.
- Non-invalidating draft edits (presentation, display name, ...) retag the
  snapshot's `draftRevision`; leaderboard-invalidating edits reset it.

### Participant identity resolution

Draft participants start with `speedrunCom = unresolved`. They can be resolved
automatically on race load / reconcile, or manually through the
`participant.*` messages (handled in `participant-messages.ts`, workflow in
`participant-draft-service.ts`).

- Automatic resolution (`automatic-identity-resolution-service.ts`) only touches
  `unresolved` Speedrun.com identities. It first completes Twitch from
  `racetime.value.twitchLogin`, then searches Speedrun.com by Twitch login
  (exact, case-insensitive) and links only a single unambiguous candidate,
  skipping conflicts already present in the draft or player directory. Any
  Speedrun.com failure leaves the identity unresolved and never fails the race
  load / reconcile. Bounded concurrency, no automatic retry.
- Manual edits: `participant.set-player`, `participant.set-speedruncom`,
  `participant.set-speedruncom-none`, `participant.set-twitch`,
  `participant.set-twitch-none` and `participant.set-display-name`. All require
  `expectedDraftRevision`; the async Speedrun.com lookup re-checks the revision
  before committing.
- A `speedruncom`-sourced Twitch link is derived: it follows the linked SRC
  account and clears when SRC is cleared or has no Twitch login. Operator
  `manual` / `spreadsheet` links are never overwritten by automation.
- Snapshots reset only when the participant Speedrun.com user-id set changes;
  display-name / Twitch-only edits retag. Player directory and active state are
  never modified.

### Race screen & commentators

`race-screen.set-slots` and `commentators.set` (handled in
`race-presentation-messages.ts`, workflow in `race-presentation-draft-service.ts`)
edit the draft's broadcast structure. Both require `expectedDraftRevision` and
never reset the snapshot (slots and commentators do not affect leaderboard
conditions), so a ready snapshot is retagged.

- Slots are set all at once (`{ 1..4: string | null }`, RaceTime user ids) so a
  swap is atomic. `null` is allowed in the draft; unknown participants and
  duplicates are rejected.
- Commentators are set as an ordered array of player ids (0–3). Draft players are
  reused as-is; players only in the player directory are imported via
  `persistentPlayerToDraftPlayer`. Participant/commentator overlap is allowed.
- `pruneUnreferencedDraftPlayers` is shared by participant and commentator
  editing.

Draft integrity (what may be saved) and draft readiness (what may be applied)
are separate: `validateDraftIntegrity` allows null slots, while
`validateDraftReadiness` requires all four slots, valid commentators, a category
selection and resolvable identities. `computeDraftBroadcastState` combines
readiness with snapshot state, so a draft with an empty slot is never `ready`.

### Broadcast apply

`broadcast.apply { expectedDraftRevision }` (handled in `broadcast-messages.ts`,
workflow in `broadcast-apply-service.ts`) promotes a READY draft into the active
broadcast state (`active-config`, `active-speedrun-snapshot`, and the `active`
RaceTime session).

- The draft and its snapshot are frozen (independent `structuredClone`) at apply
  start, so editing the draft while the active RaceTime session loads neither
  aborts nor alters the apply.
- Draft readiness and snapshot compatibility (state `ready`, matching revision
  and `LeaderboardKey`) are re-validated on the frozen copies. Speedrun.com is
  **not** re-fetched; refresh the snapshot first if needed.
- `buildActiveConfig` / `buildActiveSpeedrunSnapshot` are pure; account link
  `source` is dropped, `unresolved` is rejected, only referenced players are
  included, and participant/slot/commentator order is preserved. `source` /
  `savedMappingState` are not carried into the active category selection.
- The active revision is independent from the draft revision and derived from
  `max(active-config, active-snapshot, status) + 1`. `active-config.revision`
  and `active-speedrun-snapshot.activeRevision` always match.
- Applies are serialized (`apply_in_progress`); a failure keeps the previous
  active state and never clears it. After a successful apply the draft broadcast
  status is recomputed from the _current_ draft (which may have changed during
  the apply).

TypeScript domain types under `src/replicants/value-types.ts` are the single
source of truth for the Replicants. `npm run schema:generate` writes one
self-contained draft-07 schema per Replicant into `schemas/`; `npm run
schema:check` fails if the committed schemas drift from the types.

### Commands

```sh
npm run build           # compile the extension to dist/
npm run typecheck       # tsc --noEmit
npm run lint            # oxlint
npm run test            # vitest
npm run schema:generate # regenerate schemas/*.json
npm run schema:check    # verify schemas are up to date
npm run verify          # typecheck + lint + schema:check + test
```

### Invariants

- Only the draft representation may contain `unresolved` account links.
- The active representation is a complete, broadcast-ready state.
- Race screen slots reference RaceTime.gg user ids; commentators reference
  player ids. The two are never conflated.
- The current category selection is separate from persisted category mappings.
- Graphics view models contain no raw external API responses and do no
  identity resolution themselves.
- Draft and active Speedrun.com snapshots are stored separately.
