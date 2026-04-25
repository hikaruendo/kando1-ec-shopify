# P0-1 SQLite Persistence Notes

Date: 2026-04-25
Branch: `codex/p0-1-sqlite-persistence`
PR: `#4`

## Summary

P0-1 moves job history, rollback snapshots, and shop sessions out of in-memory Maps and into SQLite on a Fly Volume. The implementation uses `better-sqlite3` for local database access and `knex` for migrations, with WAL mode enabled at connection setup.

This change addresses three review findings:

- `shop/redact` now deletes persisted app data for the affected shop.
- Compliance webhook payloads are no longer logged verbatim.
- `npm test` now exists and covers the highest-risk persistence and webhook paths.

## Persistence Design

The selected store is SQLite + Fly Volume.

Reasons:

- It is the smallest production-ready persistence layer for the current single-machine Fly deployment.
- It keeps job rollback state local and ACID-backed.
- It leaves room to migrate later because SQL is isolated behind repository modules.

Current persisted tables:

- `jobs`
- `job_snapshots`
- `shop_sessions`

Still in memory:

- `oauthStates`, because they expire quickly and can be retried.

## Main Code Changes

- `src/app.js` now owns Express app construction and makes integration tests possible.
- `src/server.js` now only starts the app.
- `src/db/index.js` initializes SQLite, runs migrations, and enables `journal_mode=WAL`, `synchronous=NORMAL`, and `foreign_keys=ON`.
- `src/db/jobs-repo.js` handles all job and snapshot persistence.
- `src/db/sessions-repo.js` handles shop session persistence.
- `src/store.js` no longer exports `jobs` or `shopSessions`.
- `fly.toml` now mounts `/data`, sets `SQLITE_PATH=/data/kando1.db`, and raises memory to `1024 MB`.
- `.env.example` now includes `SQLITE_PATH=./data/kando1.db`.

## Webhook Behavior

`/webhooks` still verifies Shopify HMAC before handling any request.

Handled cleanup:

- `app/uninstalled`: deletes `jobs`, `job_snapshots`, and `shop_sessions` for the shop.
- `shop/redact`: deletes `jobs`, `job_snapshots`, and `shop_sessions` for the shop.
- `customers/data_request`: no-op `200`, because the app does not store customer data.
- `customers/redact`: no-op `200`, because the app does not store customer data.

Logging now records only `topic` and `shop`. Raw payload bodies are not logged.

## Commands

Install dependencies:

```bash
npm install
```

Run migrations:

```bash
npm run db:migrate
```

Run tests:

```bash
npm test
```

Create the Fly Volume before first deployment:

```bash
fly volumes create kando1_data --size 3 --region nrt
```

Deploy:

```bash
fly deploy
```

## Validation

The implementation was validated with:

```bash
npm run db:migrate
npm test
```

Test coverage added:

- Jobs repository CRUD and shop-scoped deletion.
- Sessions repository upsert and deletion.
- `apply -> restart simulation -> get job -> undo`.
- Shop isolation for job lookup.
- Webhook invalid HMAC returns `401`.
- `app/uninstalled` and `shop/redact` clean up persisted shop data.
- Compliance webhook logs do not include raw customer payload data.

## Deployment Notes

The first production deployment needs a Fly Volume named `kando1_data` in `nrt`. The app expects the database at `/data/kando1.db` in production.

If the volume already exists, do not recreate it. Run `fly volumes list` first when unsure.

## Next Action

After merging PR `#4`, deploy with the Fly Volume in place and smoke test:

- `GET /health`
- `POST /api/apply`
- `GET /api/jobs/:jobId`
- `POST /api/jobs/:jobId/undo`
- invalid webhook HMAC returns `401`

P0-2 follows the ADR adjustment: send broad analytics to GA4 and persist only billing-critical events in SQLite.

## P0-2 Analytics Events Update

Date: 2026-04-25
Branch: `codex/p0-2-analytics-events`
PR: `#5`

P0-2 implements analytics with the ADR adjustment:

- GA4 is the broad analytics destination.
- SQLite stores only billing/PQL-critical events, not every product interaction.
- Event recording is best-effort and must not break the primary API flow.

New persisted table:

- `events`

SQLite-persisted critical events:

- `apply_succeeded`
- `undo_succeeded`
- `paywall_shown`
- `paywall_clicked_upgrade`

GA4-tracked events:

- `app_installed`
- `first_app_load`
- `simulate_run`
- `apply_started`
- `apply_succeeded`
- `apply_failed`
- `undo_succeeded`
- `app_uninstalled`
- `paywall_shown`
- `paywall_clicked_upgrade`

Main code changes:

- `src/analytics.js` adds the analytics layer.
- `src/db/events-repo.js` adds critical-event persistence.
- `src/db/migrations/202604250001_create_critical_events.js` adds the `events` table.
- `src/app.js` records events for install, app load, simulate, apply, undo, uninstall, and paywall event ingestion.
- `/api/events` accepts only frontend-originated paywall events for now.
- `.env.example` includes optional GA4 environment variables.

Validation:

```bash
npm test
```

Result:

```text
tests 7
pass 7
fail 0
```

## GA4 Setup

GA4 is optional for runtime safety. If these variables are blank, the app still works and critical events still persist to SQLite.

However, GA4 should be configured before pricing decisions, because SQLite intentionally does not store full analytics volume.

Required environment variables:

```bash
GA4_MEASUREMENT_ID=G-XXXXXXXXXX
GA4_API_SECRET=...
```

Local `.env`:

```bash
GA4_MEASUREMENT_ID=G-XXXXXXXXXX
GA4_API_SECRET=...
```

Fly secrets:

```bash
fly secrets set GA4_MEASUREMENT_ID=G-XXXXXXXXXX GA4_API_SECRET=...
```

GA4 secret source:

- GA4 Admin
- Data streams
- Select the web stream
- Measurement Protocol API secrets
- Create or copy an API secret

Operational note:

- Do not put GA4 secrets in git.
- It is acceptable to merge/deploy without GA4 secrets, but analytics coverage will be partial until they are set.
- SQLite remains the source for billing-critical event checks such as `apply_succeeded` active-shop queries.
