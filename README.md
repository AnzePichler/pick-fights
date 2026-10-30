PickFights is a UFC prediction app built with Next.js 16, React 19, TypeScript,
Tailwind CSS 4, NextAuth and PostgreSQL/Prisma. Users predict winners, methods and
rounds; event and all-time leaderboards use stored scores.

## Safe local sandbox

Run these commands from the unified `app/` checkout.
Requires Docker Desktop running and the project dependencies installed.

```bash
npm run local:setup
npm run local:dev
```

Open `http://127.0.0.1:3105/fantasy`. Demo-only login:

- Email: `demo@pickfights.local`
- Password: `local-fantasy-demo`

Setup creates a dedicated PostgreSQL container and volume, applies the checked-in
migrations only there, and seeds two fake users and six fictional fights. The
card includes favourites, underdogs, exactly `+100`, and missing odds. No live
data, credentials, or environment files are copied. The existing `.env` files
are left unchanged.

The wrapper fixes both database URLs to
`127.0.0.1:55439/pickfights_fantasy_local` with the dedicated `pickfights_local`
role, overriding any inherited database URLs. Before migrations, seeding, or
starting the local app, it verifies the local Docker socket, Compose container
identity, health, and loopback port mapping. The seed also verifies the database
name and role before writing. Do not bypass the wrapper with your normal
database credentials.

Both the app and database bind to loopback only. Database authentication is
passwordless **for this disposable local environment only**; never expose or
port-forward it. A separate random app auth key is kept in the gitignored
`.local-sandbox/` directory. Demo login credentials are deliberately public
fixtures, not production credentials.

Re-running `local:setup` preserves existing demo lineups and results and reopens
the demo event with a deadline one day ahead. To stop, press Ctrl+C in the local
dev terminal, then run:

```bash
npm run local:stop
```

The database volume is retained for next time. To **delete only this local
sandbox database**, stop the dev server, then run:

```bash
docker compose --env-file /dev/null -f compose.local.yaml down --volumes
```

Do not run that cleanup against another Compose file/project. Run
`npm run local:setup` again to create a fresh sandbox afterward.

### Simulate the saved demo lineup

After saving a lineup as the demo user, run these from this worktree:

```bash
npm run local:simulate -- lock
npm run local:simulate -- next
npm run local:simulate -- complete
```

`lock` closes entries without changing selections. Each `next` reveals the next
pending fight. `complete` reveals the remaining results and completes the event.
The fictional outcomes are based on the saved lineup: the first Finish selection
is deliberately given a decision win to demonstrate a missed slot condition.
When both sides of one fight are selected in different slots, only one can win;
the simulation chooses a single result, prioritising Captain and then slot order.
The page refreshes state/results every 30 seconds and when the window regains
focus; reload to see a stage immediately.

```bash
npm run local:simulate -- status
npm run local:simulate -- reopen
```

`reopen` restores backed-up pre-simulation results and opens editing for another
day without deleting your lineup. The backup is gitignored in `.local-sandbox/`.
These commands have the same Docker and database identity guards as local setup,
are hardcoded to the fictional demo event, and cannot target a live event.

## Fantasy and fight odds

Apply the checked-in `20261030160000_fantasy_and_fight_odds` migration using your
normal deployment process (`npx prisma migrate deploy`), then regenerate the
client (`npx prisma generate`). Test on staging first. These commands change the
configured database; they are not required to run the pure scoring checks.

Fantasy is available at `/fantasy`, alongside Picks. Each event has a fresh
five-fighter lineup:

| Slot | Required outcome | Points |
| --- | --- | --- |
| Captain | Win by any method | 100 |
| Finish (two slots) | Win by KO/TKO or submission | 50 each |
| Decision | Win by decision | 50 |
| Underdog | Eligible underdog wins by any method | 50 |

There are no base points: a Finish selection that wins by decision scores zero.
Five different fighters from five different fights are required; opponents cannot
occupy separate slots. Draws, no contests, cancelled/replaced
fights, and losses score zero. Unresolved results remain pending. Scores are
derived from stored fight results on page load, including manual corrections;
the locked page refreshes results every 30 seconds. Picks scoring is unchanged.

Users can replace their complete saved lineup until the event's existing
`lockAt` deadline while its status is `OPEN`. Saving replaces the five choices
atomically. The server checks event membership, unique fighters and fights, slot eligibility,
and the deadline inside the transaction. Unsaved changes are not entered at lock.
The `ufc-test` event is excluded from Fantasy. Previous saved lineups are linked
below the current lineup. Fantasy season rankings are not implemented yet.

### Importing odds

The existing fight-creation script reads consecutive fighter pairs from
`ufc_fighters.json`. Before creating fights, enrich each fighter's entry with its
American odds for **this fight**, as an integer or signed integer string:

```json
[
  { "name": "Fighter A", "odds": -150 },
  { "name": "Fighter B", "odds": "+125" }
]
```

The fighters must already exist. Run `node scripts/createFightsFromJson.mjs
<event-slug>` only against your intended import database. The scraper does not
currently fetch a verified odds feed; enter/enrich the `odds` field before import.
Do not infer odds from fighter statistics or rankings.

Odds and the derived underdog flags are stored on `Fight`, not `Fighter`:

- Greater than `+100`: eligible underdog.
- Exactly `+100`, negative odds, or missing odds: not eligible.
- Missing/null/empty odds remain null. Malformed, fractional, or out-of-range
  odds fail the import instead of being silently treated as favourites.
- The Underdog selector filters to eligible fighters on the active card, excluding
  fighters used in other slots. The server independently verifies eligibility.
- Database constraints keep each stored eligibility flag consistent with its odds.

The import script refuses closed/past-deadline events, refuses recreating fights
after fantasy entries exist, and refuses `--replace` after Picks submissions.
This keeps imported eligibility fixed once entries exist and avoids deleting
saved entries. Existing fights migrate with missing odds and ineligible flags;
do not use `--replace` to backfill an event with submissions. Such events need a
separate reviewed migration/correction rather than destructive recreation.

## Fantasy lineup interface

`/fantasy` uses the selected Fight Grid layout: a light, thin-line octagon with
five fighter positions in a 2–3 formation. Select an individual fighter by
clicking a position, then save the complete lineup before the event locks.
Portraits come from the event fighters; missing images use a neutral silhouette.
The interface uses real saved lineups and results, not illustrative demo scores.
The redesign and fantasy comparison routes have been removed.

## Local development

Run commands from this `app/` directory. Configure `.env` using `.env.example`,
with `DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET` and the existing invite settings.
Use the correct database for your environment; never commit secrets.

```sh
npm install
npm run db:migrate
npm run dev
```

## Upgrading an existing database

Back up the target database and apply the additive migration before running the
new application. It adds opt-in event synchronization, result provenance/history,
per-pick scoring fields and a separate binary avatar table. Existing events remain
disabled for sync, and existing settled results are protected as manual results.
Existing pending results remain eligible for automatic updates.

```sh
npm run db:migrate
npm run avatars:migrate
npm run scores:backfill
```

The last two commands are dry-runs. Review the counts, then deliberately apply:

```sh
npm run avatars:migrate -- --apply
npm run scores:backfill -- --apply
```

Avatar migration preserves valid existing pictures, replacing inline data URLs
with short, immutable `/api/avatars/{id}` URLs. Invalid/oversized pictures remain
unchanged for manual review. Migration logs contain counts, not profile data.
New uploads are restricted to JPEG/PNG/WebP, 256 KiB decoded, with a 400 KiB request
limit. Binary content is fetched separately rather than duplicated in page data.

Score backfill rebuilds event totals and per-pick points/rarity statistics in
event-locked transactions. Scope a run with `--event=event-slug`. The legacy
`node scripts/recalculateEventScores.mjs <event-slug> | --all` command delegates
to the same service and retains its write-by-default behavior.

## Automatic results: UFCalendar

Set these **server-only** environment variables in the deployed application:

- `UFCALENDAR_API_KEY`: key for the UFCalendar REST API.
- `CRON_SECRET`: a high-entropy secret shared with the scheduler.

No key is included in source and no external request is made while rendering
ordinary pages. The provider adapter calls the full-card event endpoint at
`https://api.ufcalendar.com/v1/events/{id}` and validates its response. ESPN is not
used as an automatic fallback: contradictory sources must not silently overwrite
results. Provider reference: <https://api.ufcalendar.com/docs>.

### Enable an event

1. Set the event's database `startsAt` to the first prelim in UTC and make sure
   `lockAt <= startsAt`. The sync never silently changes pick deadlines.
2. Sign in as an admin and open `/admin` for the active event.
3. Enter its UFCalendar event ID or slug, then select **Preview mapping**.
4. Review every local/provider bout and corner. Exact-name suggestions still
   require confirmation. Use **Swap provider corners** where local A is provider B.
   Additional or replaced bouts require correcting the local card/mapping first.
5. Confirm the mappings to enable sync. Canonical numeric IDs are stored so event
   renames do not change identity. Test events cannot use the live feed.

Use **Disable** to stop polling, **Sync now** to explicitly retry an enabled,
started event, and **Protect result / Release override** to control ownership of
individual results. Manual result edits protect changed fights, not the entire
card. Protecting a pending result deliberately prevents automatic settlement.
Existing settled manual results stay protected until explicitly released.

### Configure the scheduler

Configure an external scheduler to call this production endpoint **every six minutes**
using the UTC cron expression `*/6 * * * *`:

```text
GET or POST /api/cron/results
Authorization: Bearer <CRON_SECRET>
```

Each enabled event has a `nextSyncAt`, initially its `startsAt`. Healthy polls
schedule the next UTC six-minute boundary (minutes 00, 06, 12, and so on), not
six minutes after request execution. This prevents ordinary execution delay
from making the next cron invocation skip a poll. The first run may occur up to
six minutes after the database start, plus any scheduler delay. Manual syncs can
occur between cron slots; failures and review warnings retain their backoff,
and reconciliation still waits at least 12 hours.
It processes one due event per invocation to bound execution time; multiple
simultaneous enabled events can introduce additional scheduling delay. It does
not depend on visitors or an in-process timer.

Vercel Pro can use a `*/6 * * * *` native cron schedule for `/api/cron/results` with
`CRON_SECRET` set. Vercel Hobby's native cron does not support this frequency, so
use an external scheduler. No `vercel.json` cron is installed automatically.
See <https://vercel.com/docs/cron-jobs/usage-and-pricing>.

### Safety and completion

- Atomic claims, expiring leases and event-row locks fence concurrent jobs.
  Disabling/reconfiguring an event invalidates an in-flight job's lease token.
- Only changed results are scored. Results, audit history, per-pick statistics
  and event scores commit in one transaction; unchanged polls do not rebuild scores.
- Winner/method/round values must be valid. Draws, no contests and cancellations
  are supported. Unsupported outcomes such as disqualifications require manual
  input because the app does not have a separate disqualification scoring method.
- Manual overrides are never overwritten. Provider opponent changes and unmapped
  bouts are flagged for review, not guessed from names during live polling.
- Regular polling stops when the headliner/card is final **and** every local
  active bout is resolved. UFCalendar orders the headliner first; the last array
  item is not treated as the final chronological bout.
- One reconciliation is scheduled 12 hours later for corrections, then sync is
  disabled. Failures use exponential backoff, honor `Retry-After`, and pause after
  12 consecutive failed/problematic polls. Unfinished events pause automatically
  18 hours after their database start; an explicit **Sync now** can recover an
  enabled event outside that window. If paused/disabled, confirm the mapping to
  re-enable, then run **Sync now** deliberately.
- Check the admin panel's last-success timestamp and error. A cron HTTP 200 means
  dispatch completed; inspect each outcome (`synced`, `needs-review`, `failed`,
  `skipped`). Monitor non-success outcomes and enabled events with stale timestamps.
- Refreshing clients check lightweight shared result metadata once a minute while
  visible and refresh page data when the result version changes. Shared metadata
  is cached for 15 seconds; leaderboard queries for 30 seconds. Result writes
  immediately expire the shared caches. Initial page loads remain server-rendered.

## Performance and validation

The archive and pick histories load five events at a time. Leaderboards reuse
shared, tagged query caches with authentication outside the cached functions.
After score backfill, pick histories read stored per-pick statistics instead of
scanning community choices. Older unbackfilled events use page-scoped grouped
counts as a compatibility fallback.

```sh
npm run lint
npx tsc --noEmit
npm run build
```

Validate provider coverage/latency against a real event before enabling automatic
writes. Rehearse on a staging database, including corrections, missing bouts,
manual overrides and a scheduler interruption. Do not run live polling or data
migrations against production merely to test the integration.
