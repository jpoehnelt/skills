---
name: ui-audit-loop
description: Visually audit rendered web pages with Playwright screenshots at desktop and mobile widths, automated contrast and overflow checks, asset parity, and an anti-slop checklist, iterating until zero P0 or P1 issues remain. Use when reviewing or polishing pages, layouts, landing pages, or web migrations before claiming done.
---

# UI audit loop

Code and unit tests do not catch clipped mobile layouts, unreadable dark-mode contrast, broken favicons, or decorative slop. Capture real rendered screenshots, inspect every image, fix defects, and re-verify until zero P0 or P1 visual issues remain. Pair with `svelte-ui-delivery` for implementation rules, `comms-unslop` for copy, and `reg-suit` for CI visual baselines.

Repo facts (from AGENTS.md): local dev or preview start command (supporting dynamic port or printed URL), health-check URL, key routes to audit, seeded sign-in or auth state, Playwright and axe commands, live-vs-new asset parity baseline URL (for migrations), and screenshot artifact directory.

## 1. Launch and capture real screenshots

1. Start the app or preview build and poll its health endpoint until HTTP 200 before opening a browser. Use a dynamic port (`--port 0`) when supported to avoid port collisions.
2. Drive Playwright across every changed or key route at both **1280px desktop** and **375px mobile** widths, in light and dark mode when the app supports themes.
3. Save full-page and above-the-fold screenshots into the session or PR artifact directory.
4. Always embed or attach the screenshots in your report or artifact. Never ask the user to open `localhost` to inspect your work.

## 2. Run automated page invariants

Assert these checks on every audited route and viewport:

- **Zero horizontal overflow:** `document.documentElement.scrollWidth <= document.documentElement.clientWidth` at both `375px` and `1280px`.
- **Accessibility and contrast:** run `@axe-core/playwright` (or the repo's axe check) in both light and dark modes with zero color-contrast, landmark, or heading-outline violations.
- **Asset, favicon, and metadata parity:** verify `favicon.ico`, `og:image`, and all rendered `<img>` assets load with HTTP 200 and non-zero natural dimensions. On site migrations, diff rendered images against the live baseline so no page assets drop silently.
- **Runtime cleanliness:** zero uncaught page errors, failed asset requests, or `securitypolicyviolation` CSP events.

## 3. Apply the anti-slop visual checklist

Inspect every captured screenshot directly and flag any P0 (broken layout, overflow, unreadable contrast, missing image) or P1 (visual clutter, slop, raw internals):

- No decorative hero pills, eyebrow badges, or non-interactive tag chips above headings.
- No generic 3-card feature grids or 3-step filler sections unless the content genuinely needs them.
- No internal jargon, debug strings, or implementation labels exposed in user-facing UI.
- No raw unmapped enum strings (such as `not_stated`, `snake_case`, or `undefined`) rendered in templates.
- No overlapping controls, clipped buttons, or unreadable muted text on subtle surfaces.

## 4. Iterate until clean

1. Fix all P0 and P1 findings in code, then re-run the capture and automated checks over every affected route so no stale screenshots remain.
2. Stop when 0 P0 and 0 P1 visual issues remain, or after 3 consecutive iterations without progress (in unattended or headless runs, attach the latest failure screenshots and stop with a clear blocker rather than looping or waiting for input).

## Verify

- Desktop (`1280px`) and mobile (`375px`) screenshots were captured after the final edit and visually inspected.
- Every screenshot is embedded or attached as an artifact; the user was not asked to open `localhost`.
- Zero horizontal overflow, zero axe contrast violations, valid favicon and OG assets, and zero anti-slop P0 or P1 findings remain.
