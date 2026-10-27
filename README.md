# Skills

My personal collection of Agent skills. Enjoy!

## Install

Install one skill by its folder name:

```bash
npx skills install jpoehnelt/skills/<skill-name>
```

For example, `npx skills install jpoehnelt/skills/eng-change-checklist`.

## Naming

- A skill that depends on a framework or platform starts with its name: `effect-`, `svelte-`, `alchemy-`, `sentry-`.
- A skill that drives the GitHub CLI starts with `gh-`.
- Other skills start with a topic: `eng-` (engineering), `comms-` (communication), `agents-` (working with agents).

## Repo facts

These skills hold no project-specific commands, paths, or names. Each one lists the repo facts it expects, such as check commands, environments, or a Sentry project, and reads them from the repo's `AGENTS.md` or `CLAUDE.md`. Add those facts to your repo when you install a skill.

## Skills

### Engineering

| Skill | Description |
| --- | --- |
| [eng-change-checklist](./eng-change-checklist/SKILL.md) | Principles and a review checklist for planning or reviewing a non-trivial change. |
| [eng-blast-radius](./eng-blast-radius/SKILL.md) | Find what a change could break beyond its diff and prove the one fact it is safe because of. |
| [eng-benchmark-checklist](./eng-benchmark-checklist/SKILL.md) | Vet a performance measurement before reporting a speedup or regression. |
| [eng-tdd](./eng-tdd/SKILL.md) | Fix a bug test-first when a cheap regression test exists. |
| [eng-testing](./eng-testing/SKILL.md) | Decide whether to test, where a test lives, what it asserts, and which check to run. |
| [eng-cutover-verification](./eng-cutover-verification/SKILL.md) | Prove a migration, library swap, or removal is complete, with an audit script. |
| [eng-state-machine](./eng-state-machine/SKILL.md) | Model an entity lifecycle as a state machine with a pure decide, one guarded write, and outbox events. |
| [eng-agent-dx-cli-scale](./eng-agent-dx-cli-scale/SKILL.md) | Score how well a CLI is designed for AI agents. |

### Communication

| Skill | Description |
| --- | --- |
| [comms-how](./comms-how/SKILL.md) | Explain how a subsystem works and where new code belongs. |
| [comms-why](./comms-why/SKILL.md) | Explain why code is shaped as it is, from git history, PRs, and other evidence. |
| [comms-interrogate](./comms-interrogate/SKILL.md) | Critique a diff with parallel reviewers and synthesize one verdict. |
| [comms-technical-writing](./comms-technical-writing/SKILL.md) | Writing standard for docs, skills, PR descriptions, and commit messages. |
| [comms-unslop](./comms-unslop/SKILL.md) | Remove machine-written patterns from prose. |
| [comms-impact](./comms-impact/SKILL.md) | State a change's effect on users and the business: when someone does X, now Y, before Z. |

### Agents

| Skill | Description |
| --- | --- |
| [agents-swarm](./agents-swarm/SKILL.md) | Fan out parallel subagents and aggregate PASS, ISSUES, or BLOCKED. |
| [agents-reflect](./agents-reflect/SKILL.md) | Turn session lessons into edits to skills or AGENTS.md. |
| [agents-correct](./agents-correct/SKILL.md) | Make a repeated agent mistake impossible with architecture, types, lint, or tests. |
| [agents-create-verification-skill](./agents-create-verification-skill/SKILL.md) | Generate a project-local skill that drives the real app like a user. |

### GitHub CLI

| Skill | Description |
| --- | --- |
| [gh-pr-feedback-loop](./gh-pr-feedback-loop/SKILL.md) | Open a PR and drive it through CI and review to a clean head. |
| [gh-pr-commit-review](./gh-pr-commit-review/SKILL.md) | Review new commits on open PRs against their actual base. |
| [gh-ci-triage](./gh-ci-triage/SKILL.md) | Classify a red, cancelled, or flaky GitHub Actions run from log evidence. |

### Frameworks and platforms

| Skill | Description |
| --- | --- |
| [effect](./effect/SKILL.md) | Effect v4 conventions for services, errors, runners, resources, and tests. |
| [effect-boundary-validation](./effect-boundary-validation/SKILL.md) | Decode untrusted input once at ingress with Effect Schema. |
| [effect-seam-migration](./effect-seam-migration/SKILL.md) | Extract domain logic into Effect packages before moving it to another runtime. |
| [svelte-ui-delivery](./svelte-ui-delivery/SKILL.md) | Build and verify Svelte 5 UI changes with rendered evidence. |
| [svelte-shadcn](./svelte-shadcn/SKILL.md) | Write and customize shadcn-svelte components: Bits UI, tailwind-variants, and Tailwind v4 tokens. |
| [alchemy-infra](./alchemy-infra/SKILL.md) | Change, deploy, and debug Alchemy v2 stacks and Infisical secrets. |
| [nix-darwin](./nix-darwin/SKILL.md) | Manage macOS defaults, Homebrew casks, Lix or Nix settings, and Home Manager with a nix-darwin flake. |
| [sentry-bugfix](./sentry-bugfix/SKILL.md) | Triage Sentry errors for an environment and deliver a fix PR. |
| [sentry-perf](./sentry-perf/SKILL.md) | Find and fix performance regressions from Sentry spans and web vitals. |

## License

[MIT](./LICENSE)
