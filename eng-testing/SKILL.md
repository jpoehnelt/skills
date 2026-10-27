---
name: eng-testing
description: Decide whether a change needs a test, where it lives, what it asserts, and which check to run before calling it done. Use when adding, moving, or reviewing a unit, component, integration, story, or end-to-end test, or choosing the smallest check to run before a PR.
---

# Testing

A test earns its place by catching a regression a reviewer would miss. Most changes are proven by types, lint, rendering the component, or running the app; a new test is the exception.

Repo facts (from AGENTS.md or CLAUDE.md): the test policy (when a test is required, allowed, or discouraged), the runner and file pattern per package, shared test helpers and in-memory fakes, the lint rules that enforce test hygiene, the story or visual-test limits, which CI stage runs which tests, and the check commands from one file up to the pre-PR suite. The repo's policy wins over this skill. Before writing a test, search the installed skills for one that covers testing in the framework or runtime the code uses, and follow its helpers and patterns alongside this one.

## Decide whether to write one

- Write a test where a branch's behavior is uncertain or a past bug could return. Before writing it, ask whether the code can be split until the branch is obvious, or flagged for manual review in the PR. Prefer either when the repo's policy discourages tests.
- Skip tests that restate the implementation, check that something exists, cover a state the type system already forbids, or mostly exercise mocks.
- For a bug fix with a cheap regression path, follow `eng-tdd`.

## Where it lives

- Beside the code it covers (`foo.ts` and `foo.test.ts`), unless the repo puts tests in one tree.
- In the package or module that owns the code. Tests left at the app level cover integration and runtime boundaries (wiring, startup manifests, routing), not another package's internals. When code moves, its tests move in the same change.
- A pure lookup or format module gets one table test of accepted and rejected inputs.

## What it asserts

- Arrange, Act, Assert; one behavior per test.
- Assert a specific value, status, error type, or schema contract. "Is defined" and "is not null" pass for the wrong value.
- Component tests assert behavior, contracts, and accessibility semantics (roles, names, states), never CSS classes, styling, or raw markup. Visual checks belong in rendered stories or screenshot tests.
- No focused or skipped tests (`.only`, `.skip`) in a commit.

## Make it deterministic

- Provide dependencies as in-memory fakes that behave like the real ones, not hand-built mocks of client calls.
- Control time and randomness through an injected clock and random source, not by stubbing globals.
- Test failure paths, retries, cancellation, and cleanup where their behavior is uncertain; do not test the framework's plumbing.

## Stories and end-to-end tests

- Keep component stories bounded: one gallery or matrix story for visual variants and at most one interaction story for state, keyboard, or focus. No story per minor variant.
- End-to-end tests cover critical user journeys only. Know which CI stage runs them and how to force a run.

## Run the smallest check

Run one file, then the changed packages, then the repo's pre-PR suite. Use the repo's task runner rather than a bare test binary when it builds dependencies or generated types first. Know which tests the PR's CI skips, and say in the PR which checks ran.

## Review checklist

- Each new test covers an uncertain branch or a past bug; otherwise it is deleted or the code is simplified.
- Tests sit beside the code, in the module that owns it, and moved with it.
- Every assertion names a value or contract; none is vacuous, styling-based, focused, or skipped.
- Time, randomness, and services come from fakes and an injected clock.
- Story count stays bounded.
- The PR names the checks that ran.
