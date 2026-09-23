# Operator Guide

This guide covers initial setup and the normal race-day workflow for the
`nodecg-race-layouts` bundle.

## Before Race Day

### Install and configure the bundle

The bundle runs inside a separately installed NodeCG 2.x host. From the bundle
directory, install dependencies and build the extension, dashboards, and
graphics:

```sh
npm ci
npm run build
```

Copy `config.example.json` to the host's `cfg/nodecg-race-layouts.json`. Set a
non-empty event name and the Google Spreadsheet ID. Sheet names can be
customized; otherwise the defaults are `Players`, `CategoryMappings`,
`CategoryPresentation`, and `RaceHistory`.

Provide Google Application Default Credentials to the NodeCG process (commonly
through `GOOGLE_APPLICATION_CREDENTIALS`) and share the spreadsheet with that
credential identity. Do not put the credentials file or secret contents in the
bundle config or repository. Restart NodeCG after changing process environment
or bundle configuration.

### Spreadsheet setup

Create one header row in each configured sheet. The integration finds columns
by header name, not by their position. Keep the spelling and underscores exact;
columns may be reordered. Do not remove required headers. Empty sheets should
still have their complete header row.

**Players**

```text
player_id, manual_display_name, racetime_state, racetime_user_id, racetime_name, racetime_twitch_login, speedruncom_state, speedruncom_user_id, speedruncom_name, speedruncom_twitch_login, twitch_state, twitch_user_id, twitch_login, updated_at
```

**CategoryMappings**

```text
racetime_category_slug, racetime_category_name, racetime_goal, src_game_id, src_game_name, src_category_id, src_category_name, src_level_id, src_variables, src_platform_id, src_region_id, src_emulator, src_timing_method, updated_at
```

**CategoryPresentation**

```text
racetime_category_slug, racetime_goal, display_title, display_subtitle, rule_heading, rule_text, leaderboard_heading, updated_at
```

**RaceHistory**

```text
racetime_url, racetime_race_id, category_slug, category_name, goal, participants_json, race_screen_slots_json, commentators_json, active_revision, first_applied_at, last_applied_at
```

The bundle loads the Players directory at startup. Category mappings and
presentation provide saved presets; RaceHistory is written after a successful
Broadcast Apply. JSON fields such as `src_variables`, `participants_json`,
`race_screen_slots_json`, and `commentators_json` are managed by the bundle;
avoid hand-editing their serialized values unless you know the expected shape.

### Verify integrations and dashboards

Start NodeCG and open its dashboard. Check the Race Control status bar for
RaceTime, Speedrun.com, Spreadsheet, and Broadcast status. Open Player Mapping
and confirm the directory is loaded; use **Reload from Spreadsheet** after
correcting a sheet or access problem.

Player Mapping is the reusable identity directory. Race participants refer to
those player records, while RaceTime entrants retain their own RaceTime user
IDs. Player records currently used by a Draft, Active broadcast, or pending
persistence work may be protected from management changes.

## Race-Day Workflow

### 1. Load the race into Draft

In Race Control → Draft Race, paste a RaceTime.gg race URL and select **Load
Race**. This loads the race into the editable Draft and watches the RaceTime
session; it does not put the race on air. Entrants are matched to Players by
RaceTime user ID first, then by an unambiguous exact Twitch-login match. It does
not guess based on similar names. Review every participant and resolve any
unmatched or ambiguous identity.

If RaceTime reports structural changes after the load, the broadcast status
shows that reconciliation is required. Review the updated race and select
**Reconcile Draft** to bring structural changes into Draft while preserving
operator edits where possible. Result-only changes such as finish time/place
do not require reconciliation.

### 2. Review participants and identity mappings

For each participant, verify the associated Player and resolved display name.
Correct Player Mapping or the participant's Player association when needed.
Resolve Speedrun.com and Twitch identities if they are needed for leaderboard
or on-screen information. Identity conflicts and unresolved participants can
prevent the Draft from becoming ready. Changes in Player Mapping may be blocked
while a Player is in use; finish the relevant broadcast or persistence work
before trying again.

### 3. Select the category and presentation

In **Category / Speedrun.com**, search for the game and select the category.
Choose a level, variables, platform, region, emulator setting, and timing
method when applicable. Required Speedrun.com variables must be selected.
Apply the selection to the Draft. A saved category mapping can be registered,
updated, or restored from this section; presentation fields such as display
title, rules, and leaderboard heading are managed separately.

Changing leaderboard conditions invalidates the current snapshot. Display-name,
rule/presentation, slot, and commentator changes do not alter the leaderboard
query conditions.

### 4. Set Race Screen slots and commentators

In **Race Screen**, P1–P4 correspond to upper-left, upper-right, lower-left,
and lower-right. Select a race participant or **Unassigned**, then select
**Save Slots**. A participant can occupy only one slot. Slots use RaceTime user
IDs internally. Empty slots are allowed and do not by themselves prevent Apply;
the corresponding HUD position is hidden in the Race graphic. Unknown or
duplicate slot assignments are invalid.

Choose zero to three commentators in order and select **Save Commentators**.
Commentators come from the Player directory and Draft Players; they do not have
to be race participants. A commentator may also be a participant, but the same
Player cannot occupy multiple commentator positions.

### 5. Refresh and review the Speedrun snapshot

Select **Refresh Snapshot** after the category and participant identities are
ready. The snapshot includes the World Record, leaderboard (top 20 places,
including ties), and participant PB/rank data where available. Wait for its
state to become `ready`. A failed request or unavailable PB should be reviewed
in the dashboard; do not assume an old snapshot matches a changed category.

### 6. Apply Draft to Broadcast

Review the Broadcast Apply summary and status. Apply requires a ready Draft,
valid race/category/participant identities, and a ready snapshot matching the
current Draft revision and leaderboard conditions. All four slots do **not**
need to be assigned. Select **Apply Draft to Broadcast**.

The bundle loads the race's active RaceTime session before committing the new
Active configuration and snapshot. If that load fails, the previous Active
state remains in place. On success, confirm the Active revision and the
Broadcast status before taking the graphics on air. Further Draft edits are not
on air until another successful Apply.

### 7. Monitor post-apply persistence

Active broadcast commit and spreadsheet persistence are separate. A successful
Apply can be on air even if the Players or RaceHistory write is still pending
or has failed. In **Persistence**, review the state, queue length, item attempts,
and last error. Correct the spreadsheet or access problem, then use **Retry
Persistence** when available. Queued work is FIFO and resumes when the
extension starts; a failed write does not undo the Active broadcast.

## OBS Graphics

The bundle registers four 1920×1080 graphics in NodeCG:

| NodeCG graphics page | Intended use                                                       |
| -------------------- | ------------------------------------------------------------------ |
| `race.html`          | Event/category header, four Player HUD positions, WR, commentators |
| `participants.html`  | Participant list                                                   |
| `leaderboard.html`   | Rank, name, optional secondary name, and time only                 |
| `result.html`        | Race result presentation                                           |

Add the corresponding bundle graphics as browser sources through the NodeCG
Graphics UI (or use the host's graphics URL pattern, typically
`http://localhost:9090/bundles/nodecg-race-layouts/graphics/<page>`). Graphics
are transparent and use the active broadcast projections. Leaderboard/result
titles, backgrounds, event decoration, timer, game capture, and final scene
layout are composed in OBS. Verify the source dimensions and crop/position in
OBS before going live.

## Troubleshooting

| Symptom                                | Checks                                                                                                                                                                                                                            |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dashboard or graphics are blank        | Confirm the bundle is in NodeCG's `bundles` directory with its `package.json`; run `npm ci` and `npm run build` in the bundle directory; restart NodeCG and check its logs.                                                       |
| Spreadsheet status is `error`          | Check the spreadsheet ID, configured tab names, exact header row, Google API access, and that ADC is available to the NodeCG process. Reload from Spreadsheet after fixing the cause.                                             |
| Players sheet fails to load            | Ensure the Players header contains every required column listed above and that each linked account row has valid state/identity fields. An empty sheet still needs the header row.                                                |
| Apply is unavailable                   | Read Broadcast status and snapshot state; check category selection, mandatory variables, participant identities, race reconciliation, snapshot revision/conditions, and validation messages. Empty Race Screen slots are allowed. |
| Speedrun snapshot fails                | Check Speedrun.com status, selected game/category/filters, mandatory variables, and whether the snapshot is for the current Draft. Refresh after changing leaderboard conditions.                                                 |
| Persistence queue is pending or failed | Read the queue item's last error and attempt count, fix spreadsheet/access issues, then retry. Active broadcast is not rolled back by a persistence error.                                                                        |
| Graphics show no race data             | Apply a valid Draft, use the correct graphics page, and confirm Active projections are populated. Check that `event.name` is configured for event-dependent graphics.                                                             |

When reporting a failure, include the NodeCG log lines around the operation,
the relevant dashboard status/message, and whether Active state changed. Avoid
sharing credential files, access tokens, or private keys.
