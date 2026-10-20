---
name: alchemy-infra
description: Change, plan, deploy, or debug infrastructure declared with Alchemy (v2) and secrets from Infisical. Use for alchemy stack edits, bindings, Durable Object classes, D1 or other migrations, custom domains, local Docker stacks, adding or rotating a Worker secret, secret drift between Infisical, CI, and the Worker, deploy failures, or rollback.
---

# Infrastructure with Alchemy

Alchemy programs are the only place infrastructure is declared. Never hand-edit generated deployment manifests, add Wrangler config, or change a stack-owned resource in a dashboard.

Repo facts (from AGENTS.md): each stack's program file, stage names and which stage is production, plan, deploy, and local-run commands, the pinned Alchemy version and required Node version, where Alchemy state lives, the secret-name list in each stack, the Infisical environment and path per stage, the CI deploy jobs, and smoke-test commands.

## Stacks

- List every stack before changing one: program file, stage, plan and deploy commands, local command. Local and remote stacks often share one set of service declarations; change the shared declaration so every stack picks it up, and keep stack files to names, ports, volumes, and secrets.
- Alchemy v2 betas move quickly. Keep the exact version pin and check the Node version it needs before running it (type stripping of the program file needs a recent Node).
- Know where state lives. Remote state for production means local runs cannot accidentally fork it; local `.alchemy/` state is disposable. Only the production stage should touch production, and production resources should be retained on removal.
- Local ports come from the local stack's output or its instance registry; never hard-code them.

## Change a stack

1. Edit the program file. If the app derives its `Env` type from the program, handlers cannot drift from bindings; otherwise update the type in the same change.
2. Keep test and smoke configurations (Miniflare bindings, smoke stacks, local env files) in step: bindings, Durable Object classes, test secrets.
3. Durable Objects: keep binding and class names stable. Renaming or moving a class needs an explicit transfer or migration, never a silently new name. A namespace that still exists may need an inert export until its removal condition is met.
4. Database migrations: add a new numbered file; never edit or remove an applied one.
5. Run the package's type check (it type-checks the Alchemy program), then the plan for the changed stack. Read the plan diff for binding, Durable Object, KV, and domain changes before merge.
6. Behavior check: run the changed stack locally (`alchemy dev` or the repo's local stack command), confirm containers are healthy (`docker ps`) for Docker stacks, and run the repo's smoke tests for the affected surface.

## Secrets

Alchemy uploads the binding set whole on each deploy, so a secret missing from the deploy environment is removed from the Worker. To add or rotate a secret, update every place that names it:

1. The stack's secret-name list (required names should fail the deploy when empty).
2. The value in Infisical for each stage, plus the sync to CI secrets if CI reads them there.
3. The CI deploy step's environment.
4. Test configuration and the example local env file.

Then check drift by comparing secret names, never values, across the stack list, Infisical, the CI deploy env, and test config. A small `comm -3 <(names from stack | sort -u) <(names from CI | sort -u)` pipeline is enough; expect only deploy-only credentials (for example the Cloudflare API token) on the CI side. Never print or commit values. Keep any native Infisical-to-Cloudflare secret sync off when Alchemy owns the bindings.

## Failures

Identify the failing layer (build, secret fetch, plan, apply, runtime) before retrying. A successful deploy does not prove the app or its datastores are ready.

- Missing or empty secret: the deploy should fail before any cloud change. Fix the Infisical or CI value and rerun.
- Adoption guards (a KV namespace or domain resolving to an unexpected resource, or a domain attached to another Worker): fix the input or detach deliberately. Do not use `--adopt` on ordinary deploys.
- Build or apply error: rebuild through the task runner first, then rerun the same stage.
- Unknown stage or unloaded environment: the stack should fail fast on a sentinel secret; run through the repo's secret-injection wrapper (for example `infisical run --env=<env> --path=<path> -- ...`).

## Rollback

There is usually no rollback command and production resources are retained. Revert the offending commit on the default branch so CI redeploys, or check out the last good commit, build, and deploy that stage. Do not roll back across an applied database migration without a forward fix.

Do not deploy to shared or production stages, run `destroy`, tear down a stack with data, or use `--adopt` against production without explicit authorization.

## Verify

- The package type check passes.
- The plan diff matches intent, with no unexpected binding, Durable Object, or domain deletion.
- Secret-name drift shows only the expected deploy-only names.
- The changed stack runs locally and its smoke tests pass.
