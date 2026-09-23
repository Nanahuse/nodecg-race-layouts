# nodecg-race-layouts

NodeCG bundle for operating RTA races. It provides a Race Control dashboard,
Player Mapping dashboard, race-state and Speedrun.com integrations, spreadsheet
persistence, and OBS-ready graphics.

For race-day procedures and spreadsheet templates, see the
[Operator Guide](docs/operator-guide.md).

## Overview

The bundle separates editable race preparation (Draft) from the state currently
shown on air (Active). Operators load a RaceTime.gg race, resolve its
participants and category, refresh the Speedrun.com snapshot, then apply a
ready Draft to Broadcast. Dashboard actions use NodeCG messages; the dashboard
does not write Replicants directly.

Key areas of the repository:

```text
src/domain/       Race, player, validation, and projection domain logic
src/extension/    NodeCG services, message handlers, and external integrations
src/replicants/   Replicant names, value types, defaults, and declarations
src/protocol/     Shared message contracts
ui/dashboard/     Race Control and Player Mapping panels
ui/graphics/      Race, participants, leaderboard, and result graphics
schemas/          Generated Replicant JSON Schemas
test/             Unit, integration-flow, and schema tests
```

## Requirements

- Node.js 24 or newer (`.node-version` / `.nvmrc`)
- npm
- NodeCG 2.x host (this repository is a bundle; it does not include the NodeCG
  server)
- A Google Spreadsheet and Google Application Default Credentials for
  spreadsheet-backed player/category/history features

## Quick Start

1. Install or prepare a NodeCG 2.x host separately.
2. Place or clone this repository as a bundle, for example:
   `nodecg/bundles/nodecg-race-layouts`.
3. From the bundle directory, install dependencies and build all bundle assets:

   ```sh
   npm ci
   npm run build
   ```

   `npm run build` produces the extension in `dist/`, the dashboard panels, and
   all four graphics pages. Generated build output is not committed.

4. Copy `config.example.json` to the NodeCG host's
   `cfg/nodecg-race-layouts.json`. Set the event values and your spreadsheet ID
   (and sheet names if they differ from the defaults).
5. Make Google ADC available to the process that starts NodeCG. For a service
   account key file, configure `GOOGLE_APPLICATION_CREDENTIALS` in that
   process's environment and grant the account access to the spreadsheet. Keep
   credentials out of the bundle config and repository.
6. Start NodeCG using the host's normal startup procedure, then open its
   dashboard. The Race Control and Player Mapping panels are registered by the
   bundle's `package.json`.

RaceTime.gg and Speedrun.com discovery use their public APIs. A spreadsheet
integration configuration or credential problem is reported in the dashboard
integration status; spreadsheet-dependent features may be unavailable while
the rest of the extension runs.

## Configuration

`config.example.json` is the starting point. The bundle config must include a
`spreadsheet.spreadsheetId`; sheet names are optional and default to
`Players`, `CategoryMappings`, `CategoryPresentation`, and `RaceHistory`.
Graphics also require a non-empty `event.name`. `shortName` and `logoUrl` are
optional.

```json
{
  "event": {
    "name": "RTA Race Event",
    "shortName": "RTA Race",
    "logoUrl": "/bundles/nodecg-race-layouts/assets/event-logo.png"
  },
  "spreadsheet": {
    "spreadsheetId": "your-spreadsheet-id",
    "playersSheet": "Players",
    "categoryMappingsSheet": "CategoryMappings",
    "categoryPresentationSheet": "CategoryPresentation",
    "raceHistorySheet": "RaceHistory"
  }
}
```

Never put Google credentials or private keys in this file. Spreadsheet access
uses ADC from the NodeCG process environment. Required sheet headers are
documented in the [Operator Guide](docs/operator-guide.md#spreadsheet-setup).

## Graphics

The bundle registers four transparent, 1920×1080 NodeCG graphics:

| Page                | Content                                                               |
| ------------------- | --------------------------------------------------------------------- |
| `race.html`         | Race header, four-position player HUD, World Record, and commentators |
| `participants.html` | Race participant list                                                 |
| `leaderboard.html`  | Leaderboard rows: rank, name, secondary name, and time                |
| `result.html`       | Race result presentation                                              |

Graphics consume projected page-data Replicants from the active broadcast.
They do not fetch RaceTime or Speedrun.com data themselves. Leaderboard and
result titles, backgrounds, game footage, timer, and event decoration can be
composed separately in OBS. See the Operator Guide for the NodeCG graphics URLs
and activation checklist.

## Architecture Overview

- **Dashboard** edits Draft through message APIs and shows integration,
  broadcast, and persistence status.
- **Extension/application services** validate workflows and own state changes.
- **Domain and Replicants** define Draft, Active, sessions, snapshots, and
  graphics projections.
- **Integrations** connect RaceTime.gg, Speedrun.com, and Google Sheets.
- **Graphics** render active-state projections; OBS handles the final scene
  composition.

Draft is not on air until Broadcast Apply succeeds. Apply captures the Draft
and snapshot as independent values at the start of the operation. The new
Active state is committed only after the active RaceTime session loads. The
subsequent spreadsheet persistence is a separate queued operation and does
not roll back a successful Active update.

## Development

Install dependencies with `npm ci`, then use:

```sh
npm run typecheck       # extension, dashboard, graphics, and tests
npm run lint            # oxlint
npm run schema:check    # verify committed Replicant schemas
npm run test            # Vitest suite
npm run build           # extension, dashboard, and graphics
npm run format:check    # Prettier check
npm run verify          # typecheck, lint, schema:check, and test
```

Run `npm run schema:generate` only when intentionally updating Replicant
schemas. The generated files in `schemas/` are checked in; do not edit them by
hand. The standalone NodeCG host is started separately from this repository.

## Operator Guide

See [docs/operator-guide.md](docs/operator-guide.md) for spreadsheet setup,
race-day operation, Draft/Active behavior, graphics setup, and troubleshooting.
