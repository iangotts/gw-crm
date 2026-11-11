# scripts

## Overview

Command-line helpers for the project's PostgreSQL database. There is one
script, `db.sh`, a Bash wrapper around `psql`. It applies the SQL migrations,
loads seed data, runs the SQL tenant-isolation tests and lists which
migrations have been applied. The `package.json` scripts `db:migrate`,
`db:seed` and `db:test` call it.

## Interface

- `db.sh migrate` (`db.sh:migrate`): creates the `schema_migrations` table if
  it is missing. Then it applies each `db/migrations/*.sql` file whose
  basename is not yet recorded there, in shell glob (lexical) order. It
  prints `applying <version>` for each file and `migrations up to date` at the
  end. Run it with `npm run db:migrate`.
- `db.sh seed`: runs `db/seeds/001_tenants_and_import_rules.sql` and prints
  `seeded`. Run it with `npm run db:seed`.
- `db.sh test`: runs `db/tests/tenant_isolation.sql` and prints
  `all isolation tests passed`. Run it with `npm run db:test`.
- `db.sh status`: prints `version, applied_at` from `schema_migrations`,
  ordered by `version`. No npm script calls this one.
- Any other argument, or none, prints
  `usage: scripts/db.sh migrate|seed|test|status` to stderr and exits with
  code 2.
- Required environment: `DATABASE_URL` (a login that owns the database) and
  `psql` on `PATH`.

## Invariants

- `DATABASE_URL` must be set. If it is missing, the script stops at once
  through `: "${DATABASE_URL:?...}"`.
- The script runs with `set -euo pipefail`, and every `psql` call uses
  `-v ON_ERROR_STOP=1 -X -q` (the `PSQL` array). So any SQL error stops the
  script with a non-zero exit, and `~/.psqlrc` is not read.
- The script switches to the repository root (`cd "$(dirname "$0")/.."`), so
  every `db/...` path is relative to the root, whatever directory you call it
  from.
- A migration's version is its filename without `.sql` (for example
  `0001_foundation`). Files apply in lexical filename order, so new migrations
  must keep the zero-padded numeric prefix.
- Each migration file and the `INSERT INTO schema_migrations` that records it
  run in one `psql --single-transaction` call. Either both commit or neither
  does.
- The version is pasted straight into the SQL text of the "already applied"
  check and the insert. Migration filenames must not contain single quotes.
- `migrate` skips migrations that are already applied. It never re-runs or
  rolls back an applied migration. If you edit a file that has already been
  applied, the change does not take effect.
- `seed` and `test` do not check which migrations are applied. Run `migrate`
  first. `status` fails if `schema_migrations` does not exist yet, which is
  the case until `migrate` has run once.

## Side Effects

- Connects to the PostgreSQL database named by `DATABASE_URL`.
- `migrate`: creates the `schema_migrations (version text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now())` table, runs the DDL in
  `db/migrations/*.sql`, and inserts one row per applied migration.
- `seed`: writes whatever `db/seeds/001_tenants_and_import_rules.sql` inserts
  (tenants and import rules).
- `test`: runs `db/tests/tenant_isolation.sql` against the target database.
  What that SQL changes in the database is defined in that file, not in this
  script.
- `status`: read-only.

## Verification

- Database checks (needs `DATABASE_URL` and a migrated database):
  `npm run db:migrate && npm run db:test`
- Project test suite (vitest, which does not run `db.sh`): `npm test`
