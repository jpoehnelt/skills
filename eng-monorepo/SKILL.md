---
name: eng-monorepo
description: Maintain pnpm workspaces, Turborepo task graphs and caching, shared TypeScript configs, and Changesets release wiring. Use when adding a package, editing manifests or catalogs, changing turbo.json or tsconfig files, or debugging broken caching or affected selection.
---

# Monorepo

Inspect current workspace manifests, `turbo.json`, and `tsconfig` files before changing the graph.

Repo facts (from AGENTS.md): workspace directories, package scope and public package names, shared base `tsconfig`, pnpm catalog and supply-chain rules, Turbo task names (`build`, `check`, `test`, `verify`), and the Changesets ignore list.

## Workspace dependencies

- Keep internal dependencies explicit with `workspace:*` so pnpm and Turborepo see the same graph.
- Put repeated external versions in `pnpm-workspace.yaml` under `catalog` and reference them with `catalog:`. Keep tightly coupled framework families (such as Effect packages and companions) on one exact version, using `overrides` and a repo version check where needed.
- Allow dependency build scripts only through pnpm's allowlist (`allowBuilds` or `onlyBuiltDependencies`). When a supply-chain age policy blocks a needed install, add an exact `name@version` exclusion and remove it once the version ages in.
- Update `pnpm-lock.yaml` with every manifest change. CI installs with `--frozen-lockfile`.

## TypeScript configuration

- Extend the shared strict base `tsconfig`. Package `tsconfig.json` files add only what their runtime needs, such as `types`, `lib`, or `module`. Fix new strictness errors in code rather than relaxing the base.
- Build library packages with declarations through a dedicated build config and import their built exports. Keep strict type checking separate from source emission.

## Turborepo task graph

- Use `^build` so dependencies build before dependents. Use `^transit` to carry changes through packages that have no build task.
- Declare generated `outputs` (such as `dist/**`) and every build-affecting variable in `env` or `passThroughEnv` on the owning task.
- List cross-package inputs (such as migration directories or schemas read by tests) explicitly on the task that reads them.
- Keep development servers persistent and uncached, and keep `deploy` uncached. Keep framework startup sync steps (such as `svelte-kit sync`) uncached and outside the watch graph.
- For non-JS crates (such as Rust) wired into Turbo, wrap each crate with a `package.json` calling its build tool, declare internal path dependencies as `workspace:*` devDependencies with `transit` (`dependsOn: ["^transit"]`), and list lockfiles and toolchain files in `inputs`. Keep release builds that embed credentials uncached.

## Changesets

- Keep private packages in the `ignore` list of `.changeset/config.json`.
- A new public package requires a changeset and an explicit decision on that list. A public surface change requires a changeset for the package and each affected consumer.

## Verify

- Run `pnpm install` and `pnpm install --frozen-lockfile`.
- Inspect the selected graph with `pnpm turbo run check test build --affected --dry=json` (checking `TURBO_SCM_BASE` and `TURBO_SCM_HEAD` when set).
- Run the repo's verify command.
- To test caching, run a cached task twice and confirm a cache hit. Use `--force` when fresh execution matters.
