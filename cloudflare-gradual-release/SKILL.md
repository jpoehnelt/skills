---
name: cloudflare-gradual-release
description: Configure, run, observe, and recover gradual Cloudflare Workers rollouts (1%, 10%, 50%, 100%) with version-override probes, Workers Logs gates, and Alchemy state reconciliation. Use when building or operating staged Worker deployments, asset skew handling, expand-and-contract migrations, or rollout recovery.
---

# Cloudflare gradual release

Drive staged Cloudflare Workers rollouts through CI workflows, version-override probes, and Workers Logs gates. Use `alchemy-infra` for stack edits and secret drift, and `gh-ci-triage` for build or test failures.

Repo facts (from AGENTS.md): production Worker name and custom domain, Alchemy stack and deploy workflow files, GitHub environments and wait-timer settings, migration and runtime secret stores, probe command and disposable probe fixture, observation window and minimum-traffic variables, and rollback procedure.

## Prerequisites and isolation

- Keep migration credentials separate from runtime credentials and out of Workers.
- Restrict production and wait environments to the default branch. Use a custom domain rather than `workers.dev` when browser version affinity is required.
- Enable Workers Logs, invocation logs, and full sampling before the first gradual rollout. Preserve existing logs and trace destinations during partial deploys.
- Serialize releases and reject superseded revisions before deployment and before each traffic increase.
- Require explicit authorization for manual production deploys, remote migrations, live traffic changes, or recovery runs.

## Staged rollout

1. Plan and record the active baseline version ID and release SHA. Refuse to guess when a partial split is already active. Restore one known version first.
2. Apply backward-compatible schema migrations with the dedicated migration credential before uploading the candidate. A failed migration blocks upload.
3. Upload the candidate version and route 1% of traffic to it.
4. Probe the candidate with Cloudflare's version-override header. Require the response to report the candidate's version ID and release SHA, and check critical writes and dependencies against a dedicated disposable fixture.
5. Observe production logs for the full window, then promote the same version through 10%, 50%, and 100% through Cloudflare's deployment API without uploading a new version.
6. Re-run the full probe at 100%. Mark the deployment successful only afterward.

## Observation and promotion gates

- Query Workers Logs filtered by physical script name and version ID over the full window plus log ingestion lag.
- Repeat pinned, read-only health requests against both versions during each window. Require those health logs to appear for both versions. Missing telemetry blocks promotion.
- Require zero candidate error logs, failed invocation outcomes, HTTP 5xx responses, or latency-ceiling breaches.
- Distinguish zero-traffic categories from partially sampled traffic below the minimum floor. Allow a manual low-traffic override only through explicit workflow dispatch, never for errors, failed probes, stale revisions, or missing telemetry.
- Release CI runners during wait windows by using secret-free GitHub environment wait timers sized above `RELEASE_OBSERVATION_SECONDS` plus ingestion lag.

## Shared state and version skew

- Both versions share databases, queues, bindings, and external webhooks during a split. Use expand-and-contract migrations: ship compatible schema and readers first, deploy writers after reaching 100%, and drop old schema only after the rollback window ends. Rollback does not undo schema or data changes.
- Version overrides pin HTTP requests, not the asynchronous queue jobs they enqueue. Keep queued payloads readable by both versions.
- Each Worker version serves only its own uploaded assets, and IP affinity does not hold visitors whose addresses change. Carry the retained version's hashed immutable assets on the candidate upload, probe both versions' asset graphs, and reload the client shell once on a failed chunk import. Attribute missing-asset checks to the candidate and retained build manifests rather than failing on probes or older builds.

## Recovery and state reconciliation

- One final recovery job covers failures across deployment, waits, and promotion: restore the retained version at 100%, verify its health and assets, and open or update one failure issue per environment and SHA. Do not gate recovery on a boolean job output that GitHub can mask as a secret.
- Keep the deployment failed even when automatic recovery succeeds.
- After cancellation or runner loss, inspect live Cloudflare routing rather than assuming rollback ran.
- Reconcile Alchemy state before the next release. Native Cloudflare promotion or rollback leaves Alchemy's recorded routing state behind Cloudflare's routing table.

## Verify

- Baseline version ID and SHA were captured from a 100% healthy version before splitting traffic.
- Pinned probes confirmed both version ID and release SHA at 1% and again at 100%.
- Workers Logs ingested health probes for both versions with zero candidate errors.
- Any schema or queue change is compatible with the retained version.
- Live Cloudflare routing and Alchemy state agree after completion or recovery.
