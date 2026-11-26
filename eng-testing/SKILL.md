---
name: eng-testing
description: Decide whether a change needs a test, where it lives, what it asserts, and which check to run before calling it done. Use when adding, moving, or reviewing a unit, component, integration, story, or end-to-end test, or choosing the smallest check to run before a PR.
---

# Testing

Add a test when it would catch a regression a reviewer would miss. Types, lint, a rendered component, or a run of the app prove most changes without one.

Repo facts (from AGENTS.md): the test policy (when a test is required, allowed, or discouraged), the runner and file pattern per package, shared test helpers and in-memory fakes, the lint rules that enforce test hygiene (such as banning ambient clocks, random UUIDs, or source-file reads in tests), the story or visual-test limits, which CI stage runs which tests, and the check commands from one file up to the pre-PR suite. The repo's policy wins over this skill. Before writing a test, search the installed skills for one that covers testing in the framework or runtime the code uses, and follow its helpers and patterns alongside this one.

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
- Never read production source files (`readFileSync('src/...')`) to grep CSS, classes, or markup in unit tests; assert rendered or runtime behavior instead.
- No focused or skipped tests (`.only`, `.skip`) in a commit.

## Property, fuzz, and differential tests

- For parsers, URL normalizers, or pattern matchers, pair example tests with property or fuzz tests (such as `fast-check`) asserting idempotence (`normalize(normalize(x)) === normalize(x)`), a strict anti-ReDoS latency bound (under 10ms on repeated delimiters or wildcards), and an adversarial corpus (empty strings, quoted syntax, XML namespaces, HTML comments, non-ASCII UTF-8, trailing slashes, uppercase hosts, and prototype keys).
- For state machines or snapshot-plus-stream projectors, add a differential parity test (`project(snapshot) === project(applyEvents(init, log))`); see `eng-state-machine`.

## Make it deterministic

- Provide dependencies as in-memory fakes that behave like the real ones, not hand-built mocks of client calls.
- Control time and randomness through an injected clock and random source, not by stubbing globals. Enforce this with the repo's lint rule banning ambient `Date.now()`, `new Date()`, and `crypto.randomUUID()` in tests.
- Test failure paths, retries, cancellation, and cleanup where their behavior is uncertain; do not test the framework's own behavior.

## Debugging and probe discipline

- Cap ad-hoc inline shell probes (`node -e`, `tsx -e`) at 2 attempts. If a probe fails twice, stop guessing: read the module's actual exports or write a focused test file.
- List or glob files before running batch reads so you never burn turns on guessed paths. Pass raw filesystem paths for framework route groups (such as `(app)/+page.svelte`), never URL-encoded paths (`%28app%29`).

## Stories and end-to-end tests

- Keep component stories bounded: one gallery or matrix story for visual variants and at most one interaction story for state, keyboard, or focus. No story per minor variant.
- End-to-end tests cover critical user journeys only. Know which CI stage runs them and how to force a run.

## Run the smallest check

Run one file, then the changed packages, then the repo's pre-PR suite. Use the repo's task runner rather than a bare test binary when it builds dependencies or generated types first. Know which tests the PR's CI skips.

## Review checklist

- Each new test covers an uncertain branch or a past bug; parsers and projectors have property or differential tests where warranted.
- Tests sit beside the code, in the module that owns it, and move with it.
- Every assertion names a value or contract; none reads `src/` files to grep markup/CSS, or is vacuous, styling-based, focused, or skipped.
- Time, randomness, and services come from fakes and an injected clock (no ambient `Date.now()`, `new Date()`, or `crypto.randomUUID()`).
- Ad-hoc probes stayed at 2 attempts or fewer, and story count stays bounded.
