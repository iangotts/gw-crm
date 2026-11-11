# GW-CRM Tech Spec

Nov 10, 2026 · @Ian

GW-CRM is a Node and TypeScript API over Postgres, with a React and Vite front end. Row-level security in the database keeps each band's data apart.

## Architecture overview

| Layer | Choice | Notes |
| --- | --- | --- |
| Database | Postgres 15 or later | Row-level security, composite foreign keys. 15 is the minimum because the schema uses `ON DELETE SET NULL (column)` |
| API | Node 20 or later (Node 22 in the container), Fastify 5, `pg`, `zod` | Server-side sessions, validation on every body |
| Web | React 18, Vite, TypeScript | In `web/`, served by the API from `web/dist` |
| Tests | Vitest | About 185 backend cases in `test/` (need `DATABASE_URL`), about 30 web cases in `web/src/*.test.ts`, and the SQL tenant isolation tests in `db/tests`. No browser tests yet |
| Repo | github.com/iangotts/gw-crm | One migration per change in `db/migrations` |

In production one process serves `/api` and the built web app. Any other GET falls back to `index.html`.

## Deployment

- One Railway project: a Postgres database and one service built from the `Dockerfile`.
- The `Dockerfile` builds the API and `web/dist` into one `node:22-slim` image, which runs as `node` on port 3000.
- On every start the container runs `dist/cli/migrate.js`, then the server. `migrate.js` applies new migrations without psql, under advisory lock `727274`, so two starting containers can't migrate at once.
- `railway.json` sets the health check to `GET /api/health` (it runs `SELECT 1`) and restarts on failure.
- The variables are listed in `.env.example` and in the root `README.md`.

## Tenancy and security

- Every tenant table has `tenant_id`. Foreign keys are composite `(tenant_id, id)`, so a row cannot point into another band.
- Row-level security is on and forced. The app runs as the `crm_app` role (no login), set per transaction with `SET LOCAL ROLE`.
- Per transaction the API sets `app.user_id`, `app.tenant_ids` and `app.role`. Helper functions `writes_allowed()` and `is_admin()` enforce roles. Read-only members cannot write even if the API has a bug.
- Superusers bypass row-level security, so the app never runs requests as one. Only sessions, migrations, the seed and the import use the owner connection (`withSystem`).
- Login goes through the SECURITY DEFINER function `auth_lookup(email)`.
- Public pages go through four more SECURITY DEFINER functions: `public_tenant`, `public_subscribe`, `public_contact_info` and `public_set_subscription`. They are the only way a request with no login touches tenant data.
- Passwords use scrypt. Sessions are stored server-side as a SHA-256 token hash and sent in a SameSite=Lax, HttpOnly cookie. The role is read again on every request.
- Non-GET requests are checked against allowed origins. Login is limited to 10 tries a minute per address, and the public forms have their own rate limits.
- The subscribe form and unsubscribe links are signed with HMAC using `FORM_SECRET`. Unsubscribe links never expire. A form token is refused if it is under 3 seconds or over 2 hours old.
- Google refresh tokens are stored encrypted with AES-256-GCM using `CALENDAR_KEY`.
- Tests were mutation-checked: they fail if row-level security or the role switch is removed.

## Data model

| Table | Holds |
| --- | --- |
| app\_user, tenant, membership | Logins, bands, and role per band |
| contact, contact\_role, subscription | People, their roles, email consent (subscribed, unsubscribed, bounced, suppressed) |
| venue | Reference list of places, not prospects |
| gig, gig\_member, payment | Leads and bookings, who plays, planned and received payments |
| gig\_money (view) | Fee, scheduled, received, outstanding and payment state per gig, computed under the caller's row-level security |
| activity | Calls, voicemails, texts, emails, notes, tasks. Sent emails also store subject, recipient, delivery status, provider message id and a request id |
| email\_settings | Per band: who mail comes from and where replies go |
| calendar\_connection, calendar\_share, calendar\_settings | Each person's Google sign-in, which calendars each band may check, and where confirmed gigs go |
| gig\_calendar\_event, gig\_calendar\_problem | The Google event for each gig, and the last sync problem |
| link\_target, outbound\_link, link\_click | UTM tracking |
| template | Reusable message text |
| import\_mapping, import\_id\_map | One-time import rules and old-to-new IDs |
| session | Server-side login sessions |
| schema\_migrations | Which migrations have been applied |

Dates are handled as plain `YYYY-MM-DD` text.

Money amounts are text matching `^\d{1,8}(\.\d{1,2})?$` and greater than 0, a rule both the server and the web app check. All sums and payment states (Unpaid, Part paid, Paid, Overpaid) are computed in the database in exact decimal by `gig_money`. The web app only formats them.

## API

Most routes need a login and an active band, and writes also need a member or admin role. The exceptions are marked in the table.

| Area | Routes |
| --- | --- |
| Health | GET /api/health (no login) |
| Login | POST /api/login (no login), POST /api/logout, GET /api/me, POST /api/session/tenant |
| Gigs | GET and POST /api/gigs, GET and PATCH /api/gigs/:id |
| Money | GET /api/gigs/:id/money, POST /api/gigs/:id/payments, POST /api/gigs/:id/payments/plan, PATCH and DELETE /api/payments/:id |
| Contacts | GET and POST /api/contacts, GET /api/contacts/tags, GET and PATCH /api/contacts/:id |
| Subscribers | GET /api/subscribers/summary, GET /api/export/subscribers (admin and member), PUT /api/contacts/:id/subscription |
| Activity | GET and POST /api/activity, PATCH /api/activity/:id, GET /api/followups |
| Email | GET and PUT /api/email/settings (PUT is admin only), POST /api/email/test, POST /api/email/send |
| Calendar | GET /api/calendar/status, GET /api/calendar/connect, GET /api/calendar/callback (Google redirect), GET /api/calendar/calendars, PUT /api/calendar/share, PUT and DELETE /api/calendar/settings (admin only), DELETE /api/calendar/connection, GET /api/gigs/:id/calendar, POST /api/gigs/:id/calendar/sync |
| Templates | GET and POST /api/templates, PATCH /api/templates/:id |
| Links | GET and POST /api/link-targets, PATCH /api/link-targets/:id, GET and POST /api/links, POST /api/links/:id/clicks |
| Venues | GET and POST /api/venues |
| Public (no login) | GET /api/public/band/:slug, POST /api/public/band/:slug/subscribe, GET and POST /api/public/unsubscribe/:token, POST /api/public/resubscribe/:token |

## Agent access

Decided 10 Nov 2026: the Band Ops agents log in as a service-account user with a fixed role, not with an API token.

- The service account is an ordinary `app_user`, for example `agent-lead-triage@…`, created with `npm run create-user` and a membership in each band it works for. Its password (12 characters or more) is stored as a Paperclip secret for that agent only.
- The agent calls `POST /api/login`, keeps the `gwcrm_session` cookie, and calls `POST /api/session/tenant` to pick the band. When a call returns 401 because the session ended, it logs in again.
- Requests with no `Origin` header pass the origin check, so a server-side agent needs no entry in `ALLOWED_ORIGINS`.
- Everything the agent writes is attributed to the service account (`created_by`), so its actions show separately in the activity log.
- Role: `member` is the narrowest role that can create contacts and gigs. It can also send email (`POST /api/email/send`) and edit any gig. Nothing in the API stops that, so until a narrower role exists, the "nothing sent without approval" rule depends on the agent's own approval gates. `read_only` can't write, and `admin` must not be used.
- Open: whether to add a dedicated agent role in the database that can create and update contacts, gigs and activity but cannot send email or change payments.

## Email

- Sending uses SendGrid when `SENDGRID_API_KEY` is set. Without a key, local work keeps mail in memory and production refuses to send.
- A person presses Send every time. The request id makes a send safe to retry, and the provider is called outside any database transaction.
- Unfilled placeholders, and bounced or suppressed addresses, are refused. An unsubscribed person needs an explicit confirm.
- At most `EMAIL_DAILY_CAP` messages are sent per band in 24 hours.
- Sent emails cannot be edited. Open and click tracking are off.

## Google Calendar

- Each person connects their own calendar and chooses which of their calendars each band may check. The band sees only busy times.
- A gig that is Confirmed (and not postponed) or Played, not archived, and dated has an event in the band's chosen calendar. The event is updated when the gig changes and removed otherwise. Fees and notes never go in it.
- Sync runs one gig at a time, skips unchanged events, and never fails a gig save. A problem is stored in `gig_calendar_problem` and shown on the gig.

## UTM links

A tagged link is built on the server from a saved link or a one-off web address.

- Only http and https addresses are accepted.
- Any utm\_ value already on the address is replaced. Other parameters and the fragment are kept.
- Values are lower-cased and made link-safe.
- Source, medium, campaign and content are stored on the link record, and a note with the address is added to the activity log.
- No contact identifier goes in the address, so a visit shows which link worked, not who clicked.
- Clicks are recorded by hand (origin manual) until an analytics tool is chosen.
