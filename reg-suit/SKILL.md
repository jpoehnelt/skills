---
name: reg-suit
description: Diagnose failing reg-suit visual regression checks, missing baselines, deleted-story alerts, and flaky captures. Use when a visual diff status fails, reports "No baseline found", or looks nondeterministic; use gh-ci-triage for other CI failures.
---

# Visual diff triage with reg-suit

Visual checks are commit statuses, not workflow jobs. "Re-run failed jobs" does not refresh them. Classify the failure from the sticky comment's machine-readable data before re-running or pushing.

Repo facts (from AGENTS.md): visual status context names, capture job name, reg-suit config path, sticky comment marker, local capture command, and how to force a scoped-out visual run.

## Read the sticky comment first

Fetch PR comments and locate the repo's reg-suit sticky comment. Parse its embedded `sha` and JSON counts (`changed`, `new`, `deleted`, `passed`) plus per-story `expected`, `actual`, and `diff` URLs.

1. If the comment `sha` differs from the PR head SHA, wait for or inspect the run for the current head.
2. Classify by `counts` and diff URLs, never by thumbnail previews alone.
3. If `"truncated": true`, fetch the full JSON report linked in the comment before classifying.

## Decision table

| Class | Signal | Action |
| --- | --- | --- |
| A. Real change | `changed` or `new` > 0 on surfaces this PR modified | Do not re-run. Post concise diff evidence and wait for human baseline approval. |
| B. Pixel noise | 1-2 untouched stories differ on subpixel, font, or animation jitter | Inspect the diff image. Re-run the capture job once; if it persists, stabilize the story or fixture. |
| C. Empty baseline | "No baseline found"; all stories `new`, 0 `passed` | Base commit on the default branch lacks a published baseline. Merge the default branch forward instead of re-running. |
| D. Deleted stories | `deleted` > 0 | Intentional removal needs human approval. Unexpected deletion signals a stale base or accidental revert; restore before merging. |
| E. Stale base | Diff shows changes already merged on the default branch | Merge the default branch forward. |
| F. Scoped out | Status says skipped with no relevant visual changes | Expected when no UI files changed. Use the repo's force trigger if visual proof is required. |

## Capture rules

- Size stories explicitly in pixels rather than viewport units (`min-h-screen`, `w-screen`, `100vh`) so iframe sizing stays deterministic. See `svelte-ui-delivery` for story structure.
- Register new visual stories in the repo's visual catalog in the same commit when auto-discovery is not enabled.
- Never approve baselines yourself or force-push over a stale base to hide `deleted > 0`.
- In unattended or headless runs, post the classification and diff evidence for Class A or intentional Class D changes, then stop with a clear human-gate blocker instead of waiting for interactive input.

## Verify

- Sticky comment `sha` matches the current PR head.
- Failure class (A-F) is stated with evidence before any re-run.
- Any `deleted > 0` count is explained and verified against the default branch.
- Baseline approval is left to a human reviewer.
