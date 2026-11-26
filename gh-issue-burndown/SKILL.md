---
name: gh-issue-burndown
description: Triage open GitHub issues, partition strictly non-overlapping file ownership, and execute one isolated git worktree, fresh branch, and focused PR per issue without bundling unrelated work. Use when burning down a backlog or batch of open issues in parallel or sequence.
---

# Issue burndown

Bundling independent issues onto one branch creates mega-PRs, tangled reviews, and merge conflicts. Partition issues by disjoint file ownership and ship one isolated worktree, one fresh branch, and one focused PR per issue.

Repo facts (from AGENTS.md): issue priority labels and triage rules, package and directory ownership map, max concurrent worktrees or workers, pre-PR validation command, and merge authorization rules.

## 1. Triage open issues

1. List open issues with `gh issue list --state open --json number,title,labels,assignees,updatedAt --limit 100` and open PRs with `gh pr list --state open --json number,title,headRefName,files`.
2. Exclude issues that already have an open PR, lack a clear repro or acceptance criterion, or are blocked on an external decision.
3. Rank candidates by severity and independence (bug fixes and narrow, self-contained tasks first).

## 2. Partition strictly non-overlapping file ownership

1. For each candidate issue, inspect the codebase and list the exact files or directories it will touch (including shared barrels, schemas, lockfiles, and migrations).
2. Group candidates into a batch where no two issues touch the same file, shared schema, migration sequence, or lockfile.
3. Defer any overlapping issue to the next wave after the conflicting PR merges. Never bundle independent issues onto a single branch or PR.
4. Keep each issue within single-PR scope (`eng-change-checklist`). If an issue is ambiguous in an interactive session, clarify before coding; in unattended or headless runs, skip ambiguous or overlapping issues and proceed with the clearly triaged non-overlapping batch.

## 3. Execute one worktree and PR per issue

1. Refresh the default branch (`git fetch origin`) before creating worktrees.
2. For each issue in the non-overlapping batch, create one isolated git worktree on a fresh branch from `origin/<base>`:
   ```bash
   git worktree add -b fix/issue-<n> <worktree-dir>/issue-<n> origin/<base>
   ```
3. When delegation is authorized, assign one worker per worktree (`agents-swarm`) with its explicit file ownership boundary and forbidden paths. Otherwise work through the worktrees in sequence.
4. Each issue runs focused validation and opens its own single-concern PR referencing `Fixes #<n>` through `gh-pr-feedback-loop`.

## 4. Verify non-overlapping merges and clean up

1. Before merging any PR (only with explicit authorization), verify `gh pr view <n> --json files` still has zero file overlap with other open burndown PRs.
2. If an earlier PR modifies a shared file anyway, rebase or merge `origin/<base>` forward on the affected branch and re-run checks before continuing.
3. Remove finished worktrees (`git worktree remove <path>`) and prune stale branches once PRs merge or close.

## Verify

- Every issue in the batch ran in its own isolated git worktree on a fresh branch from `origin/<base>`.
- Zero independent issues were bundled onto one branch or PR.
- Touch lists across concurrent PRs had zero overlapping files, migrations, or lockfiles.
- Finished worktrees were removed cleanly after delivery.
