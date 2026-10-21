---
name: agents-create-verification-skill
description: Generate a project-local verify skill that drives the app like a user through a browser with Playwright, a CLI, or HTTP. Use for /agents-create-verification-skill, "make a verify skill for this repo", or when a project has no scripted way to prove UI, CLI, or service behavior.
---

# Create a verification skill

Produce `.agents/skills/verify-<surface>/SKILL.md`, a skill that launches the real app, exercises a feature the way a user would, and captures evidence. The next agent reads it cold, so it must work from the file alone. Every command in it must be real.

Repo facts (from AGENTS.md, CLAUDE.md, or README.md): the local run command, ports, seed users and data, auth, the existing e2e harness, and any skill that already covers rendered UI evidence.

## 1. Interview the repo, not the user

Answer from the codebase. Ask the user in chat only about what you cannot observe.

- **Surface.** Web UI, CLI, TUI, API, desktop, mobile, or device. Pick the primary one; a repo with several gets one skill per surface.
- **Run.** Read `package.json` scripts, `Makefile`, `README.md`, and `AGENTS.md` for the documented start command, ports, env vars, seed data, and auth. Prefer a one-command local stack when the repo has one.
- **Drive.** Prefer an existing harness: `ls` for `playwright.config.*`, `cypress.config.*`, e2e folders, health or metrics endpoints, or curl-able routes. Otherwise use Playwright for web, a tmux or PTY session for CLI and TUI, and plain HTTP (`curl`) for services. If an existing skill already covers this surface, extend it instead.
- **Observe.** Screenshots, response bodies, logs, exit codes, database state.
- **Isolate.** Can two instances run side by side? If not, the skill must say so.

If the checkout does not build or start, report that precisely before generating anything.

## 2. Write the skill

Frontmatter: `name: verify-<surface>`, and a `description` naming the app, the surface, and "Use when ...". Sections:

- **Launch.** The exact start command and how to tell it is ready (a log line or a health response). It must work from an empty data directory, including migrations and seed data. Include teardown.
- **Doctor.** One read-only check: process up, right build, port owned by this run, auth valid.
- **Drive.** Real selectors and commands from this repo. Prefer ARIA roles, labels, and data attributes over coordinates.
- **Evidence.** What to capture and where. Exercise the real user path, not test-only endpoints. Capture the action and the resulting state. Verify side effects such as files, rows, and messages. Mock only at an existing production boundary.
- **Cleanup.** Stop only what the run started, never by process name. Keep the evidence, including failure evidence.
- **Helpers.** Any shipped script is `bash` with `set -euo pipefail`, executable, and shown in the skill body. Keep fragile prerequisites in the script, not copied into prose.

Keep the generated skill within 80 lines. Put per-feature drive steps inline for the top 3 features, each with an observable end state that proves it works.

## 3. Prove it

Run the generated skill end to end once: launch, doctor, drive one feature, capture evidence, clean up. Confirm the evidence survived cleanup. Fix failures and clean up after each failed attempt. A skill that was never run is a draft. If you proved it in a stand-in environment, list the setup steps the real target will not get.

## 4. Register

Add the new folder to the skills table in `AGENTS.md` if it has one, matching the folders in `.agents/skills`.

## Verify

- Every command, path, and selector in the generated skill exists in the repo.
- The skill was executed once and produced evidence.
- Cleanup left no stray processes or ports.
- The skills table lists the new folder.
