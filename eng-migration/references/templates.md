# Migration templates

Starter files for `eng-migration`. Replace the example patterns, paths, and commands with the ones from your repo.

## Pattern rule with an ignore list

Write one rule per old pattern. Delete entries from `ignores` as each file is fixed. Never append new paths.

```yaml
id: no-date-now-in-effect
language: TypeScript
severity: error
message: Use Clock instead of Date.now() inside Effect.gen.
rule:
  pattern: Date.now()
  inside:
    pattern: Effect.gen($$$)
    stopBy: end
ignores:
  # Delete each entry once the file is migrated.
  - packages/cache/src/store.ts
  - packages/jobs/src/scheduler.ts
```

## Shortcut and migrated-slop rule

Match both the old bug and the migrated version that keeps the same bug.

```yaml
id: no-silent-empty-array-fallback
language: TypeScript
severity: error
message: Do not swallow read failures into an empty array. Handle or propagate the typed error.
rule:
  any:
    - pattern: $READ.catch(() => [])
    - pattern: Effect.orElseSucceed(() => [])
ignores:
  # Delete each entry after deciding how the caller handles a failed read.
  - apps/web/src/routes/members.ts
```

## Check script

Run `ast-grep`, the type checker, and the original tests in one script outside the paths the agent edits.

```bash
#!/usr/bin/env bash
set -euo pipefail

ast-grep scan --config sgconfig.yml
pnpm run typecheck
pnpm run test
```

## Throwaway skill

Put this file in the repo's local skills folder (for example `.agents/skills/<scope>-migration/SKILL.md`) and delete it in the PR that empties `ignores`.

````markdown
---
name: <scope>-migration
description: Migrate <old pattern> to <new pattern> one module at a time and shrink the ast-grep ignores lists. Temporary. Delete when ignores is empty. Use when migrating <scope> files off <old pattern>.
---

# <Scope> migration (temporary)

Move `<scope>` files from `<old pattern>` to `<new pattern>` and shrink the `ast-grep` `ignores` lists. Delete this skill in the PR that removes the last `ignores` entry.

## Preserved public interfaces

Keep the exported signature and throw behavior of these functions unchanged. Wrap the new implementation at the boundary so callers and existing tests keep working:

- `packages/<pkg>/src/public.ts`: `export function legacyHelper(...)`

## Shared foundation contract

Use these existing shared services and helpers from `<foundation-pkg>`:

- `<ServiceA>` from `<foundation-pkg>/service-a`
- `<errorMapper>` from `<foundation-pkg>/errors`

If a required shared service or helper is missing, stop and report it. Do not build a local copy or workaround inside a leaf module.

## Old to new

| Old pattern | Replacement | Notes |
| --- | --- | --- |
| `<old call>` | `<new call>` | Preserve original error as `cause`. |
| `<old throw>` | `<typed error>` | One tagged error per failure mode. |

### Worked example

```ts
// Before
async function loadItem(id: string) {
  return await fetchItem(id);
}

// After
const loadItem = (id: string) =>
  Effect.gen(function* () {
    const store = yield* ItemStore;
    return yield* store.get(id);
  });
```

## Never

- Never wrap a call that can reject in a helper that hides rejections as untyped crashes (for example `Effect.promise` or `Effect.orDie`).
- Never drop the original error cause when mapping errors.
- Never replace a specific error with a catch-all error class.
- Never keep a second legacy export beside the migrated export unless it is listed under Preserved public interfaces.
- Never add paths to `ignores` or add inline suppression comments.
- Never edit `sgconfig.yml`, rule files, the check script, or original tests to pass a check.

## Deliberate fallbacks

When a catch turns a failure into a default or success value on purpose, add a one-line comment above it saying why.

## Steps per PR

1. Pick one module or file slice from the rule `ignores` lists.
2. Migrate the file using the table and worked example above.
3. Remove the migrated file path from each relevant rule's `ignores` list.
4. Run the check script and fix every reported match, type error, and test failure.
5. Open one small PR per module so any product decision on failure handling stays small.
````
