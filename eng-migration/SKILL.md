---
name: eng-migration
description: Run and finish codebase migrations with ast-grep rules, ignore lists, shortcut bans, and a throwaway skill. Use when migrating a repo to a new pattern or library, replacing an old API across many files, or finishing a stalled migration.
---

# Codebase migrations

Coding agents stop when their check script passes, even when 5% to 25% of old code remains. Unmigrated files still compile and pass tests. An unfinished migration leaves two ways to do everything, and later agents copy the old one. Pair `ast-grep` rules that force completion with a throwaway skill that prevents shortcuts.

Repo facts (from AGENTS.md or CLAUDE.md): where `ast-grep` config and rules live, the check, typecheck, and test commands, shared foundation packages, the permanent skill, and CI checks.

## 1. Pick one pattern and ban the old one

Migrate one convention at a time instead of whole packages from a broad prompt.

1. Pick one target convention, such as reading time from a clock service or using one tagged error per failure.
2. Write one `ast-grep` rule with `severity: error` for the old pattern so any new match fails CI. `ast-grep` matches the syntax tree, so formatting and variable names do not change what matches.
3. Put every existing matching file path in the rule's `ignores` list. That list is the to-do list. Delete each path as you fix the file, and never append new paths to `ignores`.
4. Ban unverified inline exemption comments, such as numbered ignore IDs. Agents invent fake IDs to pass scans.

Style linters check target-framework style, not migration progress. Track migration progress in `ast-grep` rules.

## 2. Ban shortcuts and migrated slop

A pattern rule says what fails the scan, not what replaces it. With rules alone, agents clear the scan with the smallest edit that removes the old syntax.

- Add shortcut rules beside each pattern rule. Ban known shortcuts for your stack, such as `Effect.promise` on calls that can reject, `Effect.orDie`, cause-dropping error mappers, and catch-all error classes.
- Ban both the old bug and its migrated form. Agents copy existing bugs into new syntax, such as rewriting `.catch(() => [])` into `Effect.orElseSucceed(() => [])`. Match both in the rule.
- Update the permanent skill and rules together. When review catches a new bad pattern or shortcut, add one line to the permanent skill and one `ast-grep` rule in the same change. See `agents-correct`.
- Removing silent fallbacks can raise reported errors until you handle those failure paths. Fix the failures instead of hiding them again.

## 3. Put completion in one check script

1. Run `ast-grep scan`, the type checker, the original tests, and release checks in one check script so a passing run means the migration is complete.
2. Keep the check script, `ast-grep` rules, and original test files outside the paths the agent edits. After an unattended run, verify none of them changed.
3. Run `ast-grep` on each edited file during the run (for example from a post-edit hook) instead of waiting until the end.

## 4. Protect public interfaces in three places

Agents change public function signatures to satisfy rules unless you list which functions to keep. Code comments such as `// synchronous on purpose` do not stop an agent when the prompt tells it to migrate.

List every preserved public function in all three places:

- The migration prompt.
- The `ast-grep` rule's `ignores` list or scoped exclusion.
- The throwaway skill, with an example showing how to wrap callers whose tests expect the old contract.

## 5. Keep permanent and throwaway skills separate

Keep two skills so agents stop reading migration steps after the old code is gone:

- **Permanent skill.** State finished conventions for new code only, with no old-to-new steps. A permanent skill alone will not finish a migration.
- **Throwaway skill.** Teach the move for one migration, and delete it in the PR that empties `ignores`.

Give every throwaway skill five parts (see [references/templates.md](references/templates.md) for starter files):

1. An old-to-new table and worked examples, including how to wrap preserved public interfaces.
2. A shared foundation contract with a stop line. List the shared services and helpers leaf modules must use. Tell the agent to stop and report any missing shared code instead of building a local copy inside a leaf module.
3. A "Never" list naming the shortcuts, dual exports, and bad patterns to avoid.
4. A fallback comment rule requiring a short comment explaining why on every catch that turns a failure into a default or success value.
5. One module or file slice per PR, so each PR holds few product decisions (such as what a view shows when a read fails). Remove each migrated file from `ignores` in the same PR.

## 6. Finish the migration

1. Delete the throwaway skill in the PR that empties `ignores`.
2. Keep the `ast-grep` rules in CI with `ignores` removed so agents cannot reintroduce the old pattern or shortcuts.
3. Delete retired dependencies, dual exports, and compatibility shims, and prove the removal with `eng-cutover-verification`.

## Review checklist

- Every old pattern and known shortcut has an `ast-grep` error rule in CI.
- Remaining files sit only in `ignores`, with no unverified inline exemptions.
- One check script runs `ast-grep`, the type checker, and the original tests, and none of them were weakened.
- Every preserved public function is listed in the prompt, `ignores`, and the throwaway skill.
- The throwaway skill is separate from the permanent skill and includes old-to-new examples, a stop line for missing shared code, a "Never" list, and a fallback comment rule.
- Each PR shrinks `ignores` without adding new entries or local copies of shared code.
- The final PR deletes the throwaway skill, keeps the `ast-grep` rules in CI, and verifies retirement with `eng-cutover-verification`.
