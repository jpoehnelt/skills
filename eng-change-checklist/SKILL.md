---
name: eng-change-checklist
description: Short checklist of engineering principles to apply before and after non-trivial work. Use when planning or reviewing a non-trivial change, debugging a stubborn failure, designing types or boundaries, or deciding how to sequence a migration.
---

# Engineering change checklist

Apply the ones that fit. Each is a habit, not a ceremony. Repo-specific rules (test policy, compatibility-layer format, validation library) live in the repo's AGENTS.md or CLAUDE.md and win over this list.

## Principles

- **Fix root causes.** Trace the symptom back to the first wrong decision and fix it there. A guard, retry, or clamp is a fix only when the state it handles is legitimate. Reproduce first, instrument instead of guessing, and fix every instance of the same fault.
- **Prove it works.** Check the real artifact: run the feature, read the actual value, inspect the diff. Do not accept "it compiles", a cached view, or an agent's self-report. Prefer a script a reviewer can re-run. If a check fails, suspect the observation method first.
- **Subtract before you add.** Remove dead code, redundant validators, and stubs first, then build on the simpler base. Design for observed usage, not speculative edge cases. Leave the design simpler than you found it.
- **"Unused" means unused by the whole stack.** In a stacked PR series or a slice with no caller yet, a search of one branch cannot prove a parameter or export is dead. Before deleting one, `git grep` it on every open branch stacked on this one and read the linked issue's scope. If a sibling calls it or the issue requires it, keep it. If you still cut it, say in the PR body that it moved to a later slice.
- **A port keeps the old semantics.** When moving a read or write to a new store, runtime, or tool, list what the old path did implicitly and check the new one does it too: overwrite rules, idempotent retries, emitted events, ordering, authorization. Examples: an upsert overwrites, so an append-only replacement needs a latest-wins read and an idempotent retry; a deploy tool that replaces every binding drops one that was only set by hand; a capability bound to a no-op in the new runtime drops its events.
- **Migrate callers, then delete legacy APIs.** When a new internal API replaces an old one, move all callers and delete the old API in the same change. Update tests to the new contract and delete tests that only protect old internals. Keep a compatibility layer only with a nearby TODO naming the legacy behavior, its replacement, and a verifiable removal condition.
- **Boundary discipline.** Validate and narrow untrusted data once, at the boundary where it enters (CLI, config, network, external APIs), with a schema library (Effect repos: `effect-boundary-validation`). Inside, trust the types and propagate errors. Keep business logic in pure functions and the framework shell thin. Do not leak transport or storage types through public surfaces.
- **Type-system discipline.** Make illegal states unrepresentable. Brand ID-like primitives, parse external data into typed models, handle every variant exhaustively, and derive types from the authoritative schema instead of hand-rolling copies.
- **Attack the premise.** When two or more fixes sharing one assumption fail the same gate, write the assumption down and test it directly before writing another fix. Prefer removing the condition over compensating for it.
- **Encode lessons in structure.** If you write the same instruction twice, make it a lint, type, test, or script. Use more text only for judgment calls, with an example of the failure. See `agents-correct`.
- **Sequence verifiable units.** Break multi-step work into small units that each end in a checkable state. Verify each before the next. Order commits so each leaves the repo green and the sequence proves itself: a failing repro (a test only where behavior is uncertain, or as the repo's test policy says), then the fix.
- **Make operations idempotent.** Derive each step from current state, not from what the last run intended. Ask what happens if it runs twice and if the last run crashed halfway. Make leftovers (locks, temp files, claimed jobs) recognizable as stale. Write to a temp path and rename.
- **Minimize reader load.** Count the layers between a question and its answer, and the state a reader must hold. Inline wrappers with one caller and adapters with no second implementation. Prefer pure functions, then locals, then fields, then module state. Name an invariant once, at the boundary.
- **Laziness protocol.** Put each decision behind one source of truth. Make the smallest change that solves the problem. Fewer lines beat elegant boilerplate.

## Review checklist

- The change fixes the cause, not only the symptom.
- Evidence came from the real artifact, with a re-runnable check.
- Something was removed or simplified, not only added.
- Nothing was deleted as unused that an open stacked branch calls or the issue scope requires.
- A port matches the old path's implicit behavior: overwrite versus append, idempotent retry, emitted events, bindings.
- No old path or caller remains beside the new one.
- Validation sits at the boundary, and types forbid the bad state.
- Each step is checkable and safe to run twice.
- A repeated lesson became structure, not another paragraph.
