# Database Seeds

## Overview

Reference data loaded after migrations: the two band tenants, and the rules that
map legacy GW-GIG (Bubble) data to GW-CRM during the one-time import.

## Interface

- `001_tenants_and_import_rules.sql`
  - Inserts `tenant` rows with slugs `janeblonde` and `rocksolid`.
  - Inserts `import_mapping` rows of `kind = 'band'` that map two Bubble band
    ids to those tenants.
  - Inserts `import_mapping` rows of `kind = 'status'` that map GW-GIG statuses
    to `gig.stage` values: `PITCH`, `ON THE LIST`, `IN-PROCESS`, `CONTRACTED`,
    `PERFORMED`, `POSTPONED`, `CANCELED`, `LOST`, and blank.

## Invariants

- Idempotent: every insert uses `ON CONFLICT ... DO NOTHING` on `tenant (slug)`
  or `import_mapping (kind, source_value)`.
- Must run as the database owner, not as `crm_app`. `crm_app` cannot insert
  into `tenant` and has no access to `import_mapping`
  (`db/migrations/0007_row_level_security.sql`).
- Bubble bands with no `kind = 'band'` mapping are excluded from the import.
- Every status `target_value` must be a valid `gig.stage` value
  (`db/migrations/0004_gigs.sql`).

## Side Effects

- Writes rows to `tenant` and `import_mapping`.

## Verification

- Load: `npm run db:seed` (`scripts/db.sh seed`, requires `DATABASE_URL`)
- Run: `npm run db:test`
