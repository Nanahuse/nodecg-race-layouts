# nodecg-race-layouts

NodeCG layouts for RTA race events.

## Requirements

- Node.js 24 or newer (see `.node-version` / `.nvmrc`).

## Foundation

The repository contains the domain/replicant/schema foundation plus the
**Player Directory** persistence layer. External services not yet implemented:
RaceTime.gg, Speedrun.com, the apply pipeline and the dashboard/graphics UI.

```
src/domain/       Domain types, display-name resolution, active validation
src/replicants/   Replicant names, value types, safe defaults and declaration
src/extension/    NodeCG extension entry point, application service and
                  spreadsheet integration
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
