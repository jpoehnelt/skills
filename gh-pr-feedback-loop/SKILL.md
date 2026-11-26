---
name: gh-pr-feedback-loop
description: Publish a GitHub pull request and carry it through CI, review feedback, rebases, and merge readiness, merging only with explicit authorization. Use when opening or updating a PR, addressing review comments, monitoring checks, rebasing, running /ship autopilot, or continuing a PR to a terminal state. For read-only review of new commits, use gh-pr-commit-review.
---

# PR feedback loop

Carry a PR from creation to a clean head. Merge only with explicit authorization. Prefer `gh` CLI over flaky GitHub MCP wrappers.

Repo facts (from AGENTS.md or CLAUDE.md): validation and check commands, commit and PR title conventions, PR template, required PR metadata (linked issue or ticket, changeset or change note), expected automated reviewers and timeout, post-merge live URLs for web apps, and which gates need a human.

## Establish live state

1. Run [`scripts/pr-snapshot.mjs`](scripts/pr-snapshot.mjs) `<pr-number-or-url> [owner/repo]`. It prints the summary block (`head_sha`, `draft`, `branch_reused_from_pr`, `failing_checks`, `pending_checks`, `unresolved_threads`, `codex_reviewed_head_sha`, `bot_quota_active`), check runs, commit statuses, reviews, unresolved review threads, and comments.
2. Read unresolved review threads before changing anything. Inline comments carry no resolved state; if the script cannot read threads, use `gh api graphql` or the web UI.
3. Run `git status --short` and confirm the actual base branch. Stacked PRs do not target the default branch.

## Publish

0. **Fresh branch first.** Before creating or pushing a PR, verify the branch has no prior merged PR (`pr-snapshot.mjs` `branch_reused_from_pr` or `gh pr list --head <branch> --state merged`). Never reuse a branch after a squash merge; cut a fresh branch from `origin/<base>` (`git switch -c <new> origin/<base>`). Never open a PR whose diff deletes files added on `origin/<base>` since the merge-base.
1. Use the repo's commit and PR title convention (often Conventional Commits). Keep a PR to one concern; stack PRs only when one truly depends on another.
2. Fill the PR template and required metadata. Describe the observable change (`comms-impact`) and the validation you ran (`comms-technical-writing`).
3. Run the narrowest sufficient validation from AGENTS.md, then the repo's pre-PR gate, before pushing.
4. For non-trivial changes (>200 LOC or touching security, state, migrations, or UI), run `comms-interrogate` locally and open the PR as **Draft** until local checks and interrogation fixes land. Mark Ready for Review once the head is ready for CI review bots.
5. If `gh pr edit` fails on a GraphQL error, update the body with `gh api repos/<owner>/<repo>/pulls/<n> -X PATCH -f body=...`.

## Loop

While checks are running, use `gh run watch <run-id> --exit-status` (bounded by a timeout) or schedule a ~10-minute check-in; never run tight `sleep` polling loops.

Each iteration:

1. Refresh `pr-snapshot.mjs`; list failing checks and unresolved threads on the current head SHA. Ignore pure informational bots (`changeset-bot`, preview URL or status-only bots) that carry no actionable review feedback.
2. Route CI failures to `gh-ci-triage`, visual-diff failures to `reg-suit`, and retired-path or migration proofs to `eng-cutover-verification`. Route deploy and secret failures to the repo's deploy guidance.
3. Collect every actionable finding from all active reviewers on the current head SHA, apply and validate all fixes locally, and push **once per review round**. Never push per-finding commits.
4. Use `--force-with-lease` only after rebasing a branch you own; on someone else's branch, merge the base instead. After a rebase, run `git range-diff <old-base>..<old-head> <new-base>..<new-head>` to confirm only intended changes moved.
5. If a workflow pushes bot commits to the branch, `git pull --rebase` before the next push.
6. Re-read threads before replying so you do not answer twice. Reply on each addressed thread, and resolve only threads you were asked to own. If a reply fails with "one pending review per pull request", submit or delete the pending review rather than falling back to a top-level comment.
7. Before posting a bot trigger command (such as `/gemini review`), check `bot_quota_active` in `pr-snapshot.mjs`. If that bot reported a daily quota or rate limit within 24 hours, do not re-trigger it.
8. When posting a recurring status or triage summary, upsert one comment via a unique HTML marker (`<!-- <agent>-summary -->`) instead of appending duplicate comments.
9. Keep the PR body and linked issue scope accurate after scope changes. Every push resets SHA-bound approvals; finish copy and body edits before pushing.

## Autopilot mode (`/ship`)

When invoked to ship a worktree end to end:

1. Ensure a fresh branch, run pre-PR validation, and auto-open the PR (Draft-first when >200 LOC or high-risk, then Ready for Review).
2. Stay in the loop across multiple bot review rounds until checks pass, every thread is resolved, and a quiet window passes after the last push with no new findings.
3. Merge only when explicitly authorized; wait for merge-queue checks to pass. For web apps, probe the deployed live URL after merge to confirm the new release serves cleanly.

## Clean head

A head is NOT clean while any required check is failing, pending, or cancelled, any review thread is unresolved, an expected automated reviewer named in `Repo facts` has not yet reviewed the current `head_sha` (unless past the repo's timeout), or merge commits carry already-squash-merged history. An outstanding human approval (review, visual baseline, credentials, hardware) is a human gate, not a failure; never approve it yourself. Merge-queue-only checks still have to pass after an authorized merge enters the queue.

## Stop when

- the current head is clean (leave the PR open unless merging is authorized);
- the PR is merged (and post-merge live-URL probe passes in `/ship` mode) or closed;
- the user pauses, cancels, or asks for a status report;
- the remaining gate needs a human (in unattended or headless runs, post the exact blocker and exit cleanly instead of waiting for interactive input).

A stopped check-in does not see later events. When a new commit, review, or check result arrives, refresh `pr-snapshot.mjs` and resume if work remains.

## Verify

- Fresh branch verified (no reused merged branch, no silent file deletions from `origin/<base>`).
- Current `head_sha` re-checked after the last push; all checks green, 0 unresolved threads, expected automated reviewers checked (or a named human gate remains).
- Fixes were batched into one push per review round; recurring comments used HTML-marker upserts; no bot trigger fired during an active quota limit.
- Local `git status` is clean; no merge, deploy, baseline approval, or `--no-verify` without authorization.
