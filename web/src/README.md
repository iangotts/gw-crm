# web/src (GW-CRM browser client)

## Overview

All source for the GW-CRM single-page app: React 18 components for the
logged-in CRM (pipeline, contacts, follow-ups, templates, links, calendar,
email, money) plus the two public pages (subscribe and unsubscribe), and
small pure helper modules that format and validate data. Every server call
goes through `api()` in `api.ts` to same-origin `/api/*` routes. The server
does all sums and authoritative checks; the helpers here only preview and
format.

## Interface

Entry and shell:

- `main.tsx`: mounts `<App />` in `StrictMode` on `#root` and loads fonts and `styles.css`.
- `App.tsx`: `default App` routes `/subscribe/:slug` and `/unsubscribe/:token` to the public pages with no login. Otherwise it renders `Crm`, which loads `/api/me`, shows `Login` / `BandPicker`, and renders the page selected by the hash route inside `BandContext.Provider`.
- `route.ts`: `type Page` (`pipeline | contacts | followups | templates | links`), `PAGES`, `usePage()` (reads `window.location.hash`, defaults to `pipeline`).
- `band.tsx`: `Band`, `BandContext`, `useBand()`, `useBandName()`.

Server access and shared types:

- `api.ts`: `api<T>(method, url, body?)`, `ApiError(status, code, detail?)`, `setUnauthorizedHandler(fn)`, `errorText(err)` (maps server error codes such as `read_only`, `daily_limit`, `paid_locked` to user-facing text).
- `types.ts`: `StageKey`, `Role`, `Tenant`, `Me`, `Gig`, `GigDetail`, `Activity`, `ActivityKind`, `LogItem`, `Pick`, `EmailSettings`, `ContactRow`, `Consent`, `ContactFull`, `ContactGig`, `TemplateKind`, `Template`, `FollowupGig`, `Followups`, `LinkTarget`, `BuiltLink`.
- `lookups.ts`: `searchContacts(q)`, `createContact(name)`, `searchVenues(q)`, `createVenue(name)`, all returning `Pick`.

Pure helpers (covered by `*.test.ts`):

- `stages.ts`: `Stage`, `STAGES`, `stageLabel`, `groupByStage`, `DateParts`, `dateParts`, `todayIso`, `isBefore`, `money`, `feeText`, `Flag`, `flagsFor`, `shortDate`.
- `money.ts`: `PayState`, `dollars`, `STATE_LABEL`, `payChip(stage, state)`, `validAmount(s)`.
- `utm.ts`: `slug(value)`, `tagUrl(raw, utm)`, `MEDIA`.
- `calendar.ts`: `Busy`, `busyText(b, tz)`, `memberLine(m, tz)`.
- `activity.ts`: `LOG_KINDS`, `kindLabel`, `TEMPLATE_KINDS`, `templateKindLabel`, `PLACEHOLDERS`, `renderTemplate(text, vars)`, `hasUnfilled(text)`, `contactName`, `ago`, `Due`, `dueTone`, `dueText`, `dateOnlyToIso`, `localToIso`.

Pages and components (each calls the `/api` routes listed):

| Component (file) | Server routes used |
| --- | --- |
| `Login`, `BandPicker` (`Login.tsx`) | `POST /api/login`, `GET /api/me` |
| `Pipeline` (`Pipeline.tsx`) | `GET /api/gigs?q=`, `PATCH /api/gigs/:id` |
| `GigCard` (`GigCard.tsx`) | none (props only) |
| `NewGigDialog` (`NewGigDialog.tsx`) | `POST /api/gigs` |
| `GigDrawer` (`GigDrawer.tsx`) | `GET`/`PATCH /api/gigs/:id` (including `{ archived: true }`) |
| `MoneyPanel` (`MoneyPanel.tsx`) | `GET /api/gigs/:id/money`, `POST /api/gigs/:id/payments`, `POST /api/gigs/:id/payments/plan`, `PATCH`/`DELETE /api/payments/:id` |
| `CalendarPanel` (`CalendarPanel.tsx`) | `GET /api/gigs/:id/calendar`, `POST /api/gigs/:id/calendar/sync` |
| `CalendarDialog` (`CalendarDialog.tsx`) | `GET /api/calendar/status`, `GET /api/calendar/calendars`, `GET /api/calendar/connect`, `PUT /api/calendar/share`, `PUT`/`DELETE /api/calendar/settings`, `DELETE /api/calendar/connection` |
| `Contacts` (`Contacts.tsx`) | `GET /api/contacts?...`, `GET /api/contacts/tags` |
| `ContactDrawer` (`ContactDrawer.tsx`) | `GET`/`PATCH /api/contacts/:id` (including `{ archived: true }`), `POST /api/contacts` |
| `ConsentPanel` (`ConsentPanel.tsx`) | `PUT /api/contacts/:id/subscription` |
| `Subscribers` (`Subscribers.tsx`) | `GET /api/subscribers/summary`, `GET /api/export/subscribers?format=json\|csv` |
| `ActivityLog` (`ActivityLog.tsx`) | `GET /api/activity?...`, `POST /api/activity`, `PATCH /api/activity/:id`, `GET /api/templates` |
| `FollowUps` (`FollowUps.tsx`) | `GET /api/followups`, `PATCH /api/activity/:id`, `PATCH /api/gigs/:id`, `PATCH /api/payments/:id` |
| `EmailComposer` (`EmailComposer.tsx`) | `GET /api/contacts/:id`, `GET /api/email/settings`, `GET /api/templates`, `POST /api/email/send` |
| `EmailSettingsDialog` (`EmailSettingsDialog.tsx`) | `GET`/`PUT /api/email/settings`, `POST /api/email/test` |
| `Templates` (`Templates.tsx`) | `GET`/`POST /api/templates`, `PATCH /api/templates/:id` (including `{ archived: true }`) |
| `Links` (`Links.tsx`) | `GET`/`POST /api/link-targets`, `PATCH /api/link-targets/:id` |
| `LinkBuilder` (`LinkBuilder.tsx`) | `GET /api/links?...`, `POST /api/links`, `POST /api/links/:id/clicks`, `GET /api/link-targets` |
| `publicRoute`, `PublicSubscribe`, `PublicUnsubscribe` (`Public.tsx`) | `GET /api/public/band/:slug`, `POST /api/public/band/:slug/subscribe`, `GET /api/public/unsubscribe/:token`, `POST /api/public/{unsubscribe\|resubscribe}/:token` |
| `Combobox` (`Combobox.tsx`) | none directly; calls the `search` / `create` props (usually from `lookups.ts`) |

## Invariants

- Every request goes through `api()` with `credentials: 'same-origin'`. A `204` resolves to `undefined`. A non-OK response throws `ApiError(status, data.error ?? 'request_failed', data.message)`.
- A `401` from any URL other than `/api/login` calls the handler set by `setUnauthorizedHandler`. `Crm` sets it to `setMe(null)`, which returns the user to `Login`.
- Edit rights come from the band role. Pages compute `canEdit = role !== 'read_only'`. `EmailSettingsDialog` gets `canEdit={role === 'admin'}`, and admin-only calendar settings are gated by `role === 'admin'` in `CalendarDialog`. The server enforces these rules too (`read_only`, `admin_only` errors).
- Pages are keyed by `${active.id}-${epoch}`. Switching band (`POST /api/session/tenant`) remounts them so no data from the previous band is shown.
- Public routes match only `^/(subscribe|unsubscribe)/<value>/?$` and never require a login.
- `YYYY-MM-DD` dates are split by regex (`dateParts`) and compared as strings (`isBefore`) so no time zone can shift the day.
- `money.ts` and `stages.ts` only format numbers that the server sent as strings. `validAmount` mirrors the server rule `^\d{1,8}(\.\d{1,2})?$` and requires a value greater than 0.
- `tagUrl` accepts only `http:`/`https:`, removes existing `utm_*` parameters, and sets `utm_source`/`utm_medium` (plus optional `utm_campaign`/`utm_content`) using `slug()`. It is a preview only; the server builds the stored link.
- `renderTemplate` leaves an unfilled `{first_name}`, `{name}`, `{band}`, or `{gig}` in the text. `EmailComposer` will not send while `hasUnfilled` is true, while the address is bounced or suppressed, or while the contact is unsubscribed unless the user confirms (`confirm_unsubscribed`).
- `EmailComposer` sends a `request_id` from `crypto.randomUUID()` and makes a new one after a failed attempt, so a retry counts as a new request.
- `Pipeline.move` updates the stage optimistically and restores the previous gig if `PATCH /api/gigs/:id` fails.
- Archiving a gig, contact, or template is `PATCH ... { archived: true }`. Nothing in the client issues a hard delete for these records.

## Side Effects

- Network: same-origin `fetch` to the `/api/*` routes in the table above (JSON bodies, session cookie).
- Navigation: `CalendarDialog` calls `window.location.assign(url)` from `GET /api/calendar/connect` to start Google OAuth. `Crm` reads `?calendar=connected|declined|...` on return and removes it with `window.history.replaceState`.
- Routing: `usePage` listens for `hashchange` on `window`.
- Clipboard: `navigator.clipboard.writeText` in `LinkBuilder` (built link), `Subscribers` (subscribe URL), and `Templates` (subject and body).
- File download: `Subscribers` links to `/api/export/subscribers?...&format=csv` with `download`.
- Timers: `setTimeout` debounces searches (250 ms in `Pipeline` and `Contacts`) and clears toasts (3 to 4 s).
- DOM: `main.tsx` renders into `#root`. The drawers listen for the Escape key and check `document.querySelector('.scrim.center')` so a dialog on top closes first.

## Verification

- Prerequisite: `npm --prefix web install` (the package has its own dependencies; without `web/node_modules`, vitest fails to load `vite.config.ts` because it cannot find `@vitejs/plugin-react`)
- Run: `npm --prefix web test` (vitest; runs `src/**/*.test.ts`: `activity`, `calendar`, `links`, `money`, `stages`)
- Typecheck: `npm --prefix web run typecheck`
