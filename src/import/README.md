# import

## Overview

Turns the GW-GIG (Bubble) CSV exports into GW-CRM rows and loads them. Three of the four files are pure, with no database and no file access: `csv.ts` parses the exports, `rules.ts` converts single values, and `plan.ts` builds the whole import plan. `load.ts` is the only file that touches the database. It writes a `Plan` idempotently. The `src/cli/import.ts` script drives it (see [../cli/README.md](../cli/README.md)).

## Interface

- `csv.ts`
  - `type Row = Record<string, string>`
  - `parseCsv(text): Row[]` handles quoted fields, doubled quotes, line breaks inside quotes, CRLF and a leading byte-order mark. The first row is the header.
- `rules.ts`
  - `BUBBLE_TZ = 'America/Los_Angeles'`
  - `interface BubbleDate { date; time | null }`
  - `bubbleDate(s)` parses `"Dec 9, 2022 12:00 am"` or `"May 27, 2024"` into a `BubbleDate`. It returns null for impossible dates.
  - `bubbleInstant(s)` returns an ISO instant in `BUBBLE_TZ`, using `12:00` when there is no time.
  - `timeOfDay(s)` returns `HH:MM:00` or null.
  - `parseFee(raw)` returns `{ amount, text }`. A plain amount (with optional `$` and comma separators) goes to `amount`. Anything else is kept in `text`.
  - `normalizePhone(raw)` returns `{ phone, flag, junk? }`. US numbers become `(415) 555-1234` with an optional ` xNNN` extension. A `+` number with 8 to 15 digits becomes `+digits`.
  - `normalizeEmail(raw)` returns `{ email, bad }`.
  - `yes(s)` is true for `yes`, ignoring case and surrounding spaces.
  - `roleKind(text)` maps role text to `booking_manager`, `organizer`, `client`, `sound`, `venue_staff` or `other`.
  - `tidyCase(s)` turns all-capitals text into Title Case and leaves mixed case alone.
  - `venueKey(name)` gives a normalized venue name for de-duplication.
- `plan.ts`
  - `buildPlan(x: Exports, rules: Rules): Plan`
  - Types: `Exports` (14 export tables), `Rules` (`bands`, `status`, `main?`, `copyTo?`, `gigsFrom`, `today`), `Plan` (`tenants`, `logins`, `flags`, `dropped`, `spot`, `stats`), `TenantPlan`, `Flag`, `SpotCheck`.
  - Row types: `VenueRow`, `ContactRow`, `GigRow`, `RoleRow`, `PaymentRow`, `ActivityRow`, `GigMemberRow`, `LinkTargetRow`, `OutboundRow`, `ClickRow`, `LoginRow`.
- `load.ts`
  - `loadPlan(pool, plan): Promise<LoadResult>`
  - `type Counts = Record<string, { added; skipped }>`
  - `interface LoadResult { tenants: Record<slug, Counts>; logins: { added; skipped } }`

## Invariants

- `csv.ts`, `rules.ts` and `plan.ts` never touch the database or the filesystem.
- `buildPlan` is deterministic. `pick()` takes evenly spaced spot-check samples (20 gigs and 20 contacts), so a rehearsal gives the same sample every time.
- Every planned row keeps `legacy`, the GW-GIG id or ids it came from. Merged fans and venues carry more than one. Made-up ids are prefixed `booking:`, `fee-paid:` or `play-url:`.
- Tenant selection:
  - The main band is `rules.main`, or else the first band slug that is not `copyTo`. `copyTo` defaults to `rocksolid`.
  - `buildPlan` throws `No Jane Blonde band in the import rules.` when it cannot find the main band.
  - Only the main band's gigs, history and links are planned. The copy-to tenant receives only contacts tagged `rocksolid`.
- Gigs:
  - Only gigs with a readable `Gigdate` on or after `rules.gigsFrom` are kept.
  - A gig whose `GigStatus-text` is not in `rules.status` makes `buildPlan` throw.
  - `POSTPONED` sets `postponed`, and `CANCELED` sets `lostReason = 'canceled'`.
- Fans:
  - Fans marked `Deleted` or `UNSubscribed` are dropped.
  - Live fans with the same normalized email become one contact. The earliest `Creation Date` wins, and the first non-blank value is taken for each field.
  - Invalid emails and non-phone text are moved into `notes` and flagged.
- Venues: only venues that a kept gig or a kept fan-venue link points to are imported. Venues with the same `venueKey` are merged.
- A payment from `Fee-Paid` is dated with the gig date, or with `rules.today` if the gig is in the future. Payments are never dated in the future.
- Logins:
  - They come from `ACTIVE` `BandMembers` rows. The access mapping is `ADMIN` to `admin`, `MEMBER` to `member` and `VIEWER` to `read_only`. Unknown access values are flagged and skipped.
  - No passwords are set (`password_hash` NULL).
- Every row left out is counted in `plan.dropped` under a reason. Rows that need a human look go to `plan.flags`.
- `loadPlan`:
  - It runs in one `withSystem` transaction (`BEGIN`/`COMMIT`, with `ROLLBACK` on any error).
  - It is safe to re-run. Each loaded legacy id is recorded in `import_id_map`, keyed by `(tenant_id, source_table, legacy_id)` and preloaded per tenant. Rows already mapped are counted as `skipped` and not written again.
  - Load order is venues, contacts, gigs, contact roles, payments, activities, gig crew, link targets, outbound links, then clicks. `Ids.need()` throws `Import order problem` if a required parent has not been loaded.
  - It throws if a tenant slug or a gig-crew membership is missing.

## Side Effects

- `load.ts` uses the owner connection and bypasses RLS.
  - It reads `app_user`, `tenant`, `membership` and `import_id_map`.
  - It inserts into `app_user`, `membership` (`ON CONFLICT DO NOTHING`), `venue`, `contact`, `gig`, `contact_role`, `payment` (kind `'other'`), `activity`, `gig_member` (upsert on `(gig_id, membership_id)`), `link_target`, `outbound_link`, `link_click` (origin `'import'`) and `import_id_map`.
- `csv.ts`, `rules.ts` and `plan.ts` have no side effects.

## Verification

- Run: `npm test`
