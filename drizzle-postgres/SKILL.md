---
name: drizzle-postgres
description: Change, generate, push, and verify PostgreSQL schemas managed with Drizzle ORM, including PostGIS exclusions and schema verification. Use when adding or altering tables, columns, enums, indexes, or foreign keys, or debugging drizzle-kit push or migration CI failures.
---

# Database schema with Drizzle and PostgreSQL

Treat the schema package as the single source of truth for tables, enums, constraints, and relations.

Repo facts (from AGENTS.md): schema package path and entrypoints, build, generate, push, and migrate commands, post-push schema verification script, pre-push script path, secret-injection wrapper and env vars, PostGIS usage, and CI migration job.

## Change the schema

1. Edit or add the domain table file, re-export it from the package's schema entrypoint, and update relations when needed.
2. Scope every tenant-owned table by its owning tenant identifier and index the columns queries filter on.
3. Build the schema package first when `drizzle.config` reads compiled output (`dist/`), then generate the SQL migration file. Generation does not require a live database.
4. Apply the change to a local database you own. Require explicit authorization before running migrations against shared or production databases.
5. When a transition cannot be expressed by `drizzle-kit push` (such as a column rename or adopting an existing constraint), add an idempotent step to the repo's pre-push script with a `TODO` naming its removal condition.

## Hazards

- `drizzle-kit push` can exit 0 after SQL errors. Read its output, and run a post-push schema verification check against the live catalog so any missing table, column, key, constraint, or index fails the migration. Extend that verification through the schema, never by hand-editing expectations.
- A composite foreign key must reference a `unique()` constraint rather than a `uniqueIndex()`. `drizzle-kit push` creates indexes after foreign keys, so referencing a unique index fails on fresh databases.
- When PostGIS is installed, keep PostGIS system tables excluded via `tablesFilter` in `drizzle.config`. Generated columns and PostGIS column types can re-diff on every push, so a type diff alone does not prove a failure.
- Never renumber, edit, or delete an applied migration file, even when existing migration numbering has gaps or duplicates.
- Keep one scoped connection pool in the database service. Keep `DATABASE_URL` in the secret store, never print or commit it, and redact connection URLs in logs.

## Verify

- Type check the schema package and every app that imports it.
- Push to a fresh local database and confirm schema verification passes with no missing objects.
- Inspect the generated SQL migration so it matches the schema change and nothing else.
- Check CI migration step summaries first when a remote migration fails; verification errors name the exact missing objects.
