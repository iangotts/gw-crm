# db

## Overview

PostgreSQL schema and reference data for GW-CRM, applied with `scripts/db.sh`
(`psql` plus `DATABASE_URL`, run by a login that owns the database). Tenant
isolation is enforced in the database through row-level security. The app runs
each request as `crm_app` with `app.user_id`, `app.tenant_ids`, and `app.role`
set.

## Subdirectories & Boundaries

- migrations: [./migrations/README.md](./migrations/README.md) - Ordered DDL
  (`0001` to `0012`). Defines the `crm_app` role, RLS helpers, all tables, RLS
  policies, `SECURITY DEFINER` functions for login and the public forms, and the
  `gig_money` view. Applied with `npm run db:migrate`.
- seeds: [./seeds/README.md](./seeds/README.md) - Idempotent reference data:
  tenants `janeblonde` and `rocksolid`, plus `import_mapping` band and status
  rules. Loaded as the owner with `npm run db:seed`.
- tests (test-only, no contract): `tests/tenant_isolation.sql`, run with
  `npm run db:test`.

## Verification

- Run: `npm run db:test` (`scripts/db.sh test`)
- App tests: `npm test` (vitest)
