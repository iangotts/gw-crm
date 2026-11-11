# Drift report, 10 Nov 2026

Design documents in `docs/designs/` checked against branch `phase-1-schema` at `1191c52`. This lists only the differences. For each one, decide whether to update the document or the code.

## tech-spec.md

- **API table is missing every route from phase 5 on.** The routes below exist in the code but not in the spec:
  - `GET /api/health` (`src/app.ts`)
  - Money: `GET /api/gigs/:id/money`, `POST /api/gigs/:id/payments`, `POST /api/gigs/:id/payments/plan`, `PATCH` and `DELETE /api/payments/:id` (`src/routes/payments.ts`)
  - Calendar: `GET /api/calendar/status|connect|callback|calendars`, `PUT /api/calendar/share`, `PUT` and `DELETE /api/calendar/settings`, `DELETE /api/calendar/connection`, `GET /api/gigs/:id/calendar`, `POST /api/gigs/:id/calendar/sync` (`src/routes/calendar.ts`)
  - Email: `GET` and `PUT /api/email/settings`, `POST /api/email/test`, `POST /api/email/send` (`src/routes/email.ts`)
  - Subscribers: `GET /api/subscribers/summary`, `GET /api/export/subscribers`, `PUT /api/contacts/:id/subscription` (`src/routes/subscribers.ts`)
  - Public, no login: `GET /api/public/band/:slug`, `POST /api/public/band/:slug/subscribe`, `GET` and `POST /api/public/unsubscribe/:token`, `POST /api/public/resubscribe/:token` (`src/routes/public.ts`)
- **"All routes need a login and an active band" is no longer true.** `/api/login`, `/api/health`, `/api/calendar/callback` and the five `/api/public/*` routes run without one. Admin-only checks (email settings, calendar settings) are also not mentioned.
- **Data model table is incomplete.** It is missing `email_settings` (0010), `calendar_connection`, `calendar_share`, `calendar_settings`, `gig_calendar_event`, `gig_calendar_problem` (0011), the `gig_money` view (0012) and `schema_migrations`. It also leaves out the email columns added to `activity` in 0010 (`subject`, `email_to`, `delivery`, `delivery_error`, `provider_message_id`, `request_id`).
- **Security section is missing later mechanisms.** It doesn't cover the `SECURITY DEFINER` public-form functions (`public_tenant`, `public_subscribe`, `public_contact_info`, `public_set_subscription`), HMAC form and unsubscribe tokens signed with `FORM_SECRET` (`src/tokens.ts`), AES-256-GCM encryption of Google refresh tokens with `CALENDAR_KEY` (`src/calendar.ts`), the per-route rate limits on public forms, or the `EMAIL_DAILY_CAP` send cap.
- **Money handling is described incompletely.** The spec says money columns "are formatted in the web app". It doesn't say that all sums and payment states are computed in the database by `gig_money`, or give the amount rule `^\d{1,8}(\.\d{1,2})?$` that both server and client enforce.
- **Test numbers and tools don't match.** The spec lists "Vitest, Playwright" and "35 backend, 14 web, 25 browser checks". Playwright isn't in either `package.json` and there are no browser tests in the repo. There are about 185 `it`/`test` cases in `test/` and 30 in `web/src/*.test.ts`.
- **Versions are inconsistent.** The spec says Postgres 16. The root README says Postgres 15 or later, which is what the schema needs for `ON DELETE SET NULL (column)`. The spec says Node 22, while `package.json` `engines` allows Node 20 or later (the `Dockerfile` uses `node:22-slim`).
- **Repo address is out of date.** The spec gives `github.com/iangotts/gigworks-crm`; the repository is now `github.com/iangotts/gw-crm`.
- **Deployment isn't described.** The `Dockerfile` (two-stage, migrations on start), `railway.json` (health check `/api/health`) and `src/cli/migrate.ts` (migrates without psql, under advisory lock `727274`) appear in no design document.
- **No API for agents.** The Band Ops Agents plan, outside this repo, expects the lead-triage agent to call this API "with a scoped token". The spec only describes cookie sessions, and the code has no token or service-account auth.

## ui-spec.md

- **Colours differ from the token table.** The code (`web/src/styles.css`) uses:
  - Ink `#1a1030`, not `#121412`.
  - Ink 2 `#5b5470`, not `#525450`.
  - Gold `#e2c36a`, not `#E8C460`, plus `--gold-deep #c9a13c`, `--gold-pale` and `--gold-soft`, which aren't in the spec.
  - Purple `#7b2fe0` (with `--purple-deep #5019b0`), not `#3F2A66`.
  - A deep indigo `#180830` (`--charcoal`) for the header and primary buttons, which the spec calls charcoal.

  The page, dim, surface and all six stage colours match.
- **The palette move to indigo and purple isn't recorded.** The spec still says purple and the stage colours are "assumed" guesses to confirm. The stage colours shipped as assumed. The purple changed.
- **The Do not email chip covers more cases.** The spec shows it for unsubscribed or bounced email. `Contacts.tsx` shows it for any status other than `subscribed`, which includes `suppressed`. The spec never mentions `suppressed`.
- **Follow-ups has three lists, not two.** `FollowUps.tsx` adds a Payments list (unpaid payments with a due date, and played gigs still owed money, each with Marked paid). The spec describes two lists side by side.
- **Screens with no spec:**
  - Money panel in the gig drawer (`MoneyPanel.tsx`)
  - Calendar panel and dialog (`CalendarPanel.tsx`, `CalendarDialog.tsx`)
  - Email composer and email settings (`EmailComposer.tsx`, `EmailSettingsDialog.tsx`)
  - Subscribers and export (`Subscribers.tsx`)
  - Consent panel in the contact drawer (`ConsentPanel.tsx`)
  - Public subscribe and unsubscribe pages (`Public.tsx`)
  - Login and band picker (`Login.tsx`, `App.tsx:BandPicker`)

  The spec's Gig drawer section doesn't list the Money and Calendar sections it now holds.
- **Phone breakpoint isn't stated.** The spec gives "no sideways scrolling at 390px". The code switches to the phone layout (tab bar, floating New button) at `max-width: 760px`, and the spec doesn't name that breakpoint.
- **Escape behaviour is wider than described.** The spec says Escape closes the gig drawer and New gig. It also closes the contact drawer, comboboxes, the link builder and the template editor, and a dialog on top closes before the drawer under it.

## build-plan.md

- **Phase status is out of date.** Phases 5 (subscribe, unsubscribe, export), 6 (individual email), 7 (Google Calendar), 8 (gig to money) and 9 (import) are marked "Not started", but all are built. Their routes, migrations 0009 to 0012, screens and `src/import` are in the code. Phase 10 (cutover) has started: the `Dockerfile`, `railway.json` and `src/cli/migrate.ts` are in the last commit.
- **The intro is out of date.** It says "Phases 1 and 2 are done and phase 3 has started". The root `README.md` "Status" section says the same ("The screens come next (phase 3)").
- **Branch statement.** The plan says everything is on `main`. The work is on `phase-1-schema`, which GitHub uses as the default branch (`origin/HEAD`); `origin/main` points at the same commit today. Branches `phase-2-backend`, `phase-3-pipeline` and `phase-8-money` also exist on GitHub.
- **Open items have been resolved by the code.** Email provider: SendGrid is built (`src/email.ts`). Scope of the Google Calendar link: built as free/busy sharing plus confirmed-gig events. Analytics tool: still open, and clicks stay manual (`link_click.origin = 'manual'`). Password reset, user invites and the combined admin view are still not built, so those items stand.
- **The import doesn't check every figure in the plan.** `src/cli/import.ts:EXPECTED` checks fans kept (1,274), merged email groups (27), contacts copied to ROCKSOLID (37), undated gigs (15), venues (129) and logins (15). It doesn't check the plan's 82 gigs or 22 band memberships. It also checks three figures the plan doesn't mention: fan-venue links kept (116), logins in both bands (6) and viewers in Jane Blonde (5).
- **Import code not covered in the plan:** BandMembers who aren't ACTIVE are skipped, payments are never dated after the run date, `America/Los_Angeles` is assumed for export times, and the dry-run, `--yes` and `--gigs-from` behaviour. These are only in the root `README.md`.

## Resolution, 10 Nov 2026

All three specs were updated to match the code. The root `README.md` "Status" section was updated as well. These items are still open as work to do, now listed in `build-plan.md`:

- Token or service-account login for the Band Ops agents.
- Browser tests (Playwright).
- Import checks for the 82 gigs and 22 memberships in `src/cli/import.ts:EXPECTED`.
