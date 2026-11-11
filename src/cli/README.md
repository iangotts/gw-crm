# cli

## Overview

Command-line entry points that run as the database owner, outside row-level security. They apply migrations and the seed, create or update logins, and import the GW-GIG (Bubble) CSV exports. Each file is a top-level script: it parses its flags with `node:util` `parseArgs`, runs, and closes its database connection. None of them export symbols.

## Interface

| Script | How it is run | Flags and inputs |
| --- | --- | --- |
| `migrate.ts` | `node dist/cli/migrate.js` (after `npm run build`) | `--seed` also runs `db/seeds/001_tenants_and_import_rules.sql`. Reads `DATABASE_URL` through `loadConfig()`. |
| `create-user.ts` | `npm run create-user -- ...` | `--email` (required), `--name`, `--membership slug:role` (repeatable; role is `admin`, `member` or `read_only`). The password comes from the `GWCRM_PASSWORD` environment variable. |
| `import.ts` | `npm run import -- ...` | `--dir` (required, the folder of exported CSV files), `--out` (default `import-report`), `--dry-run`, `--yes`, `--today` (default the current UTC date), `--gigs-from` (default `2024-11-05`). |

What each script depends on:

- `migrate.ts` uses `pg.Client` directly and `loadConfig` from `src/config.ts`.
- `create-user.ts` uses `loadConfig`, `createPool` and `withSystem` from `src/db.ts`, and `hashPassword` from `src/passwords.ts`.
- `import.ts` uses `parseCsv` (`../import/csv.ts`), `buildPlan` (`../import/plan.ts`) and `loadPlan` (`../import/load.ts`). See [../import/README.md](../import/README.md).

## Invariants

- `migrate.ts` creates the `schema_migrations (version text PRIMARY KEY, applied_at timestamptz)` table if it is missing. This is the same table `scripts/db.sh` uses.
- `migrate.ts` takes `pg_advisory_lock(727274)` before it applies anything, so two processes cannot apply the same file. It always calls `pg_advisory_unlock(727274)` in `finally`.
- `migrate.ts` applies the `db/migrations/*.sql` files in sorted filename order. The version is the filename without `.sql`. Each file runs in its own `BEGIN`/`COMMIT` together with its `schema_migrations` insert. If a file fails, it is rolled back and the script throws `Migration <version> failed and was rolled back`.
- `create-user.ts` exits with code 2 if `--email` or `GWCRM_PASSWORD` is missing, if the password has fewer than 12 characters, or if a `--membership` value is malformed. Emails are trimmed and lower-cased.
- `create-user.ts` is idempotent per email. `INSERT ... ON CONFLICT (email) DO UPDATE` resets `password_hash`, keeps the existing `name` when `--name` is not given, and sets `is_active = true`. Memberships upsert on `(tenant_id, user_id)` and overwrite the role. It throws if no `tenant` has the given slug.
- `import.ts` exits with code 2 without `--dir`. It throws if `import_mapping` has no `band` rules ("Run the seed first").
- `import.ts` picks one file per export name with ``/export_All-<name>(-modified[^_]*)?_/``. It prefers files whose first row has a `unique id` column, then takes the last filename in descending sort order.
- `import.ts` writes to the database only with `--yes` and without `--dry-run`. Without either flag it prints the target host and database and exits with code 1.
- `import.ts` compares `plan.stats` with the hard-coded `EXPECTED` figures and prints `ok` or `DIFF` for each. A difference is reported but does not stop the run.

## Side Effects

- Database (owner connection, bypassing RLS):
  - `migrate.ts` runs DDL from `db/migrations`, writes to `schema_migrations`, and with `--seed` runs the seed SQL.
  - `create-user.ts` writes to `app_user` and `membership`.
  - `import.ts` reads `import_mapping` and `tenant`. With `--yes` it calls `loadPlan`, which writes tenant data and `import_id_map`.
- Filesystem:
  - `migrate.ts` reads `db/migrations/*.sql` and `db/seeds/001_tenants_and_import_rules.sql`, resolved relative to the script (`../../db/`).
  - `import.ts` reads the CSV exports in `--dir`. It creates `--out` and writes `report.md`, `spot-check.md` and `flags.csv` there, plus `load.json` after a real load.
- Process: the scripts write progress to stdout and stderr and call `process.exit` with code 1 or 2 when they refuse to run.

## Verification

- Run: `npm test`
