---
name: agents-swarm
description: Fan out N parallel subagent workers in one turn, aggregate their results, and report PASS, ISSUES, or BLOCKED per worker. Use for /agents-swarm, "swarm this", parallel coverage across slices, races between approaches, or broad exploration.
---

# Swarm

Fan out N workers, drain them, return one report. Keep a todo list with one entry per phase: Frame, Fan out, Aggregate, Report.

Repo facts (from AGENTS.md or CLAUDE.md): the local run command and whether parallel instances in separate worktrees get their own ports and data.

## Phase A: Frame

1. State the done predicate and the report the swarm must return.
2. Choose the shape:
   - **Partition.** Each worker owns one slice.
   - **Race.** N workers get the same brief. Declare the rule before spawning: `first pass`, `rank all`, or `best-of`.
   - **Mixed.** Slices, with a race inside some of them.
3. Pick N. Cover every required slice. Do not exceed what the machine and the task justify.
4. Give each writing worker its own output path or its own worktree so workers never edit the same file. A worker in its own worktree must commit there and report the branch and commit; integrate each partition slice, and only the winning arm of a race, into the main checkout (merge or cherry-pick) before reporting it PASS; leave losing arms unmerged. Read-only workers need nothing. A worker that runs the app uses the repo's local run command in its own worktree; if instances would share ports or data, run those workers in batches that cannot collide.
5. When workers verify or measure commits, each brief names the exact SHAs. A measurement brief also names the method: sample count, what one sample is, and the order.

## Phase B: Fan out

Spawn all N workers in one turn as parallel subagents, using a smaller, faster model for workers. Run them in the background if the client supports it so they run concurrently, then collect each result when it completes. (Claude Code: the Agent tool; Codex: its subagent/collaboration tool.) If the client caps concurrent subagents, run the slices in batches within that cap; if it cannot spawn subagents, run them sequentially in the main thread.

Every brief stands alone. Include the goal, scope, exact slice or race arm, how to verify, and what to report. Workers report exactly one of:

- `PASS` with evidence.
- `ISSUES` with every issue the worker can prove, not only the first.
- `BLOCKED` with what stopped it and what it needs.

If a worker drops out, proceed with N-1 and note it.

## Phase C: Aggregate

- Read every terminal result.
- Drop a result that omits the SHAs or method its brief required, and respawn that worker once. After a second miss, record a gap. A gap is not a pass.
- For coverage, every required slice needs a result.
- For a race, apply the rule declared in Phase A. If judging a race needs taste or tradeoffs, spawn one judge subagent using the strongest available model and give it only the worker results.
- Do not paste raw worker output.

## Phase D: Report

Return one report in chat:

- A table: worker or slice, status, one-line evidence.
- One line per issue.
- Gaps and dropouts.
- The race rule and the winner, when a race ran.
- Overall status: PASS only if every required slice passed.

## Verify

- Workers were launched in one message, or in batches within the client's subagent cap, or sequentially when subagents are unavailable.
- Each passing worktree slice and race winner was integrated into the main checkout; losing arms were left unmerged.
- Every brief was self-contained and named its report format.
- Each slice has a result or a recorded gap.
- The report has no raw dumps.
