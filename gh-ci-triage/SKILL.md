---
name: gh-ci-triage
description: Diagnose failing GitHub Actions CI from log evidence and choose a fix, rerun, merge-forward, or escalation. Use when a PR or default-branch run is red, cancelled, or flaky, or a visual baseline or artifact is missing.
---

# CI triage

Diagnose from log evidence before acting.

Repo facts (from AGENTS.md or CLAUDE.md): the main CI workflow file and its jobs, the local command that reproduces each job, path filters or affected-selection rules, required checks, and which failures need a human (secrets, approvals, hardware). If AGENTS.md has no job map, read `.github/workflows/`.

## Snapshot the current head

1. Run [`scripts/ci-snapshot.sh`](scripts/ci-snapshot.sh) `[-R owner/repo] [-w workflow] <pr-number>`. It prints the PR head, check runs and commit statuses on that head, workflow runs for that head, and recent runs on the base branch. With no PR it shows recent runs on the default branch.
2. Read the first failing step's log (`gh run view <run-id> --log-failed`), not the job title. Later skipped steps are not independent failures. Save long logs to a scratch file and read the relevant excerpt.
3. Compare with the base branch: is the same job or step red there? Pass `-w <workflow-file>` to narrow the comparison.
4. Check the workflow definition when the job map in AGENTS.md may have drifted. An aggregate job (for example a `ci-success` gate) fails because a lane failed or was cancelled; find that lane.

## Classify

Assign exactly one class and cite the log line or run URL that proves it.

- **real**: a specific assertion, type, lint, build, or code-generation failure, including merge conflicts with the base. Reproduce with the narrowest local command that mirrors the CI job (same filter and flags), fix, push.
- **base-red**: the same step is red on the latest base-branch run. Cite that run. Port an existing fix if one exists; otherwise comment once on the PR naming the step and the failing base run. Do not expand an unrelated PR to fix it unless asked.
- **flake**: a known transient (network fetch, runner loss, browser or package download). Rerun the failed jobs once (`gh run rerun <run-id> --failed`); a second failure is real.
- **infra-not-published**: a baseline or artifact the job compares against has not been published for the base SHA yet. Merge the base forward to a commit that has it; do not rerun. If the comparison was skipped for missing credentials, it is human-only.
- **cancelled**: superseded by a newer push (PR concurrency cancels older runs). Inspect the newest head.
- **human-only**: missing secrets (common on fork PRs), rotated tokens, screenshot or deploy approval, hardware. Report the exact blocker.

Classify before rerunning. Route deploy, runtime-config, or secret drift failures to the repo's deploy guidance (for Alchemy stacks, `alchemy-infra`).

## Reproduce narrowly

- Use the repo's task runner filter for the failing package (for Turborepo, `turbo run <task> --filter=<pkg>`); add the runner's force or no-cache flag when a cache hit may hide the failure.
- For generated-code drift, regenerate with the repo's generate command and check `git diff --exit-code` on the generated paths.
- For visual diffs, rebuild the catalog and rerun the visual test locally; only a human approves new screenshots.

Never skip, disable, or quarantine a test, edit a workflow to pass, push an empty commit to rerun, or use `--no-verify`.

## Continue

Re-check the current head until checks are green, the PR merges, or a human is needed. Delivery continues in `gh-pr-feedback-loop`.

## Verify

- The failing step's log was read, not only the job title.
- Exactly one class, with evidence; a base-red claim cites the base run.
- The base branch was checked before calling a failure real.
- No rerun before classification.
- The local reproduction used the same filter and flags as CI.
