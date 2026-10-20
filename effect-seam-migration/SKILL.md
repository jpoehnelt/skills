---
name: effect-seam-migration
description: Move heavy or long-running work off a constrained runtime (for example the Cloudflare Workers memory or CPU ceiling) by first extracting domain logic into packages as Effect programs, then moving execution. Use when starting or continuing a runtime migration or moving a service across app boundaries.
---

# Effect-seam runtime migration

Separate extraction from the runtime move so each step preserves behavior. Never register unextracted app code on a new runtime. Use `effect` for runners and layers. Assumes Effect v4.

Repo facts (from AGENTS.md): where packages live, the runtimes and their entrypoints, any workflow ownership catalog or manifest assertion, shared event contracts, Effect gates, and check, test, and local-run commands.

## Extract (finish first)

1. Identify the workload: entry point, callers, dependencies, resource lifetime. Record implicit authorization, tenant scoping, ordering, deduplication, retry identity, and error behavior.
2. Move app-independent logic into an owning package. Pure synchronous logic stays outside Effect; I/O is exposed as Effect programs with service dependencies in `R`. Packages never import an app.
3. Move the unit's tests into the package. Only route, transport, and runtime-boundary integration tests stay beside the app.
4. Keep execution on the existing runtime until focused checks and the existing integration path pass. Keep the repo's Effect gates (round-trip, thin-wrapper, runtime-exit checks) green.

## Move (after extraction)

1. Compose the required layers at the destination entry point and run programs only through its boundary runner.
2. Establish exactly one execution owner. If the repo has an ownership catalog or manifest, add the unit there and register it on the new runtime in the same change.
3. Delete the old runtime's shell, callers, and execution path in the change that activates the replacement, one unit at a time. No fallback, catch-and-retry, or failover to the old runtime when the new one times out or errors; rely on the durable retry layer.
4. Keep cross-runtime event names and schemas in the existing shared contract. You are moving execution, not rebuilding plumbing.
5. Update exports, dependency manifests, build-task inputs, deployment declarations, and generated artifacts together. Use `eng-cutover-verification` to prove the old path is gone.

## Review checklist

- No unextracted app code runs on the new runtime.
- One owner per unit; no dual-homing and no silent fallback left behind.
- Wire contracts, tenant scoping, idempotency, cancellation, and error behavior are preserved.
- Durable step ids and journal shapes are unchanged, or changed steps have new ids.
- Interruption releases resources, and retries keep the same logical delivery identity.
- The new runtime has every required capability; no no-op service stands in for persistence or event delivery.
- Focused package checks and tests pass, and the migrated behavior is exercised end to end in the repo's local stack.
- A runtime move does not authorize a deploy to a shared environment. Use `alchemy-infra` (or the repo's deploy procedure) for the reviewed plan and a separately authorized rollout.
