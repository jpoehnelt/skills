---
name: agents-autonomous-loops
description: Design, configure, or repair scheduled and autonomous coding-agent loops so they avoid duplicate PR storms, tracked state-file conflicts, hand-counted log churn, and production side effects. Use when creating or auditing a recurring agent routine, automation prompt, or self-improvement loop.
---

# Autonomous agent loops

A stateless scheduled agent that opens PRs without deduplication, caps, or isolated state burns CI quota and drowns maintainers in rotting PRs. Build hard mechanical bounds into every loop before turning it on.

Repo facts (from AGENTS.md): open-PR caps for bots, out-of-band telemetry or state store (KV, D1, issue ledger, artifact, or orphan branch), disposable sandbox or staging target URLs, required PR metadata (such as changesets), and bot comment markers.

## Required loop invariants

1. **Deduplicate before working.** Query open PRs and PRs closed unmerged in the last 30 days (by topic key, issue number, and touched file paths). If an open PR exists for the same concern or a human closed a matching bot PR unmerged, stop without opening a duplicate.
2. **Enforce an open-PR cap.** Never allow a scheduled loop to hold more than 1 open unmerged PR per repo (or per category). When the cap is reached, update or triage the existing PR instead of opening another.
3. **Never commit mutable loop state into main-branch markdown.** Do not append run journals, `memory.md`, or `LEARNINGS.md` files through PRs. Every merge creates N-way conflicts across all other open PRs. Store loop state out of band (KV, database, GitHub Actions artifacts, a dedicated issue ledger, or a single non-PR orphan branch).
4. **Compute telemetry mechanically, never by hand.** When a loop reports counts (calls, errors, latencies, PR stats), generate the numbers from a deterministic script or query. Never have an LLM hand-tally logs into prose PRs.
5. **Use one rolling branch for periodic reports.** If a periodic summary belongs in git, force-update one deterministic branch and PR (`chore/<loop>-status`) rather than opening hourly or daily new PRs.
6. **Never use issue-closing keywords in telemetry or observation PRs.** Avoid `Fixes #N`, `Closes #N`, or `Resolves #N` outside code PRs that actually resolve the issue.
7. **Isolate live probes.** Target local or disposable staging endpoints only. Never run registration, write, or notification probes against production without explicit authorization and cleanup.
8. **Idempotent comments only.** Upsert status comments using a unique HTML marker (`<!-- <loop-id> -->`) instead of appending repeated comments on re-runs. Follow `gh-pr-feedback-loop` for branch and comment hygiene.

## Circuit breakers and retirement

- Pause schedules automatically on inactive repos (no human commit in 30 days) or when a loop's 30-day merge rate drops below 30%.
- When a loop repeats the same operational mistake twice, encode a hard code, hook, or CI check (`agents-correct`) instead of appending another warning to the prompt.
- Autonomous loops run headless: fail fast with a structured blocker on missing credentials, unmet preconditions, or cap exhaustion rather than waiting for interactive input.

## Verify

- The loop queries open and recently closed PRs before creating a branch.
- Open-PR cap (`<=1`) and rolling-branch or out-of-band state storage are enforced in code, not only prose.
- Telemetry numbers come from a script; no `memory.md` or `LEARNINGS.md` is tracked in PR diffs.
- Production endpoints and issue-closing keywords are excluded from routine runs.
