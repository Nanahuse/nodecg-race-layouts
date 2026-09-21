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
