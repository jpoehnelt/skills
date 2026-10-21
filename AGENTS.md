# Agent guide

Humans: see [README.md](README.md).

This repo is a public collection of reusable agent skills. Each skill must work in any project that installs it.

## Layout

- One folder per skill at the repo root: `<name>/SKILL.md`, plus optional `scripts/` and `references/`.
- No category subfolders. The name prefix does the grouping.
- `README.md` lists every skill in the table for its topic. Add, rename, or remove a skill and its README row in the same change.

## Naming

Choose the prefix by the first rule that applies:

1. **Framework or platform.** A skill that only makes sense with one framework or platform starts with its name: `effect-`, `svelte-`, `alchemy-`, `sentry-`. Use the bare name (`effect`) for the skill that covers the framework's general conventions.
2. **GitHub CLI.** A skill whose procedure or scripts run `gh` starts with `gh-`. A skill that only mentions `gh` as an optional alternative does not.
3. **Topic.** Every other skill starts with a short topic prefix:
   - `eng-`: engineering practice (change checklists, testing, measurement, migrations, CLI design).
   - `comms-`: explaining and writing (how, why, review verdicts, technical writing, prose cleanup).
   - `agents-`: working with agents (subagent fan-out, reflection, correcting repeated mistakes, verification skills).

Add a new topic prefix only when no existing one fits, and keep it short. Names are lowercase and hyphenated. The folder name must equal the `name:` field.

Renaming a skill changes its install path. Update every cross-reference and the README in the same change, and say so in the PR.

## Skill content

- **No private names.** A skill never names a private organization, repository, product, package scope, internal domain, service, environment, secret path, or a skill that lives only in another repo. Public tools and platforms (Effect, Svelte, Cloudflare, Sentry, Alchemy, Infisical, GitHub) are fine as general examples. Use a neutral example when a real one would identify a private project.
- **Repo facts come from the installing repo.** Do not inline project commands, paths, or names. Each skill has a `Repo facts` line listing what it expects the repo's `AGENTS.md` or `CLAUDE.md` to provide, such as check commands, environments, or a Sentry project.
- **Frontmatter.** `name` matches the folder. `description` says what the skill does and includes a "Use when ..." trigger, in under about 400 characters. Do not set `disable-model-invocation`: some agents then never load the skill, even by name, and cross-references to it break.
- **Cross-references** name other skills in this repo by their current names in backticks. Never reference a skill outside this repo; describe the need instead ("the repo's deploy guidance").
- **Length.** Keep `SKILL.md` short, usually under 100 lines. Move long reference material to `references/`.
- **Prose** follows `comms-technical-writing` and `comms-unslop`. No emojis.

## Scripts

- Bash with `set -euo pipefail`, executable, and linked from the skill body.
- Read-only unless the skill's purpose is to write. Bound every external command with a timeout.
- Repo-agnostic: derive the repo and default branch from git (`git remote get-url origin`, `git symbolic-ref refs/remotes/origin/HEAD` with a fallback to `origin/main`). Take project names, workflows, and patterns as arguments.
- Exit 2 on usage errors with a usage line. Report each failed section clearly instead of printing partial output as if it were complete.

## Before a PR

- `bash -n` every changed script, and run it against at least one real checkout.
- Check each changed folder name matches its `name:` and each cross-referenced skill exists.
- Search the diff for private names and read every changed file. A search only finds the names you thought of.
- Use Conventional Commit messages and PR titles (`feat:`, `fix:`, `docs:`).
