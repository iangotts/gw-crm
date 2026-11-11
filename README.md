# GW-CRM

A custom multi-tenant CRM for the bands. One tenant per band: Jane Blonde and the Goldfingers, and ROCKSOLID. It is standalone. The old Bubble app (GW-GIG) keeps songs, setlists and the website. Gigs and contacts live only here.

The full plan, decisions and import rules are in the "GW-CRM: Gap Review and Build Plan" doc.

## Status

Phases 1 to 9 are built: the schema, backend, screens, UTM links, subscribe and unsubscribe, one-to-one email, the Google Calendar link, money and the GW-GIG import. Phase 10, deploying to Railway, has started. The current status is in [docs/designs/build-plan.md](docs/designs/build-plan.md).

## Backend

Node 20 or later, TypeScript, Fastify, `pg`, `zod`. Copy `.env.example` to `.env` and set `DATABASE_URL`.

```
npm install
npm run db:migrate && npm run db:seed
GWCRM_PASSWORD='at least 12 characters' npm run create-user -- --email you@example.com \
    --name "You" --membership janeblonde:admin --membership rocksolid:admin
npm run dev            # http://localhost:3000
npm test               # API tests, need DATABASE_URL
npm run typecheck
```

| Endpoint | What it does |
|---|---|
| `POST /api/login` | Email and password. Sets an HttpOnly, SameSite=Lax session cookie. Goes straight into the band if the user has only one. Limited to 10 tries a minute per address. |
| `POST /api/logout` | Ends the session. |
| `GET /api/me` | The user, their bands and roles, and the band they are working in. |
| `POST /api/session/tenant` | Choose which band to work in. Refused unless the user is a member. |
| `GET /api/contacts`, `POST /api/contacts` | Tenant-scoped list (with search) and create. The first working example of the pattern every later endpoint follows. |

How a request is handled:
- The session cookie is looked up in the `session` table, which stores only a hash of the token.
- The user's role in the chosen band is read from the database on every request, so removing a member or changing a role takes effect on their next request.
- Tenant data is only touched through `withTenant`, which runs `SET LOCAL ROLE crm_app` and sets the tenant and role for that transaction. The tenant always comes from the session, never from the request body.
- Changing requests from a browser with an unknown `Origin` header are refused.
- Wrong password, unknown email and disabled user all return the same answer in the same time.

Not done yet: password reset by email, inviting users from the screen (use `create-user` for now), and a per-account login lockout.

## Subscribe and unsubscribe (phase 5)

- Public pages, no login: `/subscribe/<band slug>` and `/unsubscribe/<token>`. The unsubscribe link is signed per contact and never expires. The export puts one in every row.
- Set `FORM_SECRET` (required in production, keep it stable or old unsubscribe links stop working) and `PUBLIC_URL` (the address people see). The public address must also be in `ALLOWED_ORIGINS`.
- Sign-up is single opt-in with a consent tickbox, a hidden trap field, a minimum fill time and rate limits. A form never re-subscribes someone who unsubscribed, bounced or is suppressed.
- Export: Contacts, then Email list, then Download CSV. Admins and members only. Only people with a `subscribed` record are included.

## One-to-one email (phase 6)

- Admins set who mail comes from and where replies go (Templates, then Email settings). Contacts and gigs get a Send email button. A person presses Send every time, and the message is saved in the activity log exactly as it went out, with the provider's message id.
- Set `SENDGRID_API_KEY` (and optionally `EMAIL_DAILY_CAP`). Without a key, local work keeps mail in memory and production refuses to send. The From address must be verified in SendGrid or messages are refused.
- Sent emails cannot be edited. Bounced and blocked addresses are refused, and an unsubscribed person needs an explicit confirm. Open and click tracking are turned off so tagged links stay as written.

## Google Calendar link (phase 7)

- Each person connects their own Google Calendar (the Calendar button in the header) and chooses which calendar each band may check. The band sees only the times someone is busy, never event names.
- An admin chooses where confirmed gigs go. A gig that is Confirmed (and not postponed) or Played gets an event with its place and times. The event moves when the gig changes and is removed when it is lost, postponed, archived or loses its date. Fees and notes are never put in the event.
- Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `CALENDAR_KEY` (encrypts the stored sign-ins; required in production). Register `<PUBLIC_URL>/api/calendar/callback` as the redirect address in Google Cloud. Leave them blank and the calendar link is simply off.
- Google keeps refresh tokens for an app in "Testing" status for only 7 days. Publish the app (it can stay unverified for a small group) so sign-ins last.
- A calendar problem never blocks saving a gig. It shows on the gig with a Try again button.

## Money (phase 8)

- Each gig has a Money section: the quoted fee, a deposit and balance plan, payments with a due date, and who paid when and how. A person marks each payment paid; nothing is guessed from a bank.
- All sums are done in the database in exact decimal, never in the browser or in floating point. "Plan deposit and balance" rounds the deposit once and makes the balance the remainder, so the two always add up to the fee. Status is Unpaid, Part paid, Paid or Overpaid, and a note shows when planned payments do not match the fee.
- A received payment cannot be removed; mark it not paid first (this is logged on the gig). Marking paid or not paid is logged as a note.
- Follow-ups shows Payments: unpaid payments with a due date, and played gigs that still owe money. Confirmed and Played cards on the pipeline show a payment chip.
- Marking a gig Played adds a to-do two days out to ask the contact for a testimonial, once per gig.
- There is no ledger or accounting: no invoices, tax or bank links.

## Importing from GW-GIG (phase 9)

The rules Ian confirmed on 5 Nov 2026 are in the plan doc and in `import_mapping` (see the seed). The tool follows them:

- Only Jane Blonde and ROCKSOLID come across. Jane Blonde gigs dated on or after 5 Nov 2024, with their notes, actions, crew and people. Fans who were deleted or unsubscribed are left behind, fans with the same email become one contact, and the fans flagged RockSolid are also copied into ROCKSOLID as contacts only.
- Fee-Quote that is a plain number goes to the fee, anything else to the fee note as typed. A numeric Fee-Paid becomes one payment dated on the gig (or today for a future gig) and is listed in the flags for a hand check. Blank Fee-Paid is not read as unpaid or paid, but a played gig with a fee and no payment shows under Owed on Follow-ups.
- Logins come from the band members. They have no password: set one with `npm run create-user`.
- The exports do not say which time zone their times are in, so America/Los_Angeles is assumed.

```bash
# 1. Read the files and write the reports. Nothing is written to the database.
npm run import -- --dir /path/to/exports --dry-run
# 2. Load. It names the database it will write to and refuses without --yes. Safe to run again:
#    anything already loaded is left alone and the second run adds nothing.
npm run import -- --dir /path/to/exports --yes
```

Use `--out` to choose where the reports go (default `import-report/`, ignored by git because it holds personal data) and `--gigs-from` to change the cut-off date. The reports are `report.md` (counts and what was left behind), `flags.csv` (rows to look at) and `spot-check.md` (20 gigs and 20 contacts, GW-GIG on the left and GW-CRM on the right). The command also compares its counts with the plan and prints DIFF for any that differ.

Rehearse into a scratch database first (`createdb`, `scripts/db.sh migrate`, `scripts/db.sh seed`), run it twice, then check the spot-check by hand before running against production.

## Deploying to Railway (phase 10)

One Railway project holds two things: a PostgreSQL database and one service built from this repo. The `Dockerfile` builds the API and the web screens into one container. On every start it applies any new migrations (`dist/cli/migrate.js`, which needs no psql) and then starts the server. `railway.json` sets the health check to `/api/health`.

Variables on the service:

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | Reference the Postgres service: `${{Postgres.DATABASE_URL}}` |
| `NODE_ENV` | `production` |
| `FORM_SECRET` | `openssl rand -hex 32`. Required. Keep it: changing it breaks every unsubscribe link already sent |
| `PUBLIC_URL` | The address people use, for example `https://crm.example.com` |
| `ALLOWED_ORIGINS` | The same address |
| `SENDGRID_API_KEY`, `EMAIL_PROVIDER` | When you have a SendGrid key. Without one, production refuses to send |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `CALENDAR_KEY` | When Google is set up. `CALENDAR_KEY` is required once the Google keys are set |

`COOKIE_SECURE` is true by default in production. After the first deploy, load the two bands once with `node dist/cli/migrate.js --seed` (Railway shell, or locally with the public database address). Logins and the import (`npm run create-user`, `npm run import`) run from a computer with this repo, pointed at the database's public address from Railway.

## Database

Postgres 15 or later (the schema uses `ON DELETE SET NULL (column)`). Needs `psql` and a `DATABASE_URL` for a login that owns the database. On Railway the default login is a superuser, which is what the import and the tests need.

```
export DATABASE_URL=postgres://user:pass@host:5432/gigworks_crm
scripts/db.sh migrate    # apply migrations in db/migrations
scripts/db.sh seed       # the two tenants and the import rules
scripts/db.sh test       # tenant isolation tests (roll back, leave nothing behind)
```

### Tables

| Area | Tables |
|---|---|
| Identity | `app_user` (logins), `tenant` (one per band), `membership` (user in tenant, role admin / member / read_only) |
| People | `contact` (the prospects), `contact_role` (role on a gig or at a venue, or band-member status), `subscription` (marketing consent), `venue` (reference list) |
| Gigs | `gig` (with the lead block), `gig_member` (who plays, confirmed or not), `payment` (deposit and balance only) |
| Activity | `activity` (call, voicemail, text, email, note, task) |
| Links and email | `link_target`, `outbound_link` (UTM), `link_click`, `template` |
| Import | `import_mapping` (band to tenant, status to stage), `import_id_map` (old id to new id) |

Gig stages: new, evaluating, in_conversation, confirmed, played, lost. `postponed` is a flag on confirmed.

### How tenant isolation works

Every tenant table has a `tenant_id` and a row-level security policy. Foreign keys are composite `(tenant_id, id)`, so a gig cannot point at another band's venue or contact even by mistake.

The app must run each request in a transaction like this:

```sql
BEGIN;
SET LOCAL ROLE crm_app;
SELECT set_config('app.user_id',    '<user uuid>',             true);
SELECT set_config('app.tenant_ids', '<tenant uuid>',           true);  -- one id normally
SELECT set_config('app.role',       'admin|member|read_only',  true);  -- from membership
-- queries here
COMMIT;
```

Rules:
- `SET LOCAL ROLE crm_app` is required. Superusers and table owners with BYPASSRLS skip row-level security.
- The backend must check the user's membership before it sets `app.tenant_ids` and `app.role`. The database trusts those values once they are set.
- With no tenant set, queries return nothing. They never return everything.
- `read_only` can read but not write. Only `admin` can change memberships.
- Two ids in `app.tenant_ids` give the combined view for people who are admin in both bands (a later phase).
- Login runs before a tenant is chosen. Use `SELECT * FROM auth_lookup(email)`, which returns one user row and nothing else. After the password check, set `app.user_id` and read that user's memberships.
- The app role has no access to `import_mapping` or `import_id_map`, and cannot read `password_hash`.

## Layout

```
db/migrations/   numbered SQL, applied in order and recorded in schema_migrations
db/seeds/        tenants and import rules
db/tests/        tenant isolation tests (SQL)
scripts/db.sh    migrate, seed, test, status
src/             the API: app.ts, auth.ts, db.ts, sessions.ts, routes/, cli/
test/            API tests (vitest)
```

Bubble CSV exports contain personal data. They are ignored by git and must stay out of the repo.

## Web app (phase 3)

The screens live in `web/` (React, Vite, TypeScript): the gig pipeline, contacts with an activity log (call, voicemail, text, email, note, to-do), follow-ups and replies owed, templates, and links (a builder that tags a website address with UTM parameters for one contact or gig; no contact identifier goes in the address). The page is chosen by the address, for example `#/contacts`. Venues have no screen yet; they can still be picked and added from a gig.

```bash
# one terminal: the API on :3000
npm run dev
# another terminal: the web app on :5173, which proxies /api to :3000
cd web && npm install && npm run dev
```

For production, run `cd web && npm run build`, then start the API. It serves `web/dist` and falls back to `index.html` for every page that is not under `/api`.

Checks: `npm test` (backend, needs `DATABASE_URL`) and `cd web && npm test` (screen logic).

## Local Interface & Invariants

- `vitest.config.ts`: backend test config. Collects `test/**/*.test.ts` only, runs files one at a time (`fileParallelism: false`) because the tests share one database, with a 20 s timeout.
- `tsconfig.build.json`: compiles `src/` to `dist/` (`npm run build`). `dist/server.js` and `dist/cli/migrate.js` are what the container runs.
- `Dockerfile`: two-stage `node:22-slim` build of the API and `web/dist` into one image. Runs as `node`, exposes 3000, and on every start runs `node dist/cli/migrate.js` before `node dist/server.js`.
- `railway.json`: Dockerfile builder, health check `/api/health`, restart on failure (5 retries).
- `.env.example`: the documented environment variables (`DATABASE_URL`, `PORT`, `ALLOWED_ORIGINS`, `COOKIE_SECURE`, `SESSION_DAYS`, `SCRYPT_LOG_N`, `FORM_SECRET`, `PUBLIC_URL`, `EMAIL_PROVIDER`, `SENDGRID_API_KEY`, `EMAIL_DAILY_CAP`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `CALENDAR_KEY`).

## Subdirectories & System Boundaries

- db: [./db/README.md](./db/README.md) - PostgreSQL schema (migrations `0001_foundation` to `0012_money`) and seed. Defines the `crm_app` role, row-level security on every tenant table, the `SECURITY DEFINER` login and public-form functions, and the `gig_money` view.
  - [./db/migrations/README.md](./db/migrations/README.md), [./db/seeds/README.md](./db/seeds/README.md)
- scripts: [./scripts/README.md](./scripts/README.md) - `db.sh` (`migrate`, `seed`, `test`, `status`), a psql wrapper driven by `DATABASE_URL`.
- src: [./src/README.md](./src/README.md) - the Fastify API: config, RLS-aware database helpers (`withAnonymous`, `withUser`, `withTenant`, `withSystem`), sessions, passwords, tokens, email providers, Google client and calendar sync, `buildApp` and the server entry point.
  - [./src/routes/README.md](./src/routes/README.md) - the `/api/*` handlers, one `register*Routes` per file.
  - [./src/import/README.md](./src/import/README.md) - the GW-GIG CSV import: pure `buildPlan`, then an idempotent `loadPlan`.
  - [./src/cli/README.md](./src/cli/README.md) - `migrate`, `create-user` and `import` commands, run with the owner login.
- web: [./web/README.md](./web/README.md) - separate Vite + React 18 package. Dev server on 5173 proxies `/api` to 3000.
  - [./web/src/README.md](./web/src/README.md) - the single-page app. Every server call goes through `api()` to same-origin `/api/*`.
- test (not documented, test-only): vitest API tests, need `DATABASE_URL`.
- db/tests (not documented, test-only): `tenant_isolation.sql`, run by `scripts/db.sh test`.

## Global Invariants

- Tenant data is only reached through `withTenant` (`src/db.ts`), which runs `SET LOCAL ROLE crm_app` and sets `app.user_id`, `app.tenant_ids` and `app.role` for one transaction. The tenant comes from the session, never the request body.
- With no tenant set, `visible_tenants()` is empty and queries return nothing (`db/migrations/0001_foundation.sql`). Composite `(tenant_id, id)` foreign keys stop cross-tenant links.
- `withSystem` (owner connection, bypasses RLS) is for sessions, migrations, the seed and the import only (`src/cli`, `src/import/load.ts`).
- The role is re-read from `membership` on every request (`src/auth.ts:authenticate`). `read_only` cannot write; admin-only settings are checked in the routes and in RLS.
- Money sums are done in the database in exact decimal (`gig_money` view). The browser only formats and pre-checks amounts (`web/src/money.ts:validAmount` mirrors the server rule).
- Migrations are append-only and applied in filename order, by `scripts/db.sh migrate` or `src/cli/migrate.ts` (the container path, which needs no psql).
- Bubble exports and import reports hold personal data and stay out of git (`.gitignore`: `exports/`, `*.csv`, `import-report/`).

## Global Side Effects

- PostgreSQL at `DATABASE_URL`: all application state, sessions and import id maps.
- SendGrid v3 mail send (`src/email.ts:sendGridProvider`) when `SENDGRID_API_KEY` is set. Without a key, local work keeps mail in memory and production refuses to send.
- Google OAuth and Calendar v3 (`src/google.ts`, `src/calendar.ts`) when the Google keys are set. Stored refresh tokens are encrypted with `CALENDAR_KEY`.
- The server listens on `0.0.0.0:PORT`, serves `web/dist` when present, and runs an hourly session purge.
- The import writes `report.md`, `spot-check.md`, `flags.csv` and `load.json` to `--out` (default `import-report/`).

## System Verification

- Run: `npm test` (backend vitest, needs `DATABASE_URL`)
- Run: `npm run db:test` (SQL tenant isolation tests, needs `DATABASE_URL`)
- Run: `npm --prefix web install && npm --prefix web test` (screen logic)
- Run: `npm run typecheck`
