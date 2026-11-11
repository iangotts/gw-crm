# routes

## Overview

The Fastify HTTP API. Each file exports one `register*Routes(app, deps, ...)` function, and `src/app.ts` calls each of them once. Request bodies, params and queries are validated with `zod`. A `ZodError` becomes `400 { error: 'invalid_request' }` in the app's error handler. Tenant data is always read and written through `withTenant` from `src/db.ts`, so Postgres row-level security applies. Only the public routes use `withAnonymous`, and the auth routes also use `withUser`.

## Interface

### Exported functions and constants

| File | Exports |
| --- | --- |
| `guard.ts` | `makeGuards(deps)` returns `{ needTenant, needWrite }`. `likePattern(q)` escapes `\`, `%` and `_` for `ILIKE`. |
| `auth.ts` | `registerAuthRoutes(app, deps, loginLimit)` |
| `contacts.ts` | `registerContactRoutes(app, deps)` |
| `gigs.ts` | `registerGigRoutes(app, deps, calendar: CalendarService \| null = null)`, `STAGES` |
| `calendar.ts` | `registerCalendarRoutes(app, deps, cal: CalendarService \| null)` |
| `payments.ts` | `registerPaymentRoutes(app, deps)` |
| `activity.ts` | `registerActivityRoutes(app, deps)`, `ACTIVITY_SELECT` (SQL fragment) |
| `public.ts` | `registerPublicRoutes(app, deps, limits: PublicLimits)`, `consentText(band)`, `interface PublicLimits { subscribe; other }` |
| `subscribers.ts` | `registerSubscriberRoutes(app, deps)`, `STATUSES`, `ROLE_KINDS` |
| `email.ts` | `registerEmailRoutes(app, deps, provider: EmailProvider)` |
| `links.ts` | `registerLinkRoutes(app, deps)` |
| `templates.ts` | `registerTemplateRoutes(app, deps)` |
| `venues.ts` | `registerVenueRoutes(app, deps)` |

`STAGES` is `new`, `evaluating`, `in_conversation`, `confirmed`, `played`, `lost`. `STATUSES` is `subscribed`, `unsubscribed`, `bounced`, `suppressed`.

### Endpoints

In the Guard column, "tenant" means a logged-in user with an active band (`needTenant`). "write" means the same, and the role is not `read_only` (`needWrite`). "session" means logged in, with no band required.

| File | Method and path | Guard |
| --- | --- | --- |
| `auth.ts` | `POST /api/login` (rate limited to `loginLimit` per minute) | none |
| `auth.ts` | `POST /api/logout` | none (ends the session if one is present) |
| `auth.ts` | `GET /api/me` | session |
| `auth.ts` | `POST /api/session/tenant` | session, and the user must be a member of the band |
| `contacts.ts` | `GET /api/contacts`, `GET /api/contacts/tags`, `GET /api/contacts/:id` | tenant |
| `contacts.ts` | `POST /api/contacts`, `PATCH /api/contacts/:id` | write |
| `gigs.ts` | `GET /api/gigs`, `GET /api/gigs/:id` | tenant (local guard copy) |
| `gigs.ts` | `POST /api/gigs`, `PATCH /api/gigs/:id` | write (local guard copy) |
| `calendar.ts` | `GET /api/calendar/status` | tenant |
| `calendar.ts` | `GET /api/calendar/connect`, `GET /api/calendar/callback`, `GET /api/calendar/calendars`, `DELETE /api/calendar/connection` | session |
| `calendar.ts` | `PUT /api/calendar/share` | tenant |
| `calendar.ts` | `PUT /api/calendar/settings`, `DELETE /api/calendar/settings` | write, and role `admin` |
| `calendar.ts` | `GET /api/gigs/:id/calendar` | tenant |
| `calendar.ts` | `POST /api/gigs/:id/calendar/sync` | write |
| `payments.ts` | `GET /api/gigs/:id/money` | tenant |
| `payments.ts` | `POST /api/gigs/:id/payments`, `POST /api/gigs/:id/payments/plan`, `PATCH /api/payments/:id`, `DELETE /api/payments/:id` | write |
| `activity.ts` | `GET /api/activity`, `GET /api/followups` | tenant |
| `activity.ts` | `POST /api/activity`, `PATCH /api/activity/:id` | write |
| `public.ts` | `GET /api/public/band/:slug`, `POST /api/public/band/:slug/subscribe`, `GET /api/public/unsubscribe/:token`, `POST /api/public/unsubscribe/:token`, `POST /api/public/resubscribe/:token` | none (rate limited) |
| `subscribers.ts` | `GET /api/subscribers/summary` | tenant |
| `subscribers.ts` | `GET /api/export/subscribers` (`format=csv` or `json`) | write |
| `subscribers.ts` | `PUT /api/contacts/:id/subscription` | write |
| `email.ts` | `GET /api/email/settings` | tenant |
| `email.ts` | `PUT /api/email/settings` | write, and role `admin` |
| `email.ts` | `POST /api/email/test` (5 per minute), `POST /api/email/send` (30 per minute) | write |
| `links.ts` | `GET /api/link-targets`, `GET /api/links` | tenant |
| `links.ts` | `POST /api/link-targets`, `PATCH /api/link-targets/:id`, `POST /api/links`, `POST /api/links/:id/clicks` | write |
| `templates.ts` | `GET /api/templates` | tenant |
| `templates.ts` | `POST /api/templates`, `PATCH /api/templates/:id` | write |
| `venues.ts` | `GET /api/venues` | tenant (inline checks) |
| `venues.ts` | `POST /api/venues` | write (inline checks) |

## Invariants

### Guards and errors

- The guards reply with `401 not_logged_in`, `409 no_active_tenant` or `403 read_only`. The role comes from `authenticate()` in `src/auth.ts`, which reads it from the database on every request.
- Postgres error codes are mapped to readable errors:
  - `23505` becomes `409 email_exists` (contacts) or `409 template_name_exists` (templates).
  - `23503` becomes `400 unknown_contact_or_venue` (gigs) or `400 unknown_contact_or_gig` (activity, links).
  - `42501` becomes `403 read_only`.
  - `23514` becomes `400 only_tasks_have_due_date` (activity).
- Update bodies drop unknown keys (zod objects). They refuse an empty change with "Nothing to change". `archived: true/false` sets `archived_at` to `now()` or `NULL`.

### Login, gigs and activity

- Login (`auth.ts`):
  - It always runs one `verifyPassword`, using `dummyHash` when the email is unknown. An unknown email, an inactive user, a missing hash and a wrong password all return the same `401 invalid_credentials`.
  - A user with exactly one band gets that band as the active tenant.
  - The cookie `gwcrm_session` is `httpOnly`, `sameSite: 'lax'`, `secure: config.cookieSecure`, and lasts `sessionDays`.
- Gigs (`gigs.ts`):
  - `postponed` is allowed only when the stage is `confirmed` (`postponed_needs_confirmed`). Leaving `confirmed` clears `postponed`.
  - Changing to any stage other than `lost`, without sending `lost_reason`, clears `lost_reason`.
  - The patch locks the row with `SELECT ... FOR UPDATE`.
  - After a create or update, `calendar?.sync(ctx, id)` runs outside the transaction. A calendar failure never fails the save.
- Activity (`activity.ts`):
  - `due_at` is allowed only on `task`.
  - The `body` of an email activity cannot be edited once `delivery` is set (`409 sent_email_locked`).
  - A list or create needs a `contact_id` or a `gig_id` (`needs_contact_or_gig`).

### Payments

- Amounts travel as text matching `^\d{1,8}(\.\d{1,2})?$` and must be greater than zero. No floats are used.
- `paid_on` may be at most two days after today (`paid_in_future`).
- Payments on archived gigs cannot be changed (`gig_archived`). Paid payments cannot be deleted (`paid_locked`).
- A payment plan needs `fee_quoted > 0` and no existing payments (`no_fee`, `payments_exist`). It splits the fee into a deposit and a balance (default 50 percent).

### Public routes

- The subscribe endpoint always answers `202 { ok: true }`, so it reveals nothing about who is on the list. The exceptions are `400 form_expired` and `400 consent_required`.
- A filled `website` honeypot, or a form token younger than 3 seconds (`too_fast`), is dropped quietly.
- The consent wording recorded is exactly `consentText(band)`.
- `GET /api/public/unsubscribe/:token` changes nothing. Only the POST endpoints change the status.
- The email shown on the unsubscribe page is masked.

### Email, subscriptions, links and calendar

- Email sending (`email.ts`):
  - It refuses `{first_name}`, `{name}`, `{band}` and `{gig}` left unfilled in the subject or body (`unfilled_placeholder`).
  - The subject is collapsed to one line with `oneLine`.
  - `request_id` is the idempotency key. A repeat returns the first result with `duplicate: true` and never sends twice.
  - It refuses contacts that are `bounced` or `suppressed`. It refuses `unsubscribed` contacts unless `confirm_unsubscribed` is set.
  - A band may send at most `config.emailDailyCap` emails in 24 hours, not counting failed ones (`429 daily_limit`).
  - The provider is called outside any database transaction.
  - Only `admin` may change the email settings.
- Subscriptions (`subscribers.ts`):
  - Setting `subscribed` needs a `consent_source` (`needs_consent_source`).
  - The contact must have an email (`needs_email`).
- Links (`links.ts`): links are tagged with `tagUrl` from `src/links.ts`. A link that is not http or https is refused (`invalid_request`).
- Calendar (`calendar.ts`):
  - Every endpoint answers `503 calendar_not_configured` when the `CalendarService` is null. The exception is `GET /api/gigs/:id/calendar`, which returns `{ configured: false }`.
  - The OAuth callback checks `readState(state, formSecret) === auth.userId`. It always redirects to `${publicUrl}/?calendar=<flag>#/pipeline`.

## Side Effects

### Database tables

| Area | Tables written |
| --- | --- |
| Contacts | `contact` |
| Venues | `venue` |
| Gigs | `gig` |
| Payments | `payment` |
| Activity | `activity` |
| Templates | `template` |
| Links | `link_target`, `outbound_link`, `link_click` (origin `'manual'`) |
| Subscriptions | `subscription` |
| Email settings | `email_settings` |
| Calendar | `calendar_share`, `calendar_settings` |

### Automatic activity notes

- A gig stage change adds a note: "Stage changed: X to Y".
- Moving a gig to `played` adds one testimonial task per gig, due in 2 days.
- Payments add notes when a payment is received or marked paid, and when a payment plan is created.
- Preparing a link adds a "Link prepared" note.
- Changing a subscription adds a note describing the change.

### Other side effects

- Sessions: `createSession`, `deleteSession` and `setSessionTenant` from `src/sessions.ts`. The session cookie is set or cleared.
- Database functions: `auth_lookup`, `public_tenant`, `public_subscribe`, `public_contact_info` and `public_set_subscription`, called through `withAnonymous`.
- Network:
  - `email.ts` calls the injected `EmailProvider.send`, which is SendGrid in production.
  - `calendar.ts` and `gigs.ts` call Google Calendar and OAuth through `CalendarService` and `GoogleClient`.
- Response headers: the CSV export sets `content-disposition: attachment` and `cache-control: no-store`.
- Unsubscribe links: the export adds an `unsubscribe_url` for each row, built with `unsubToken`.

## Verification

- Run: `npm test`
