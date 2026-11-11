# Database Migrations

## Overview

Ordered PostgreSQL DDL files that define the full GW-CRM schema: the `crm_app`
role and its row-level-security (RLS) helpers, identity and tenancy, contacts and
venues, gigs and payments, the activity log, tracked links, templates, import
bookkeeping, sessions, public form functions, email settings, Google Calendar
sync, and the `gig_money` view. Each file runs once, in filename order,
inside a single transaction. `scripts/db.sh migrate` records each run in
`schema_migrations`.

## Interface

| File | Defines |
| --- | --- |
| `0001_foundation.sql` | Role `crm_app` (NOLOGIN, granted to `CURRENT_USER`); functions `set_updated_at()` (trigger), `visible_tenants()`, `current_user_id()`, `writes_allowed()`, `is_admin()` |
| `0002_identity.sql` | Tables `app_user`, `tenant`, `membership`; `SECURITY DEFINER` function `auth_lookup(p_email text)` |
| `0003_contacts_venues.sql` | Tables `venue`, `contact`, `subscription` |
| `0004_gigs.sql` | Tables `gig`, `contact_role`, `gig_member`, `payment` |
| `0005_activity_links_templates.sql` | Tables `activity`, `link_target`, `outbound_link`, `link_click`, `template` |
| `0006_import.sql` | Tables `import_mapping`, `import_id_map` (used only by the import script) |
| `0007_row_level_security.sql` | RLS policies and grants on all tables above |
| `0008_sessions.sql` | Table `session` (owner-only) |
| `0009_public_forms.sql` | `SECURITY DEFINER` functions `public_tenant(text)`, `public_subscribe(text, text, text, text, text)`, `public_contact_info(uuid)`, `public_set_subscription(uuid, text)` |
| `0010_email.sql` | Table `email_settings`; adds `activity` columns `subject`, `email_to`, `delivery`, `delivery_error`, `provider_message_id`, `request_id` |
| `0011_calendar.sql` | Tables `calendar_connection`, `calendar_share`, `calendar_settings`, `gig_calendar_event`, `gig_calendar_problem` |
| `0012_money.sql` | View `gig_money` (`security_invoker = true`) with columns `fee`, `scheduled`, `received`, `outstanding`, `state`, `schedule_gap` |

Per-request session settings that the RLS helpers read (`0001_foundation.sql`):
`app.user_id`, `app.tenant_ids` (comma-separated uuids), and `app.role`
(`admin` / `member` / `read_only`). The app must run `SET LOCAL ROLE crm_app`.

## Invariants

- Migrations are append-only and applied in lexical filename order. Never edit
  a file that has been applied. Add a new numbered file instead
  (`scripts/db.sh:migrate`).
- `visible_tenants()` returns an empty array when `app.tenant_ids` is unset, so
  no rows are visible by default (`0001_foundation.sql`).
- `writes_allowed()` is true only for `app.role` in (`admin`, `member`).
  `is_admin()` is true only for `admin` (`0001_foundation.sql`).
- Every tenant-scoped table carries `tenant_id` and `UNIQUE (tenant_id, id)`.
  Child tables use composite foreign keys `(tenant_id, x_id)`, so a row cannot
  link to another tenant's row (`0003_contacts_venues.sql`, `0004_gigs.sql`,
  `0005_activity_links_templates.sql`).
- RLS is `ENABLE` + `FORCE` on `venue`, `contact`, `subscription`, `gig`,
  `contact_role`, `gig_member`, `payment`, `activity`, `link_target`,
  `outbound_link`, `link_click`, `template`, `gig_calendar_event`, and
  `gig_calendar_problem`. Select needs `tenant_id = ANY (visible_tenants())`.
  Insert, update, and delete also need `writes_allowed()`
  (`0007_row_level_security.sql`, `0011_calendar.sql`).
- `membership` insert, update, and delete require `is_admin()`. The `tenant`
  table is read-only to `crm_app`. On `app_user`, `crm_app` may update only
  `name` and `password_hash` on its own row, and cannot select `password_hash`
  (`0007_row_level_security.sql`).
- `email_settings` writes require `is_admin()`. `calendar_settings` writes
  require `is_admin()` and `owner_user_id = current_user_id()`.
  `calendar_connection` and `calendar_share` writes are limited to the user's
  own rows (`0010_email.sql`, `0011_calendar.sql`).
- `import_mapping`, `import_id_map`, and `session` have no `crm_app` grants and
  RLS with no policy (`0007_row_level_security.sql`, `0008_sessions.sql`).
- `session.id` is the SHA-256 of the cookie token, not the token itself
  (`0008_sessions.sql`).
- Emails are stored lower-case and trimmed (CHECK on `app_user.email` and
  `contact.email`). There is at most one non-archived contact per
  `(tenant_id, email)` (`contact_email_key`).
- `gig.stage` is one of `new`, `evaluating`, `in_conversation`, `confirmed`,
  `played`, or `lost`. `postponed` may be true only when `stage = 'confirmed'`
  (`0004_gigs.sql`).
- `subscription.status` is one of `subscribed`, `unsubscribed`, `bounced`, or
  `suppressed`. `public_subscribe` never re-subscribes a non-subscribed
  contact; it returns `blocked`. `public_set_subscription` undoes only
  `unsubscribed`, never `bounced` or `suppressed` (`0009_public_forms.sql`).
- `activity.due_at` and `activity.completed_at` are allowed only for
  `kind = 'task'`. The email columns are allowed only for `kind = 'email'`.
  `(tenant_id, request_id)` is unique, so a retried send cannot send twice
  (`0005_activity_links_templates.sql`, `0010_email.sql`).
- `payment.amount >= 0`. Money totals are computed only in `gig_money`, which
  runs with the caller's RLS (`0004_gigs.sql`, `0012_money.sql`).

## Side Effects

- Creates the cluster-level role `crm_app` if it does not exist, and grants it
  to the migrating login (`0001_foundation.sql`).
- Creates tables, indexes, `*_updated` triggers (calling `set_updated_at()`),
  RLS policies, grants and revokes, functions, and a view in schema `public`.
- `SECURITY DEFINER` functions bypass RLS. `auth_lookup` reads `app_user`.
  `public_subscribe` inserts into `contact`, `subscription`, and `activity`.
  `public_set_subscription` upserts `subscription` and inserts into `activity`.
  `public_tenant` and `public_contact_info` read `tenant`, `contact`, and
  `subscription` (`0002_identity.sql`, `0009_public_forms.sql`).

## Verification

- Apply: `npm run db:migrate` (`scripts/db.sh migrate`, requires `DATABASE_URL`)
- Run: `npm run db:test` (`scripts/db.sh test`, runs `db/tests/tenant_isolation.sql`)
