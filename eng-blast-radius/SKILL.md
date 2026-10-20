---
name: eng-blast-radius
description: Find what a change could break somewhere else before it ships, beyond the diff, and prove the one fact it is safe because of by running real code. Use when asked for the "blast radius of X" or "what could this break", or when reviewing a small diff you do not trust.
---

# Blast radius

Find what a change breaks somewhere else, before it ships. `comms-how` explains what code does and `comms-why` explains why it is shaped that way. This skill finds what the change breaks elsewhere.

Listing callers is not the job, because grep does that in a second. The job is the breakage grep will not show.

Repo facts (from AGENTS.md or CLAUDE.md): cross-package or cross-service contracts, generated outputs and their consumers, and the task runner's affected-package query.

## Do not trust your own writeup

A blast-radius writeup that sounds right is worthless, because it reads as convincing whether or not it is true. Find the one or two facts the safety claim depends on and prove them by running code.

For each such fact, get as far down this list as is cheap, and say where you stopped.

1. You said so. Worthless alone.
2. You pointed at a real `file:line`, or at the library's own source.
3. You walked the failure step by step and showed it cannot happen.
4. You ran a script or test that calls the real code and fails loudly if you are wrong.
5. You reproduced it in the running app.

Step 4 is usually one small script that imports the same library the app ships and calls the exact function you worry about.

## Steps

1. Read the change: the diff, the symbols it adds, changes, and deletes, and what behaves differently, including the part the diff does not spell out. Use `comms-why` to pull the PR and commits.
2. Find the one fact it is safe because of, such as "this call only drops already-dead cache entries". If it holds, most risky cases clear at once. Spend your time here, not on a long list of maybes.
3. Look where grep stops. Read the source of the libraries you call and check the pinned version and any local patch. Work out when things run: microtasks, teardown, ordering. Follow what symbol search misses: JSON an API returns, a database column, a stored document or envelope, a wire format, another language reading the same bytes, an event name or persisted workflow step id, a tenant scope key, a feature flag, another runtime that runs the same code, code three hops downstream. Start from the contracts AGENTS.md lists, and list affected packages with the task runner's affected query (for example `turbo run check test --affected --dry-run`).
4. Rate each risk with a real likelihood and a real cost. Keep confirmed risks and list cleared ones separately. Cite a real `file:line`. A search that finds nothing is still an answer. Never invent a caller or an API.
5. Prove the one fact with a script or test that runs the real code. Run it and paste the result.
6. For a wide change, when the user has authorized delegation, ask several independent reviewers (parallel subagents, see `agents-swarm`) the same question and merge the answers. Otherwise, check the riskiest paths yourself in sequence.

## What to hand back

- **What it does.** What changed, including the non-obvious part.
- **The one fact it is safe because of.** The step you reached and the proof. If you could not prove it, write "unproven".
- **Risks.** How each breaks, `file:line`, likelihood, cost, and how to check.
- **Cleared.** What you checked and why it is fine.
- **Before you merge.** The cheapest test or repro that catches the real bug, including your script.

Write it through `comms-unslop`, cite real code, and strip anything private before it goes anywhere public.

## Verify

- The safety fact is stated and marked proven at a named step, or marked unproven.
- Every risk cites a real `file:line`.
- Cleared items are listed apart from confirmed risks.
- At least one proof was run, not described.
