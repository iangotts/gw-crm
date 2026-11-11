# src

## Overview

The GW-CRM backend is a Node 20+ TypeScript service built on Fastify, `pg` and `zod`. The files directly in this folder are shared infrastructure:

- configuration
- database access with row-level-security context
- sessions and authentication
- password hashing
- signed tokens
- CSV output and UTM link tagging
- email providers
- the Google Calendar client and the gig calendar sync service
- the app factory and server entry point

HTTP handlers live in `routes/`, the GW-GIG import pipeline in `import/`, and owner-level scripts in `cli/`.

## Interface

### Subdirectories

- [routes](./routes/README.md): the Fastify `register*Routes` functions for the `/api/*` endpoints.
- [import](./import/README.md): the pure GW-GIG CSV to `Plan` pipeline (`parseCsv`, `buildPlan`) and the idempotent `loadPlan`.
- [cli](./cli/README.md): the `migrate.ts`, `create-user.ts` and `import.ts` scripts.

### Files in this folder

| File | Public symbols |
| --- | --- |
| `server.ts` | Entry point with no exports. It calls `loadConfig`, `createPool` and `buildApp`, purges expired sessions every hour, closes cleanly on `SIGTERM`/`SIGINT`, and listens on `0.0.0.0:config.port`. |
| `app.ts` | `buildApp(config, pool, opts?: BuildOptions): Promise<FastifyInstance>`, `interface BuildOptions { logger?, loginLimit?, publicLimit?, emailProvider?, google?, webDist? }` |
| `config.ts` | `interface Config`, `loadConfig(env = process.env): Config` |
| `db.ts` | `type Role = 'admin' \| 'member' \| 'read_only'`, `interface TenantContext { userId, tenantId, role }`, `createPool`, `withAnonymous`, `withUser`, `withTenant`, `withSystem` |
| `auth.ts` | `COOKIE_NAME = 'gwcrm_session'`, `interface Deps { pool, config }`, `interface Auth`, `authenticate(deps, req): Promise<Auth \| null>` |
| `sessions.ts` | `interface Session`, `createSession`, `getSession`, `setSessionTenant`, `deleteSession`, `purgeExpiredSessions` |
| `passwords.ts` | `hashPassword(password, logN)`, `verifyPassword(password, stored)`, `dummyHash(logN)` |
| `tokens.ts` | `formToken`, `checkFormToken` returning `FormCheck` (`'ok' \| 'too_fast' \| 'expired' \| 'invalid'`), `unsubToken`, `readUnsubToken` |
| `csv.ts` | `csvCell(value)`, `toCsv(header, rows)` |
| `links.ts` | `slug(value)`, `interface Utm`, `tagUrl(raw, utm): string \| null` |
| `email.ts` | `interface OutgoingEmail`, `class EmailError(message, notConfigured)`, `interface EmailProvider`, `textToHtml`, `oneLine`, `sendGridProvider(apiKey, fetchImpl?)`, `logProvider()`, `noProvider()` |
| `caltime.ts` | `validTimeZone`, `localToInstant(date, time, tz)`, `addDays`, `addHoursLocal`, `hhmm` |
| `google.ts` | `class GoogleError(message, needsReconnect)`, `GOOGLE_SCOPES`, `interface GoogleClient` (`authUrl`, `exchangeCode`, `accessToken`, `revoke`, `listCalendars`, `listBusy`, `insertEvent`, `patchEvent`, `deleteEvent`), `realGoogle(cfg, fetchImpl?)`, `fakeGoogle()` (test double), plus the types `Tokens`, `BusyEvent`, `CalendarEntry`, `EventInput`, `CreatedEvent` and `GoogleConfig` |
| `calendar.ts` | `encryptToken`, `decryptToken`, `makeState`, `readState`, `desiredEvent(g, tz, attendees)`, `class CalendarService` (`connectUrl`, `completeConnect`, `accessTokenFor`, `disconnect`, `gigState`, `sync`), `interface MemberBusy`, `interface GigCalendarState` |

## Invariants

### Database access (`db.ts`)

- Every helper runs its callback in one transaction (`BEGIN`/`COMMIT`, with `ROLLBACK` on error) and always releases the client.
- `withAnonymous`, `withUser` and `withTenant` run `SET LOCAL ROLE crm_app` and set `app.user_id`, `app.tenant_ids` and `app.role` with `set_config(..., true)`. These last for the transaction only.
- `withSystem` uses the owner login and bypasses RLS. It is meant only for sessions and admin tooling, never for tenant data.
- `pg` type 1082 (`date`) is kept as `YYYY-MM-DD` text, so no time-zone shift can occur.

### Authentication and passwords

- `authenticate()` (`auth.ts`) re-reads the membership role on every request. If the membership is gone, it clears the session's tenant and returns `tenantId: null`.
- Sessions (`sessions.ts`):
  - Only the SHA-256 hash of the 32-byte random cookie token is stored.
  - Sessions are valid only for an active `app_user` with `expires_at > now()`.
  - The expiry slides forward at most once an hour.
- Passwords (`passwords.ts`):
  - They are stored as `scrypt$<logN>$<r>$<p>$<salt>$<hash>`, with r=8, p=1 and a 32-byte key, compared with `timingSafeEqual`.
  - `dummyHash` gives unknown emails the same cost as a wrong password.

### Signed tokens (`tokens.ts`)

- Form tokens are HMAC-SHA256 signatures with `formSecret`, scoped to the band slug.
- `checkFormToken` returns `too_fast` under 3 s and `expired` over 2 h.
- Unsubscribe tokens never expire and must contain a UUID contact id.

### Configuration (`config.ts`)

- `DATABASE_URL` is always required.
- In production, `FORM_SECRET` is required. `CALENDAR_KEY` is also required in production when Google is configured.
- `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` must be set together, or not at all.
- `EMAIL_PROVIDER` must be `sendgrid`, `log` or `none`. When it is not set, the default is `sendgrid` if a key is present, otherwise `none` in production and `log` elsewhere.
- Defaults:

  | Setting | Default |
  | --- | --- |
  | Port | 3000 |
  | `sessionDays` | 14 |
  | `scryptLogN` | 16 |
  | `emailDailyCap` | 200 |
  | `allowedOrigins` | `http://localhost:5173` |

### App wiring (`app.ts`)

- Any non-GET/HEAD/OPTIONS request with an `Origin` header that is not in `allowedOrigins` gets `403 bad_origin`.
- A `ZodError` becomes `400 invalid_request` with its `issues`. Errors with a status under 500 pass through. Everything else is logged and returns `500 server_error`.
- Rate limiting is registered with `global: false`, so it applies only to routes that opt in. The defaults are 10 login attempts per minute, and 5 subscribe and 60 other public requests per minute.
- `trustProxy: true` is set, and the request body limit is 1 MiB.
- When `web/dist` exists, it is served statically. Non-API GET requests fall back to `index.html`.
- `CalendarService` is created only when a Google client exists, from config or from `opts.google`.

### Email and links

- Email (`email.ts`):
  - SendGrid mail is sent as plain text plus escaped HTML, with click and open tracking disabled.
  - 401/403 from SendGrid throws `EmailError(..., notConfigured = true)`.
  - Requests time out after 15 s.
- Links (`links.ts`): `tagUrl` accepts only `http` and `https`. It replaces any existing `utm_*` parameters and keeps the other parameters and the fragment.
- CSV (`csv.ts`): `csvCell` prefixes cells that start with `=`, `+`, `-`, `@`, tab or CR with `'` to prevent formula injection.

### Calendar (`calendar.ts`, `caltime.ts`)

- Refresh tokens are stored encrypted with AES-256-GCM (`v1.` format), using a key derived from `calendarKey`.
- OAuth `state` is an HMAC of the user id and a timestamp, valid for 15 minutes.
- `desiredEvent` returns an event only for gigs that are `confirmed` and not postponed, or `played`, and that are not archived and have an `event_date`.
  - With no start time, the event is all-day.
  - With no end time, the event lasts 3 hours.
  - An end time on or before the start time moves the end to the next day.
- `CalendarService.sync`:
  - It runs one sync at a time per gig through an in-process promise chain. This assumes a single server process.
  - It never throws. Failures are recorded in `gig_calendar_problem` and the result is `'problem'`.
  - A content hash skips updates that would change nothing.
  - An event deleted in Google is recreated.
- `accessTokenFor` caches access tokens in memory. On a reconnect-type `GoogleError`, it marks the connection `needs_reconnect`.
- `localToInstant` resolves wall-clock times in an IANA zone with a two-pass offset correction, which handles DST changes.

## Side Effects

- Database:
  - `sessions.ts` writes `session` (insert, update, delete) through `withSystem`.
  - `auth.ts` may clear `session.tenant_id`.
  - `calendar.ts` writes `calendar_connection`, `gig_calendar_event` and `gig_calendar_problem`, and reads `calendar_settings`, `calendar_share`, `membership` and `app_user`.
  - `app.ts` runs `SELECT 1` for `GET /api/health`.
- Network:
  - `email.ts` sends mail through `POST https://api.sendgrid.com/v3/mail/send`.
  - `google.ts` calls `accounts.google.com`, `oauth2.googleapis.com` (token and revoke) and `www.googleapis.com/calendar/v3` (calendar list, events list, insert, patch and delete, with `sendUpdates=none`).
- In-memory state:
  - `logProvider` keeps sent mail in `sent`.
  - `CalendarService` keeps access-token and sync-chain maps.
  - `dummyHash` memoizes one hash.
- Process (`server.ts`): it binds a TCP port, runs an hourly `purgeExpiredSessions` timer, and handles `SIGTERM`/`SIGINT` by closing the app and pool and then exiting.
- Filesystem: `app.ts` checks for and serves static files from `web/dist`.
- Secrets: `config.ts` generates a random `formSecret` outside production when none is set. Unsubscribe links then stop working after a restart.

## Verification

- Run: `npm test` (vitest; the tests are in `test/` and need `DATABASE_URL`)
