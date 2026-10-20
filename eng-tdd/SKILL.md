---
name: eng-tdd
description: Fix a bug test-first when there is a clear, cheap regression test path. Use when the user asks for TDD, a failing test, or a regression test, or when the bug has an obvious cheap local test target.
disable-model-invocation: true
---

# TDD bug fix

Repo facts (from AGENTS.md or CLAUDE.md): the test policy (some repos require coverage for every behavior change, others allow a test only where a branch's behavior is uncertain), the test runner per package, and the single-test command. Follow the policy; when it rules out a new test, skip to the closest executable check below.

When the test path is clear and cheap, make the broken behavior executable before changing production code. The goal is a focused regression test that fails before the fix and passes after it.

Do not force a test when it is impractical: broad harness setup, brittle mocks, slow end-to-end infrastructure, production-only state, vague reproduction steps, or large unrelated fixture churn. Use the closest useful verification instead.

## Workflow

1. **Understand the bug.** Identify intended behavior, current behavior, the affected path, and the smallest observable reproduction.
2. **Choose the narrowest executable check.** Prefer the unit, component, or integration test style already used for that code, in the location the repo uses (often colocated as `foo.test.ts`), run with the repo's single-test command. If no practical path is obvious, do not create one just to satisfy the workflow.
3. **Write the failing test first.** Add the smallest test that would have caught the bug. It encodes intended behavior, not the current implementation.
4. **Run it before fixing.** Confirm it fails for the intended reason. If it passes or fails for an unrelated reason, correct the test first.
5. **Fix the bug.** Make the smallest production change that satisfies the intended behavior and keeps nearby contracts.
6. **Rerun the test.** Confirm it passes.

## If a failing test is impractical

Use the closest executable check: a targeted script, a manual reproduction command, browser automation, a snapshot comparison, or a focused integration check.

Prefer no new test over a bad test. A bad test mostly tests mocks, encodes implementation details, depends on timing or global state, needs expensive infrastructure for a small fix, or would be deleted right after proving the fix.

## Guardrails

- Do not change tests to match a wrong implementation.
- Do not weaken assertions unless the expected behavior genuinely changed and you can say why.
- Keep the test focused on the bug. No fixture churn or unrelated coverage.
- If the bug is flaky, make the test deterministic and document the signal it locks down.
- If the bug exposes a broader class of failures, land the focused regression first, then consider sibling coverage.

## Verify

- Name the check that failed before the fix and the failure it produced.
- Name the passing run after the fix and any nearby validation.
- If failing-before evidence is missing, say why and name the closest check used.
