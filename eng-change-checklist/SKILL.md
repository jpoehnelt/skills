---
name: eng-change-checklist
description: Short checklist of engineering principles and pre-coding scope tripwires to apply before and after non-trivial work. Use when planning or reviewing a non-trivial change, debugging a stubborn failure, designing types or boundaries, or deciding how to sequence a migration.
---

# Engineering change checklist

Apply the items that fit. Each is a habit, not a ceremony. Repo-specific rules (test policy, compatibility-layer format, validation library, package ownership map, max recommended PR size) live in the repo's AGENTS.md or CLAUDE.md and win over this list.

## Scope tripwires (before coding)

Stop and write a 5 to 10 line scope checkpoint before implementing whenever the planned change would:

1. **Add public surface area:** a new MCP tool, CLI subcommand, HTTP endpoint, or workspace package. Check first whether an existing tool, flag, or check kind covers it.
2. **Add unrequested defensive UX or guards:** confirmation dialogs, version-sequence guards, feature flags, or fallback abstractions for hypothetical callers.
3. **Add or upgrade a dependency** during a `fix:` or small chore PR.
4. **Exceed single-PR focus:** estimated diff over 500 non-generated lines, more than one unrelated issue, 3 or more top-level packages, or a mid-PR expansion from a targeted fix into a redesign or refactor. Split follow-ups into separate issues and avoid stacking PRs deeper than 2.
5. **Collide with open work:** check open PRs (`gh pr list --state open --json number,title,files`) before editing shared entrypoints, layouts, or schemas.

Checkpoint format: **Goal** (one observable sentence), **Placement** (owning package via `comms-how` if unsure), **In scope / Out of scope** (including deferred cleanups), **Open-PR overlap**, and **Smallest viable diff** (every new module has a real caller in this PR). Ask for confirmation only when a requirement is ambiguous or adds unrequested public surface; in unattended or headless runs, choose the narrowest requirement-backed scope or fail fast with a clear blocker instead of waiting for input.

## Principles

- **Fix root causes.** Trace the symptom back to the first wrong decision and fix it there. A guard, retry, or clamp is a fix only when the state it handles is legitimate. Reproduce first, instrument instead of guessing, and fix every instance of the same fault.
- **Prove it works.** Check the real artifact: run the feature, read the actual value, inspect the diff. Do not accept "it compiles", a cached view, or an agent's self-report. Prefer a script a reviewer can re-run. If a check fails, suspect the observation method first.
- **Subtract before you add.** Remove dead code, redundant validators, and stubs first, then build on the simpler base. Design for observed usage, not speculative edge cases. Leave the design simpler than you found it.
- **"Unused" means unused by the whole stack.** In a stacked PR series or a slice with no caller yet, `git grep` open stacked branches and read the linked issue before deleting an export. If a sibling calls it or the issue requires it, keep it; if moved to a later slice, say so in the PR body.
- **A port keeps the old semantics.** When moving a read or write to a new store, runtime, or tool, match implicit behavior: overwrite rules, idempotent retries, emitted events, ordering, and authorization.
- **Every identity field has a reader that branches on it.** For each version, schema version, fingerprint, hash, generation, or cache-key part, name the code that compares it and branches when it differs. Delete fields no reader compares.
- **Narrowed populations compare like with like.** Every ratio, coverage, or diff check between two stores must apply the same predicate on both sides. Cite consuming code before stating user impact.
- **Migrate callers, then delete legacy APIs.** Move callers and delete the old API in the same change. Keep a compatibility layer only with a nearby `TODO` naming the legacy behavior, replacement, and verifiable removal condition.
- **Boundary discipline.** Validate untrusted data once at ingress with a schema library (Effect repos: `effect-boundary-validation`). Keep business logic pure and framework shells thin. Do not leak transport or storage types through public surfaces.
- **Type-system discipline.** Make illegal states unrepresentable. Brand ID-like primitives, parse external data into typed models, handle every variant exhaustively, and derive types from the authoritative schema.
- **Attack the premise.** When two or more fixes sharing one assumption fail the same gate, test the assumption directly before writing another fix. Prefer removing the condition over compensating for it.
- **Encode lessons in structure.** If you write the same instruction twice, make it a lint, type, test, or script. See `agents-correct`.
- **Sequence verifiable units.** Break work into small checkable units. Make operations idempotent: derive each step from current state, handle partial crashes, and write to a temp path before renaming.
- **Minimize reader load.** Inline single-caller wrappers and single-implementation adapters. Put each decision behind one source of truth; fewer lines beat boilerplate.

## Review checklist

- Scope tripwires were checked before coding; every new public surface, modal, guard, or dependency traces to an explicit requirement and every added module has a real caller.
- Open PRs were checked for overlap on shared layouts, entrypoints, or migrations.
- The change fixes the cause, proves behavior on the real artifact, and removes or simplifies rather than only adding.
- Nothing was deleted as unused that an open stacked branch calls or the issue scope requires.
- A port matches old implicit behavior; identity or version fields name the reader that branches on them.
- Checks comparing two stores filter both sides identically; no old path remains beside the new one.
- Validation sits at the boundary, types forbid bad states, steps are idempotent, and repeated lessons became structure.
