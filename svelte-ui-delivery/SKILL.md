---
name: svelte-ui-delivery
description: Implement and verify Svelte 5 (SvelteKit) UI changes with rendered evidence. Use when building landing pages, app screens, forms, components, or shadcn-svelte/Bits UI primitives; fixing responsive, dark-mode, or accessibility issues; writing Storybook stories; or collecting screenshots for a visible change.
---

# Svelte UI delivery

Repo facts (from AGENTS.md or the app's AGENTS.md): where shared primitives and feature components live, the token file and fonts, layout primitives, theme-color and token lint commands, Storybook port and commands, visual-regression setup, the local dev command (with dynamic port and health URL) and seeded sign-in, and check, test, and build commands.

## Discover before designing

- Run [`scripts/ui-surface-snapshot.mjs`](scripts/ui-surface-snapshot.mjs) `[--root DIR]... KEYWORD...` to list matching components, shared primitive folders, routes, consumers, stories and tests, and global CSS tokens.
- Reuse before creating. Generic primitives go in the repo's shared UI package or `components/ui/`; feature components go in `components/<feature>/` (PascalCase). No loose top-level components and no new barrel files.
- Add shadcn-svelte primitives with its CLI (`pnpm dlx shadcn-svelte@latest add <name>`) rather than hand-writing them. `svelte-shadcn` covers writing, customizing, and re-syncing them.
- Icons: import single files (for example `@lucide/svelte/icons/<name>`), not the whole set.

## Decide the experience

- Inspect the existing surface: a supplied screenshot, a focused story, or the running app. State the user's task, how often they do it, and the friction the change removes.
- Choose the smallest presentation that serves the task. Prefer contextual help over persistent copy in navigation; keep instructions needed to complete an action visible. Do not add decorative eyebrow badges, status pills, hero glows, background grids, card-in-card wrappers, or unrequested filter bars.
- For landing pages, read the UI chrome rules in `comms-unslop` before choosing the hero and section layout. Use project content to decide which sections the page needs. Inspect shared hero components for default badges or copy before reusing them.
- Preserve hierarchy, density, and scan order at phone and laptop widths with realistic content. Contextual help must work by pointer, keyboard, and touch without triggering adjacent actions or moving focus.
- A persistent notice or banner needs a defined audience, observable rendering condition, supported user action, and either a permanent invariant or a named owner and removal condition.

## Build

- **Svelte 5 runes only:** `$state`, `$derived`, `$effect`, `$props`, snippets, and `{@render}`. No `export let`, `$:`, `on:` directives, or `<slot>`.
- **Data loading:** load data in `+page.server.ts`/`+layout.server.ts`, remote functions, or the API; components do not `fetch`. Run Effect programs only through the repo's boundary runners (`effect`). Keep statically adapted server code prerenderable.
- **Tokens and dark-mode contrast:** colors, radius, and type come from global CSS tokens (`bg-background`, `text-muted-foreground`, `var(--...)`). No raw Tailwind palette classes or hex, `rgb()`, `hsl()` literals. Define every new token in both light and dark themes and verify every foreground/background semantic pairing in both modes (never pair a light-mode ink token on a dark subtle surface such as `bg-destructive-subtle`).
- **Layout and overflow:** components inside sidebars or split panes adapt with container queries (`@container`, `@sm:`/`@lg:`), not viewport breakpoints. Side rails use fixed pixel widths. Design at phone width first and ban unguarded `100vw` or `calc(50% - 50vw)` full-bleed rules that overflow when scrollbars appear.
- **Focus return and draft reset:** when a panel, modal, shortcut, or action (save, ratify, restore, dismiss) closes or hides a surface, return keyboard focus to the invoking control. Clear or refresh component drafts and footer state on route or entity-ID navigation.
- **Disabled controls and pointer safety:** on disabled link-buttons (`<a>`), suppress click and keyboard activation handlers and hover styles. Forward `$bindable` values and keep controlled state behind a thunk in Bits UI wrappers (`svelte-shadcn`). Cancel active touch or pointer gestures when a component becomes disabled or enters multi-touch pinch.
- **Motion and accessibility:** animate only `transform` and `opacity`, honor `prefers-reduced-motion`, and never transition focus rings. Use real elements (`button`, `a`, `nav`), semantic landmarks, one `h1` per page, valid heading outlines, labels on every control, visible focus, meaningful `alt`, and at least 4.5:1 text contrast.
- **Safety:** escape at render; never `{@html}` untrusted data. Show a failure state on failed reads, never an editable empty state. Never change pricing, limit, permission, or data-handling claims as a copy edit.

## Forms

- Validate with a colocated schema. With Superforms and Effect Schema: server `superValidate(effect(schema))` and `fail(400, { form })` on errors; client `superForm(data.form, { validators: effectClient(schema) })`. Trim before length or email checks.
- Return generic client messages on service failure and log detail server-side.

## Storybook

- Keep stories few: one comprehensive gallery or matrix story per component or page, plus at most one interactive `play` story for keyboard, focus, or state. Fix accessibility-addon violations rather than silencing them.
- If a Storybook MCP server is connected, read its story instructions first and use its test tool; otherwise verify props from source and existing stories.
- Register new visual stories in the visual catalog in the same change when auto-discovery is off. Approving screenshot baselines is a human decision; route failing visual statuses to `reg-suit`.

## Tests

Component tests assert behavior, contracts, and ARIA semantics, never CSS classes, styling, or raw tags. Exercise the production composition and each affected entry point. When an editor owns a draft, verify cancel, reopen, route navigation, and that a pristine draft triggers no work.

## Rendered evidence

- Isolated component change: a focused Storybook story is enough. Run the app when routing, loaders, persistence, or cross-component interaction need verification.
- Start the dev server with a dynamic port (`--port 0` when supported) and poll its health endpoint until HTTP 200 before navigating in a browser.
- Verify `scrollWidth <= clientWidth` at **360px** and **1280px** with long realistic data (64-character identifiers, wide tables, editor toolbars), in both light and dark modes, by keyboard only, and with reduced motion on.
- For landing pages, review the first viewport and full page at both widths against the UI chrome rules in `comms-unslop`. Check the rendered output of shared components for labels the page itself may never declare.
- Capture and embed screenshots for the PR (never ask the user to open `localhost`); use `ui-audit-loop` for full multi-route visual audits. After a cross-cutting CSS or layout pass, re-capture every referenced screenshot target so no stale images remain.

## Verify

- Check, lint (including token and theme-color rules), test, build, and Storybook build (when stories changed) pass.
- `scrollWidth <= clientWidth` verified at 360px and 1280px with zero unguarded `100vw`/`50vw` rules.
- Light and dark semantic contrast, keyboard focus return, draft reset on navigation, disabled link suppression, and reduced motion verified in the rendered UI.
- No hard-coded colors, valid heading outline, failed reads not shown as empty editable state.
