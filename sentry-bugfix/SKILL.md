---
name: sentry-bugfix
description: Triage Sentry errors for one environment, trace a finding to current code, reproduce it locally, and deliver a focused fix PR. Use when sweeping an environment's errors, decomposing catch-all log or 5xx issues, or driving a supplied Sentry issue to a fix. Use sentry-perf for latency and gh-ci-triage for CI.
---

# Sentry-driven bug fixing

Repo facts (read from AGENTS.md or CLAUDE.md; verify in Sentry before use): Sentry organization and region, project slugs per app or runtime, environment names and the hosts they serve, where Sentry is initialized, which logger mirrors logs into Sentry, redacted fields, and the repo's check and PR commands.

Discover the callable Sentry tools first (typically issue search, event search over `errors`/`logs`/`spans`, and a resource fetch for issues and traces). Never reuse another repository's coordinates.

## Establish scope

- Resolve organization, project, and environment from the supplied issue, the connected account, and the repo's release configuration. Confirm ownership in Sentry.
- Put an explicit environment and time range on every query. Preview and CI environments often carry heavy end-to-end and accessibility-test volume; keep them out of production sweeps. If several deployments share one environment tag, separate them by host, release, or deploy evidence.
- Read the instrumentation: framework error hooks (server and client), explicit `captureException` calls, structured-logger mirrors, and process-boundary handlers in background workers. Know every path that can create an event before counting events.

## Grouping traps

- **Catch-all buckets.** A logger that mirrors `log.error` into Sentry, or a request logger that reports returned 5xx, produces a few issues fingerprinted by logger name, message template, or route plus status. One issue title can hide several causes. Decompose by the structured fields that carry identity (log message, route, handler, domain keys) instead of by issue.
- **Double reporting.** A failed request can be reported by the error hook, the request logger, and an explicit capture. Do not count duplicates as distinct incidents.
- **Suppressed transients.** If the repo tags known transient faults instead of capturing them, check that tag before calling something new.
- **Silent pipelines.** A stalled scheduled job emits no errors. Check cron monitors or heartbeat check-ins alongside issues.

## Query

1. List issues for the scope, sorted by frequency, with a small limit. Record the query and window.
2. For log-backed buckets, aggregate the `logs` dataset by the identity fields with `count()`, sorted descending. Then drill into one message by filtering on it and grouping by a domain field.
3. Keep field lists and limits small. Avoid nested-array fields in event queries; they are slow and often time out.
4. Open a representative event and its trace for each group. Group by exception, stack location, route or handler, release, and runtime. Platform logs (for example Cloudflare Workers logs) that share the trace and span IDs can fill gaps.

Respect redaction and access limits. Do not assume redacted fields are readable, and do not paste credentials, user-identifying data, or unredacted payloads into reports. Missing readable data is an evidence gap, not a negative result.

## Classify

For each root-cause group, decide: active code bug, data drift (stored data no longer matches a schema), missing configuration, expected rejection, upstream outage, or noise. Trace the event to current code and the deployed revision, and compare the preceding release before calling it a regression. Deployment and configuration findings go to the repo's deploy runbook, not a code fix.

With several independent groups, fan out one read-only triage agent per group, follow each with an adversarial verifier that tries to refute it, and implement only confirmed fixes in disjoint files (agents-swarm). Carry non-actionable findings through to the report instead of dropping them.

## Fix and deliver

1. Reproduce the observed failure locally or with a focused check in the owning package.
2. Make the minimal fix at the cause, in the owning module. Preserve typed failures and their causes, tenant scoping, and resource cleanup (effect, effect-boundary-validation in Effect repos). Add a regression test only where branch behavior is uncertain (eng-tdd when a cheap one exists).
3. Run the repo's affected checks. Open a Conventional Commit `fix(scope): ...` PR linking the Sentry issue and the observed release, then follow gh-pr-feedback-loop.
4. Do not resolve the Sentry issue because code was pushed. Wait for the authorized deploy and a meaningful observation window.

## Review checklist

- Organization, project, environment, host, release, and window are explicit.
- The finding is not a double-reported 5xx, a suppressed transient, or a preview-only test artifact.
- Root cause cites a representative event and a current code location, and is reproduced locally.
- Redacted fields and telemetry gaps are stated, not assumed away.
- Unverified rollout evidence is reported as such.
