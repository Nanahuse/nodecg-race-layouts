# nodecg-race-layouts

NodeCG layouts for RTA race events.

## Requirements

- Node.js 24 or newer (see `.node-version` / `.nvmrc`).

## Foundation

The repository currently contains the **foundation layer only**: domain types,
Replicant declarations, JSON Schemas, validation and tests. External service
integrations (RaceTime.gg, Speedrun.com, Google Spreadsheet), the apply
pipeline and the dashboard/graphics UI are intentionally not implemented yet.

```
src/domain/       Domain types, display-name resolution and active validation
src/replicants/   Replicant names, value types, safe defaults and declaration
src/extension/    NodeCG extension entry point
src/types/        Minimal structural typings for the NodeCG API we use
scripts/          JSON Schema generation from the TypeScript domain types
schemas/          Generated JSON Schemas (do not edit by hand)
test/             Unit and schema tests
```

TypeScript domain types under `src/replicants/value-types.ts` are the single
source of truth for the Replicants. `npm run schema:generate` writes one
self-contained draft-07 schema per Replicant into `schemas/`; `npm run
schema:check` fails if the committed schemas drift from the types.

### Commands

```sh
npm run build           # compile the extension to dist/
npm run typecheck       # tsc --noEmit
npm run lint            # eslint
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
