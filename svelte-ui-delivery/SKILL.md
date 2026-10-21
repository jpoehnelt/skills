---
name: svelte-ui-delivery
description: Implement and verify Svelte 5 (SvelteKit) UI changes with rendered evidence. Use when building pages, forms, components, or shadcn-svelte/Bits UI primitives; fixing responsive, dark-mode, or accessibility issues; writing Storybook stories; or collecting screenshots for a visible change.
---

# Svelte UI delivery

Repo facts (from AGENTS.md or the app's AGENTS.md): where shared primitives and feature components live, the token file and fonts, layout primitives, theme-color and token lint commands, Storybook port and commands, visual-regression setup, the local dev command and seeded sign-in, and check, test, and build commands.

## Discover before designing

- Run `scripts/ui-surface-snapshot.sh [--root DIR]... KEYWORD...` to list matching components, shared primitive folders, routes, consumers, stories and tests, and global CSS tokens.
- Reuse before creating. Generic primitives go in the repo's shared UI package or `components/ui/`; feature components go in `components/<feature>/` (PascalCase). No loose top-level components and no new barrel files.
- Add shadcn-svelte primitives with its CLI (`pnpm dlx shadcn-svelte@latest add <name>`) rather than hand-writing them. `svelte-shadcn` covers writing, customizing, and re-syncing them.
- Icons: import single files (for example `@lucide/svelte/icons/<name>`), not the whole set.

## Decide the experience

- Inspect the existing surface: a supplied screenshot, a focused story, or the running app. State the user's task, how often they do it, and the friction the change removes.
- Choose the smallest presentation that serves the task. Prefer contextual help or onboarding over persistent copy in navigation or repeated controls; keep instructions needed to complete an action visible.
- Preserve hierarchy, density, and scan order. Check wrapping, scrolling, and competing emphasis with representative content at phone and laptop widths. A copy change can still change the layout.
- Contextual help works by pointer, keyboard, and touch, exposes its description to assistive technology, and dismisses without moving focus. Verify touch separately: hover and focus do not prove touch users can open help without triggering another action.
- A persistent notice or banner needs a defined audience, an observable rendering condition, a supported user action, and a permanent invariant or a named owner and removal condition. Non-actionable migration detail belongs in release notes.

## Build

- Svelte 5 runes only: `$state`, `$derived`, `$effect`, `$props`, snippets and `{@render}`. No `export let`, `$:`, `on:` directives, or `<slot>`.
- Load data in `+page.server.ts`/`+layout.server.ts`, remote functions, or the API; components do not `fetch`. Run Effect programs only through the repo's boundary runners (`effect`). A statically adapted site must keep server code prerenderable.
- Colors, radius, and type come from tokens in the global CSS (`bg-background`, `text-muted-foreground`, `var(--...)`). No raw Tailwind palette classes or hex, `rgb()`, `hsl()` literals in components. A new token needs a value in both the light and dark definitions; never rely on `dark:` utilities with raw colors.
- Layout: components that can sit in a sidebar or split pane adapt with container queries (`@container` on the parent, `@sm:`/`@lg:` variants), not viewport breakpoints. Side rails use fixed pixel widths, not percentage clamps. Design at phone width first.
- Motion: animate only `transform` and `opacity`, honor `prefers-reduced-motion`, and never transition focus rings.
- Accessibility: real elements for real roles (`button`, `a`, `nav`), semantic landmarks, one `h1` per page and a valid heading outline, labels on every control, keyboard operation for every pointer action, visible focus, meaningful `alt`, text contrast at least 4.5:1.
- Escape at render; never `{@html}` untrusted data. When a read fails, show a failure state, not an editable empty state.
- Do not change a pricing, limit, permission, or data-handling claim as a copy edit.

## Forms

- Validate with a colocated schema. With Superforms and Effect Schema: server `superValidate(effect(schema))` (adapter from `sveltekit-superforms/adapters`) and `fail(400, { form })` on errors; client `superForm(data.form, { validators: effectClient(schema) })`. Trim before length or email checks.
- Return generic client messages on service failure and log detail server-side.

## Storybook

- Keep stories few: one comprehensive gallery or matrix story per component or page, plus at most one interactive `play` story for keyboard, focus, or state. No story per prop permutation.
- Fix accessibility-addon violations rather than silencing them.
- If a Storybook MCP server is connected, read its story instructions before writing stories and use its test tool for focused checks; otherwise verify props from source and existing stories.
- When stories feed visual regression, register the story in the visual catalog in the same change. Approving screenshot baselines is a human decision.

## Tests

Component tests assert behavior, contracts, and ARIA semantics, never CSS classes, styling, or raw tags. Add one only where behavior is uncertain. For composed behavior, exercise the production composition and each affected entry point. When an editor owns a draft, verify cancel, reopen, and navigation, and that a pristine draft does not trigger work.

## Rendered evidence

- Isolated component change: a focused Storybook story is enough. Run the app when routing, loaders, persistence, or cross-component interaction need verification; do not start the full stack for every edit.
- Use the repo's local dev command and its printed URL. Check the changed route in light and dark mode, at phone and desktop widths, by keyboard only, and with reduced motion on.
- For layout changes, compare before and after at the same viewport, and explain why each added persistent element earns its space. Technical checks alone do not establish a usable design.
- Capture screenshots for the PR. For build-only issues (prerender, images, feeds), build and preview.

## Verify

- The repo's check, lint (including token or theme-color rules), test, and build commands pass, plus the Storybook build when stories changed.
- Light and dark, phone and desktop, keyboard, and reduced motion were checked in the rendered UI.
- No hard-coded colors, no viewport-only layout inside panes, valid heading outline, failed reads not shown as empty editable state.
