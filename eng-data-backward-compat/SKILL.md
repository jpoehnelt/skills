---
name: eng-data-backward-compat
description: Evolve schemas, persisted rows, idempotency receipts, canonical keys, and SQL migrations without breaking existing production data. Use when tightening validation, changing hash or fingerprint inputs, altering SQL constraints or foreign keys, backfilling data, or querying variable-length IN lists on SQLite, D1, or Postgres.
---

# Data backward compatibility

Tests on an empty database miss every bug that only exists against yesterday's production rows. Assume old rows, cached receipts, and N-1 writers are live during every deploy. Use `drizzle-postgres` for Drizzle and PostgreSQL command mechanics, and `eng-state-machine` for guarded lifecycle writes.

Repo facts (from AGENTS.md): schema and migration paths, populated N-1 migration fixture test command, database engine limits (SQLite or D1 bind cap, Postgres lock timeout), and where `Write`, `Stored`, and `Wire` schemas live.

## Separate Write, Stored, and Wire schemas

- **Never tighten a shared schema used to decode historical rows.** Split strict ingress validation (`Write*`) from tolerant persisted-row decoding (`Stored*`) and external output (`Wire*`). Tightening a field (non-blank strings, new ISO timestamps, narrower enums) breaks reads of rows already on disk unless you backfill first or decode both forms.
- **Keep DB constraints and app schemas synchronized.** When relaxing or tightening a TypeScript schema, update SQL `CHECK`, `NOT NULL`, and enum constraints in the same PR and run a round-trip test against the real database engine.

## Version fingerprints, receipts, and canonical keys

- **Never silently change a hash or idempotency fingerprint input.** Tag new formats with an explicit version prefix (for example `fp2:`) and verify legacy receipts against the old format until the retention window expires.
- **Key renormalizations need a migration plan.** Changing how a URL, ref, or ID is normalized orphans existing rows, webhook filters, and receipts unless you ship an idempotent backfill or boot renormalizer.
- **Check cascade order before merging duplicate keys.** Updating child rows after deleting a parent with `ON DELETE CASCADE` destroys the children. Repoint children first inside one transaction, then delete the obsolete parent.

## Respect database engine hazards

- **SQLite, D1, and Durable Object bind limits:** chunk any dynamic `IN (...)` or bulk `INSERT` safely below the 100-parameter cap (for example batch size 50 to 80).
- **SQLite ID reuse:** use `ON DELETE SET NULL` or explicit tombstones rather than letting deleted integer primary keys be reused and silently reattached to old event rows.
- **Lock and DDL ordering:** acquire multi-row locks (`FOR UPDATE`, `FOR SHARE`) in one deterministic order (table hierarchy, then sorted key). Guard startup DDL with advisory locks or run migrations out of band so concurrent instances do not deadlock.
- **Expand and contract:** add nullable columns or new enum values first, deploy readers, backfill existing rows, and enforce `NOT NULL` or drop legacy filters in a later release.

## Verify

- Run the migration against a **populated N-1 fixture** containing legacy rows, blank or pre-format fields, active webhook filters, and unexpired idempotency receipts, not only a fresh empty database.
- Prove chunked queries handle more than 100 items without hitting bind limits.
- Confirm every tightened rule either splits `Write` from `Stored` or ships a verified backfill.
