---
name: gh-pr-commit-review
description: Review new commits on open GitHub PRs against their actual base without stale or duplicate findings. Use for cutoff-based or scheduled review sweeps, stacked or rebased PRs, cleaning up review threads, or posting actionable inline findings. Read-only except comments and thread resolution.
---

# PR commit review

High-confidence, read-only review of net-new PR commits.

Repo facts (from AGENTS.md or CLAUDE.md): engineering rules and invariants to review against, cross-package or wire contracts, generated paths that must not be hand-edited, and required PR metadata (changesets, linked issues).

## Select candidates

1. Run [`scripts/review-candidates.sh`](scripts/review-candidates.sh) `<cutoff> [owner/repo]` with a UTC cutoff (`YYYY-MM-DDTHH:MM:SSZ`). It lists open PRs updated after the cutoff in the `origin` repo.
2. Review only PRs updated after the cutoff. If none changed, check open threads you own for fixes that landed.
3. If no PR or thread needs action, stop without writing to GitHub.

## Build the diff

1. Fetch the live head and the PR's actual base ref. A stacked PR's base is its parent branch, not the default branch. Refresh the base ref explicitly before diffing.
2. Review what is new since your last review, not commits dated after the cutoff: commit dates do not show when a branch was pushed. Take the `commit_id` of your latest review on the PR (`gh api repos/<owner>/<repo>/pulls/<n>/reviews`) and diff it to the live head. With no earlier review, review the full base-to-head diff. For a rebased series, `git range-diff <old-base>..<old-head> <new-base>..<new-head>` separates semantic changes from replay noise.

## What to flag

Correctness, authorization and tenant scoping, concurrency and races, data loss, retry safety, and contract drift (API and wire schemas, shared types, database schema). Also flag violations of the repo's own rules from AGENTS.md, such as hand-edited generated files or missing required metadata. Skip nits and speculation.

For an intent-based finding, cite the requirement source and classify it as this PR's deliverable, a preservation constraint, or a broader objective. Establish that it applies, give a concrete counterexample, and show that this PR introduces the violation or omits an explicitly promised fix. Keep unclear scope as a question, not a defect.

## Threads and findings

1. Re-read live threads and comments before posting. If the point is already raised, add nothing. Do not re-raise a resolved point.
2. Verify each finding against the current head, not an earlier commit.
3. Post one concise inline comment per finding on the exact changed line. No top-level approval or summary comment unless the API requires a review envelope.
4. Resolve a thread you own only when the latest head demonstrably fixes it, not merely because it is outdated. Batch resolutions.

## Boundary

Posting comments and resolving threads are external actions; without the user's authorization, return findings in chat. Never commit, push, rebase, or merge here. Deliver fixes through `gh-pr-feedback-loop`.

## Verify

- Each finding cites a line on the current head and a concrete failure mode.
- Only changes since your last reviewed head (or the full diff, if none) were reviewed, against the actual base.
- No duplicate of an existing thread.
- Resolved threads were verified fixed.
- No write to the repository, only comments and resolutions.
