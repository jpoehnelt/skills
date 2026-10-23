---
name: gh-pr-feedback-loop
description: Publish a GitHub pull request and carry it through CI, review feedback, rebases, and merge readiness, merging only with explicit authorization. Use when opening or updating a PR, addressing review comments, monitoring checks, rebasing, or continuing a PR to a terminal state. For read-only review of new commits, use gh-pr-commit-review.
---

# PR feedback loop

Carry a PR from creation to a clean head. Merge only with explicit authorization.

Repo facts (from AGENTS.md or CLAUDE.md): validation and check commands, commit and PR title conventions, PR template, required PR metadata (linked issue or ticket, changeset or change note), and which gates need a human.

## Establish live state

1. Run [`scripts/pr-snapshot.sh`](scripts/pr-snapshot.sh) `<pr-number-or-url> [owner/repo]`. It prints head and base SHAs, check runs, commit statuses, reviews, unresolved review threads, and inline comments, using the `origin` remote by default.
2. Read unresolved review threads before changing anything. Inline comments carry no resolved state; if the script cannot read threads, use the GitHub MCP tools or the web UI.
3. Run `git status --short` and confirm the actual base branch. Stacked PRs do not target the default branch.

## Publish

1. Use the repo's commit and PR title convention (often Conventional Commits). Keep a PR to one concern; stack PRs only when one truly depends on another.
2. Fill the PR template and any required metadata. Describe the observable change (`comms-impact` for who it affects, now and before) and the validation you ran (`comms-technical-writing`).
3. Run the narrowest sufficient validation from AGENTS.md, then the repo's pre-PR gate, before pushing.
4. Open the PR ready for review unless a draft is requested.
5. If `gh pr edit` fails on a GraphQL error, update the body with `gh api repos/<owner>/<repo>/pulls/<n> -X PATCH -f body=...`.

## Loop

While checks are pending or feedback is actionable, keep one check-in scheduled about every 10 minutes instead of a blocking poll loop. Take one snapshot now and let the check-in observe the rest. Bound external commands with timeouts.

Each iteration:

1. Refresh the snapshot; list failing checks and unresolved threads on the current head SHA.
2. Route CI failures to `gh-ci-triage` and retired-path or migration proofs to `eng-cutover-verification`. Route deploy and secret failures to the repo's deploy guidance.
3. Fix code, lint, type, and test issues directly. Validate with focused checks, commit, and push.
4. Use `--force-with-lease` only after rebasing a branch you own; on someone else's branch, merge the base instead. After a rebase, run `git range-diff <old-base>..<old-head> <new-base>..<new-head>` to confirm only intended changes moved.
5. If a workflow pushes bot commits to the branch (formatting, image optimization), `git pull --rebase` before the next push.
6. Re-read threads before replying so you do not answer twice. Reply on each addressed thread, and resolve only threads you were asked to own. A reply alone does not resolve a finding.
7. Keep the PR body and linked issue scope accurate after the scope changes.
8. Every push resets approvals bound to a SHA (visual baselines, reviews). Batch fixes into one push per review round, and finish copy and PR body edits before pushing.
9. After a squash merge, start follow-up work on a fresh branch from the base (`git switch -c <new> origin/<base>`); the old branch's commits are not ancestors of it.
10. If a thread reply fails with "one pending review per pull request", submit or delete the pending review. Do not fall back to a top-level comment.

## Clean head

A head is clean when every applicable check on the current head SHA passes, required validation is complete, and no actionable review feedback remains. Pending or cancelled required checks are not clean. An outstanding human approval (review, visual baseline, credentials, hardware) is a human gate, not a failure; never approve it yourself.

Merge-queue-only checks still have to pass after an authorized merge enters the queue. A clean PR head does not prove they pass.

## Stop when

- the current head is clean (leave the PR open unless merging is authorized);
- the PR is merged or closed;
- the user pauses, cancels, or asks for a status report;
- the remaining gate needs a human.

A stopped check-in does not see later events. When a new commit, review, or check result arrives, refresh the snapshot and re-arm one check-in if work remains.

## Verify

- The current head SHA was re-checked after every push, and its checks are green or a named human gate remains.
- No unresolved thread lacks a fix or a reply.
- Title and commits follow the repo's convention; required PR metadata is present.
- The PR body still describes the current head.
- Local `git status` is clean and the branch matches the PR head.
- No merge, deploy, baseline approval, or `--no-verify` without authorization.
