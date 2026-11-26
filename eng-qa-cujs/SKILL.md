---
name: eng-qa-cujs
description: Run agent-driven QA across critical user journeys on web, API, extension, mobile, or service surfaces, with exploratory variations and evidence reports. Use for end-to-end QA, pre-release checks, or verifying user-visible changes beyond automated regression suites.
---

# QA critical user journeys

Exercise the real app across its critical user journeys and collect evidence. Automated regression suites are baseline coverage. This pass verifies user-visible results, visual quality, and exploratory variations. For building a small automated surface harness from scratch, use `agents-create-verification-skill`. For deciding test placement and assertions, use `eng-testing`.

Repo facts (from AGENTS.md): surface-to-CUJ-catalog paths, local stack start command and port registry, disposable test accounts and fixtures, narrow regression suite commands per surface, browser or device prerequisites, and the git-ignored directory for QA reports.

## Scope and preconditions

- Accept a surface, journey IDs, or tags. With none, run every surface the environment can reach and mark the rest blocked with the reason.
- Check prerequisites before building: browser binary, signed-in test profile, MCP connection, connected test device, or required local services.
- A skipped test, unreachable service, or missing device is blocked, never a pass.

## Safety rules

- Run build scripts and signed-in journeys only on code you trust (your own branch or a reviewed change). For unreviewed external changes, use a sandbox with a stub backend and an empty profile.
- Use disposable local fixtures, test profiles, and test devices. Before running any publisher, load generator, or CLI against a network endpoint, verify the target URL so synthetic traffic never hits a shared or production service without authorization.
- Require explicit authorization before clearing app state on a personal device or targeting shared staging or production data.
- Never complete a production checkout, enter payment details, or sign out of a shared account. Never overwrite committed fixture sources.

## Exercise and report

1. Record the branch, commit SHA, changed behavior, and selected journeys.
2. Start only the local stack and builds required for the selected surfaces, reading checkout-specific URLs and ports from the repo's startup output or instance registry.
3. Run the narrowest existing regression suite for each selected journey first. Record failures and skipped tests with their report paths.
4. Walk each journey's steps from its catalog, check every expectation, and capture screenshots, HTTP responses, or metrics at each checkpoint.
5. Try one relevant variation per journey: keyboard navigation, narrow viewport, reconnect, invalid input, or rapid repetition.
6. Inspect app, server, and browser console errors after each journey. Reproduce failures and separate product defects from missing fixtures or stopped services.
7. Write a report in the repo's ignored QA output directory or a temporary directory. Start with a table (journey ID, pass, fail, or blocked, and a one-line note). For each failure, record exact reproduction steps, expected and actual behavior, commit SHA, environment, console or log excerpts, evidence paths, and whether existing automated tests cover it. Propose a regression test for any confirmed gap.
8. Restore temporary edits, close extra tabs, and stop only processes you started. Leave the report and evidence intact.

## Verify

- Every selected journey has an explicit pass, fail, or blocked verdict with supporting evidence.
- At least one exploratory variation ran for each passed journey.
- No skipped check or unreachable surface was reported as a pass.
- Cleanup stopped only run-owned processes and left shared fixtures and environments untouched.
