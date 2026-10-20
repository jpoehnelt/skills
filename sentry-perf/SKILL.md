---
name: sentry-perf
description: Find and fix performance regressions from Sentry spans, transactions, dashboards, and web vitals. Use when asked for a performance dashboard summary, slow routes, week-over-week regressions, comparable measurement windows, or a perf fix PR. Use sentry-bugfix for errors and gh-ci-triage for CI.
---

# Sentry performance analysis

Repo facts (read from AGENTS.md or CLAUDE.md; verify in Sentry): Sentry organization, region, and project; environment names and hosts; where tracing and sample rates are configured; custom `span.op` names; where dashboards and alerts are defined (UI or infrastructure as code); and the repo's check and PR commands.

Use eng-benchmark-checklist before reporting a number or choosing a fix. Discover the callable Sentry tools and confirm coordinates as in sentry-bugfix.

## Read live measurements

1. Fix the project, environment, host or runtime, release, and window. If several deployments share an environment tag, confirm the host before attributing traffic.
2. For a supplied dashboard, read its widget definitions, then run each relevant widget's conditions as a live query with an explicit environment. Saved definitions are not data.
3. Query the `spans` dataset. Transactions are spans with `is_transaction:true`. Discover emitted `span.op` values from data and source; do not assume another app's names.
4. Keep field lists lean and limits small; wide queries time out.
5. Record sample counts beside p50, p95, and total duration. Compare equivalent windows with the same query, cohort, sampling, and release context.
6. Open representative traces to find the dominant database, auth, network, AI provider, rendering, or queue delay.

Useful query shapes (put the environment in the query string):

| Question | Query | Fields and sort |
| --- | --- | --- |
| Slowest transactions | `environment:<env> is_transaction:true` | `transaction`, `p50(span.duration)`, `p95(span.duration)`, `count()`; sort `-p95(span.duration)` |
| Total-time sinks | same | sort `-sum(span.duration)` |
| Subsystem cost | `environment:<env>` | `span.op`, `count()`, `p95(span.duration)`, `sum(span.duration)` |
| Slow queries in one subsystem | `environment:<env> span.op:<op>` | `span.description`, `p95(span.duration)`, `count()` |
| Web vitals | `environment:<env> has:measurements.lcp` | `transaction`, `p75(measurements.lcp)`, `p75(measurements.cls)`, `count()` |

Regression check: run the same query over a recent window (24h) and a baseline (7d, or the prior week), and flag transactions whose p95 rose more than about 30% at non-trivial volume. Sparse percentiles do not establish a regression.

## Thresholds

- Web vitals at p75: LCP good under 2.5s, poor over 4.0s; INP good under 200ms, poor over 500ms; CLS good under 0.1, poor over 0.25; TTFB good under 800ms, poor over 1.8s.
- API p95 over 1s is notable, over 3s is bad. SSR p95 over 3s is slow.
- A p95 pinned at a round number near a configured deadline (for example 30000ms) is a timeout ceiling, so those are failures, not slow successes.

## Traps

- **Sampling.** Read the configured sample rates from source; they often differ by route or method. Do not extrapolate counts by a fixed multiplier, and treat a sampling change between windows as a confound.
- **Noise.** Exclude bot and scanner paths (`/wp-login.php`, `apple-touch-icon*`, probes). A p95 of 0 usually means static, cached, or redirect paths.
- **By design.** Streaming, long-polling, and subscriptions are long on purpose; do not report them as slow interactive work.
- **Runtime clocks.** On Cloudflare Workers the clock does not advance during synchronous CPU work, so span durations there measure I/O wait, not compute.
- **Cold starts and deploys** inflate a short window; check release boundaries.

## Choose and verify the fix

1. Classify each finding: regression, chronic slow path, poor UX, by design, noise, or insufficient evidence. Name the affected user operation and the dominant `span.op`.
2. Confirm the fix targets that span at real user volume, not a bystander.
3. Reproduce the path locally and measure it. Use the repo's verification skill for the user-visible result (agents-create-verification-skill if none exists).
4. Target the measured cause: run independent I/O with bounded concurrency, batch repeated reads, add an index or limit, stream or defer heavy payloads. Preserve ordering, authorization, and resource bounds. Hold architectural, sampling, or infrastructure changes for human review.
5. Run the repo's affected checks. Open a `perf(scope): ...` PR with the before numbers and their queries, then follow gh-pr-feedback-loop.
6. After the separately authorized rollout, rerun the same query over a comparable window and report the change with its uncertainty.

With several independent findings, fan out one triage agent per finding with an adversarial verifier, implement only confirmed low-risk fixes in disjoint files, and return escalations for human decision (agents-swarm).

## Review checklist

- Every reported number has a query, window, environment, cohort, release context, and sample count.
- Sampling, bots, cold starts, and by-design long requests are accounted for.
- The fix targets the dominant span and preserves behavior.
- Local evidence and deployed observations are reported separately.
