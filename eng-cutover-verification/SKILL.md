---
name: eng-cutover-verification
description: Prove a migration, module split, library swap, datastore or deploy-tool cutover, compatibility removal, or multi-PR cleanup is complete. Use when retiring paths, adapters, dependencies, generated outputs, or config, validating merged main, or proving a rebase preserved a patch series.
---

# Cutover verification

Prove the retired surface is gone, the replacement is adopted, and the integrated build passes.

Repo facts (from AGENTS.md or CLAUDE.md): the compatibility promise (whether old paths may coexist and how a retained shim is marked), check and test commands, generated artifacts and how to refresh them, cross-package contracts, the local dev or health endpoints a live check can probe, and who owns deploy and rollback procedures.

## Declare the proof first

Before editing, write down:

- Retired paths, symbols, imports, dependencies, and config keys that must disappear (for example a removed config file, an old import, a script name).
- The replacement and where it is composed (package `exports`, deploy config, a task-runner task).
- Focused tests that prove behavior is preserved. For datastore cutovers, include the test harnesses and store unit tests.
- Generated artifacts to refresh.

Encode the proof with [`scripts/cutover-audit.sh`](scripts/cutover-audit.sh). It is read-only: it searches tracked files and runs only the commands you pass, from the repo root, each bounded by `--timeout` (default 900 seconds).

```bash
<skill-dir>/scripts/cutover-audit.sh \
  --retired 'old config file:::service/legacy.toml:::.' \
  --retired 'old import:::src:::from "old-lib"' \
  --required 'replacement:::src/lib:::from "new-lib"' \
  --test 'service:::pnpm turbo run check test --filter=<pkg>' \
  --live-check 'health:::curl --connect-timeout 5 --max-time 15 -fsS http://localhost:<port>/ready' \
  --final
```

Each spec is `label:::value`; searches are `label:::git-pathspec:::extended-regex`. `--retired` fails while the regex still matches tracked files in the pathspec, and passes when the pathspec has no tracked files left but was tracked earlier in history; a pathspec that never matched anything fails as a likely typo. `--required` fails when nothing matches. `--final` belongs on the integration branch: it also needs a clean tree and at least one `--live-check`.

Repo search alone never proves live state. A removed reference says nothing about what is deployed or running; probe the real thing (a health endpoint, `docker ps`, the deployed service, a deploy plan diff) with a live check.

## Complete the cutover

1. Move every caller, including every consumer of a cross-package contract, to the replacement.
2. Delete obsolete barrels, adapters, aliases, scripts, `exports` entries, configs, and dependencies in the same change. A retained shim needs a `TODO` naming the legacy behavior, its replacement, and its removal condition.
3. Retired dependencies must be gone from every manifest (`package.json`, `Cargo.toml`, and so on) and lockfile. Update task-runner inputs, generated artifacts, and CI steps with their callers.
4. Scope retired-name searches to active source, config, and workflows. Changelogs, changesets, and migration history may legitimately keep old names.
5. Preserve implicit behavior across runtime or storage moves (`eng-change-checklist`). Confirm dependent stacked PRs before declaring a symbol unused.
6. Verify live usage and blast radius (`eng-blast-radius`) before removing persistence or provider dependencies. Include deploy provisioning and seed generators in retired-store audits, and check the real migrate-then-seed sequence against isolated, non-production stores.

## Retired stores and deploy resources

Keep historical schema migrations, and keep a rollback release compatible with the surviving stores. Never restart a retired writer after switching authority. A retired deploy resource may be retained in production by the deploy tool; read the deploy plan before removing a binding, class, or domain. Remote and production changes need explicit authorization.

## Verify integration

- Run the repo's full check, test, and build commands for generation, contract, or dependency cutovers.
- After a batch of PRs merges, rerun the audit on the merged default-branch commit to confirm nothing was reintroduced.
- For a rebased or replayed series, `git range-diff <base>..<old-tip> <new-base>..<new-tip>` must show only intended changes. Treat any `!` entry as a semantic change to review.
- Confirm live state with `--live-check` evidence, not the diff.

## Review checklist

- Every retired item has a passing `--retired` assertion and no leftover in manifests or the lockfile.
- Every replacement has a `--required` assertion and a test.
- Test harness layers match the production driver on type parsing and error causes.
- Live state was checked, not only the repository.
- Merged main was re-audited, not just the branch; a rebased series was compared with `git range-diff`.
