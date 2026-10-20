---
name: comms-interrogate
description: Multi-reviewer critique of a diff, run as parallel read-only subagents from distinct angles, then synthesized into one verdict. Use for "interrogate", "adversarial review", "challenge this", "stress test this code", "find blind spots", or "tear this apart".
disable-model-invocation: true
---

# Interrogate

Spawn several reviewers in parallel, each with a distinct angle, to critique a change. Synthesize their findings into one verdict. Never auto-apply changes.

Repo facts: the rules in the repo's `AGENTS.md` (or `CLAUDE.md`) and the skills it routes changes to.

## 1. Scope

Identify what to review:

- If the user names files or a diff, use that.
- On a feature branch, run `git diff <base>...HEAD` with the repo's default branch as base. Find it with git:

```sh
git symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null \
  || { git rev-parse --verify -q origin/main >/dev/null && echo origin/main; } \
  || echo origin/master
```

- If the user refers to recent work, gather those files with `git status` and `git diff`.

Collect the diff plus any context files reviewers need to understand it.

## 2. Intent

State the intent in one paragraph, drawn from the user's message, commit messages, the PR description, and the code. If the intent is unclear, ask the user in chat before spawning reviewers.

## 3. Spawn reviewers

When the user invoked this skill by name or otherwise authorized delegation, spawn one subagent per angle, all in a single turn so they run concurrently, using a smaller, faster model for each. Otherwise, or if the repo's rules limit delegation, run the angles yourself in sequence in the main thread. (Claude Code: the Agent tool; Codex: its subagent/collaboration tool.) If the client caps concurrent subagents, run the angles in batches within that cap; if it cannot spawn subagents, run them sequentially in the main thread. Reviewers are read-only: tell them not to edit files.

| Reviewer | Angle |
| -------- | ----- |
| A | Correctness: logic errors, edge cases, races, error handling, wrong assumptions |
| B | Security: untrusted input, authz, secrets, injection, data exposure |
| C | Simplicity: dead code, needless layers, duplicated logic, a smaller diff that does the same |
| D | Repo rules: every applicable rule in `AGENTS.md` and the review checklist of each skill it routes the change to |

Each brief stands alone. Include the intent, the diff or file list, the angle, and the output format: findings as `severity | file:line | issue | evidence | suggested fix`, or "no findings". Tell each reviewer to cite real lines, to back each finding with a concrete counterexample where one exists, and to say "unverified" for anything it did not check.

For a very large diff, run the reviewers in the background if the client supports it and collect results as they finish.

## 4. Synthesize

You are the lead reviewer, a pragmatic senior engineer, not an aggregator. Spot-check cited lines before accepting a finding. Merge duplicates and note which reviewers raised each one. A finding raised independently by two or more reviewers has the highest signal. Place each finding in one bucket:

- **Act on.** A real defect that would block a PR.
- **Consider.** Legitimate, but cost versus benefit is unclear. Needs the user's call.
- **Noted.** Valid but low impact or out of scope.
- **Dismissed.** Wrong or missing context, with a one-line reason.

## Output

- **Intent.** The paragraph from step 2.
- **Reviewers.** One line each: angle and finding count.
- **Act on / Consider / Noted / Dismissed.** Each item has the issue, who raised it, and why it matters or why it was dismissed.
- **Agreement map.** Where reviewers agreed or diverged.
- **Verdict.** One or two sentences: ready, ready after the Act on items, or needs rework.

## Review checklist

- Reviewers had distinct angles and were launched in one message, or in batches within the client's subagent cap, or run sequentially when delegation was not authorized or subagents are unavailable.
- The repo-rules reviewer read the real `AGENTS.md`.
- Cited lines were spot-checked against the code.
- No change was applied. The user decides which findings to act on.
