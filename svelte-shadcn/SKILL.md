---
name: svelte-shadcn
description: Add, write, customize, or review shadcn-svelte components built on Svelte 5, Bits UI, tailwind-variants, and Tailwind v4 tokens. Use when adding a primitive with the shadcn-svelte CLI, changing a variant, adding a theme token, wrapping a Bits UI part, publishing primitives from a component package, or re-syncing a generated component.
---

# shadcn-svelte components

shadcn-svelte copies component source into the repo: Svelte 5 runes, Bits UI for behavior and accessibility, `tailwind-variants` for variants, and `cn()` (`clsx` plus `tailwind-merge`) for classes. The copied files are the repo's code, not a dependency. This skill covers how to write them; `svelte-ui-delivery` covers the change workflow, stories, and rendered evidence.

Repo facts (from AGENTS.md or the app's AGENTS.md): where generated and shared primitives live and the `components.json` aliases, the token file, which tokens are public API, the token or theme lint command, how a shared package exports primitives, and the check, test, and Storybook commands.

## Add a primitive

1. Check whether it exists, in the app's generated folder and in any shared package. Extend the existing one rather than adding a second.
2. Run `pnpm dlx shadcn-svelte@latest add <name>` from the directory that holds `components.json`. Read every generated file before using it.
3. Adapt it to the repo: replace raw colors with tokens, apply the repo's radius and focus-ring rules, and move it into the shared package if more than one app needs it.
4. Record local edits in the file or the PR so a later re-sync can reapply them.

## Write and customize

- Svelte 5 only: `$props()`, `$bindable`, `$derived`, snippets with `{@render children?.()}`. No `export let`, `<slot>`, or `on:` directives.
- Accept `class` and merge it last with `cn(variants(...), className)`, so callers can override and `tailwind-merge` drops the conflicting class.
- Type props as the native element's attributes (`HTMLButtonAttributes`) wrapped in `WithElementRef`, expose `ref = $bindable(null)`, and spread `...restProps` onto the root so callers can pass `aria-*`, `data-*`, and handlers.
- Variants live in one `tv({ base, variants, compoundVariants, defaultVariants })` exported beside the component, with `VariantProps<typeof x>` for the prop types. Add a variant there; never restyle a variant with a `class` string at each call site.
- Mark parts with `data-slot="<part>"` so parents and tests can target them without class names.

## Tokens and Tailwind v4

- Components read semantic tokens only: `bg-primary`, `text-muted-foreground`, `border-border`, `ring-ring`, `rounded-lg` from `--radius`. No palette classes (`bg-blue-500`) and no hex, `rgb()`, or `oklch()` literals in components.
- Tokens are CSS variables defined for light on `:root` and for dark on `.dark`, then mapped to utilities in `@theme inline` (`--color-primary: var(--primary)`). Dark mode is `@custom-variant dark (&:is(.dark *))`.
- A new token gets a light value, a dark value, and an `@theme inline` mapping in the same change. A component that needs `dark:` with a raw color needs a token instead.
- Keep shadcn token names. In a published package the token names are public API: adding one is a minor change, renaming or removing one is breaking.

## Bits UI

- Wrap Bits UI parts (`Dialog.Content`, `Select.Trigger`) rather than rebuilding focus traps, roving focus, or typeahead. Keep their roles, labels, and keyboard handling.
- Type a wrapper as `WithoutChildrenOrChild<Primitive.ContentProps>` plus the props it adds, pass `bind:ref`, and spread the rest onto the primitive.
- Use the primitive's `child` snippet only when the rendered element must change; it replaces the element, so the snippet must spread the props it receives.
- A family exports its parts from one `index.ts` (`Root`, `Trigger`, `Content`, plus prefixed aliases such as `DialogContent`), so callers write `<Dialog.Root>`.
- Every form control has a visible label or `aria-label`. Errors set `aria-invalid` and `aria-describedby` on the control.

## Publishing primitives from a package

- One subpath export per family (`<pkg>/button`) pointing at its `index.ts` or the built `dist` file, with `svelte` and `types` conditions. No root barrel, so consumers load only what they import.
- The package ships its token CSS. Consumers import it once and theme by overriding token values in `:root` and `.dark`. They keep the token names and never restyle a component's classes.

## Re-sync a generated component

1. Note the local edits: `git log -p -- <component dir>`.
2. Run `add <name> --overwrite`, then reapply the edits from the diff, starting with tokens, radius, and variants.
3. Review the full diff before committing. An upstream change to a variant or token name is a breaking change for consumers.

## Review checklist

- No palette classes or color literals; every new token has light, dark, and `@theme inline` entries.
- Props accept `class`, `ref`, and the rest, and `class` merges last through `cn`.
- Variants changed in `tv()`, not at call sites.
- Bits UI behavior and accessibility left intact; controls are labeled.
- A shared primitive lives in the shared package with its own subpath export.
- The repo's check, token lint, and stories pass; `svelte-ui-delivery` covers the rendered evidence.
