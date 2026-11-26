---
name: comms-promo-video
description: Plan, storyboard, build, score, and visually verify product launch, hype, and promotional videos (defaulting to Remotion). Use when creating a launch trailer, feature announcement, social promo, or landing-page demo clip, or when fixing a video that looks generic, sluggish, or broken.
---

# Promo and hype videos

Make a promo video that looks like the product it advertises, lands one clear claim per beat, and ships only after frame-by-frame visual inspection. Default to Remotion for programmatic builds and follow [references/remotion-craft.md](references/remotion-craft.md) for motion, media, and render mechanics, consulting Remotion's documentation when you need low-level API details.

Repo facts (from AGENTS.md): brand tokens (palette, display and body fonts, radii, motion curves), logo and media asset paths, video workspace and render commands, target aspect ratios and channels, and product copy guidelines.

## 1. Settle the brief from the repo first

- Read the repo, design tokens, marketing copy, and existing media before asking questions. Propose a concrete brief and shot list, mark what you inferred, and ask only for what the repo cannot answer: goal, channel, exact CTA URL, or which real payoff file to show when several exist. In unattended or headless runs, proceed with documented defaults and mark inferred choices clearly (or fail fast if no real payoff asset exists) instead of waiting for interactive input.
- Offer once up front to follow any exact flow, copy line, or screen the user wants included or excluded. Do not stall behind a long intake form.
- State explicitly whether the clip is a **standalone promo** (plays once on click, sound on, 15 to 60 seconds, ends on a logo and CTA) or an **embedded page loop** (autoplays muted, short, seamless seam back to frame 0). Never assume silently.
- Never invent a fake payoff screenshot, fake metric, or lookalike asset. Use real product UI, real output files, or real captured recordings.

## 2. Lock storyboard and pacing before code

- Budget shots tightly: 6 to 8 scenes for a 30-second promo, or 10 to 12 for 60 seconds. Write a table with each scene's start and end time, visual subject, on-screen copy (five words or fewer per title card), and transition before writing code.
- Structure a launch or hype spot in four beats:
  1. **Hook (0 to 2s).** Motion in the first 0.5 seconds, boldest visual, and one sharp claim.
  2. **Context (2 to 6s).** One concrete friction the viewer recognizes.
  3. **Product proof (6 to 24s).** Real interface, code, or outcome across 2 to 4 focused beats.
  4. **Payoff and CTA (final 4 to 6s).** Biggest result, followed by a calm hold on the brand mark and verified domain or action.
- Use contrast in pacing: follow each sharp entrance with 0.5 to 0.7 seconds of stillness so the viewer can read. Constant motion reads as frantic, while deliberate holds make the hits land.
- Keep the frame alive: introduce a new visual element or subtle motion at least every 3 seconds.
- Run `comms-unslop` on every title card, caption, and voiceover line. State concrete user outcomes (`comms-impact`) and plain claims (`comms-slides`), not vague hype.

## 3. Match the product's brand

- Derive palette, fonts, radii, and motion curves from the product's real design tokens. Keep a 60-30-10 color balance: one ground, secondary surfaces, and at most one hero accent element per frame.
- Do not default to purple gradients, neon glows on every card, or fallback system fonts unless the product's own brand uses them.
- Size hero type for mobile feeds: 80 to 140px at 1080px wide (9:16), or 100 to 160px at 1920px wide (16:9). Use tight display tracking, weight 600 or above for headlines, and `tabular-nums` for animated counters.
- Respect platform safe zones: keep critical text and UI inside the middle 75% vertically for 9:16 social feeds (platform chrome covers top and bottom) and clear of frame edges on 16:9.

## 4. Build audio-first when sound is in scope

- For standalone promos with narration or music, generate or pick the voiceover and music bed before locking final scene lengths. Compute `framesPerBeat = fps * 60 / bpm` and place major cuts on beats or vocal phrases.
- Start impact sound effects (whooshes, clicks, bass hits) 2 to 3 frames before the visual lands. Early feels synced, and late feels broken.
- Keep music low (around 0.2 to 0.3 gain) and duck it further under narration. Add synced captions when the clip will run on social feeds that autoplay muted.

## 5. Render and visually verify

- Never deliver an unverified render. Extract frames across every scene, transition, and loop seam, and inspect every extracted PNG for clipped text, overlapping elements, wrong fonts, blank frames, tiling, or luminance flashes.
- Fix any defect, re-render, and re-inspect the affected frames before sharing the file.

## Verify

- Brief and storyboard match the target channel, aspect ratio, safe zones, and verified CTA URL.
- Every headline, caption, and narration line passed `comms-unslop` and uses real product assets and claims.
- Brand tokens, loaded display fonts, and contrast hold across every scene.
- Audio, captions, and beat cuts align (or the clip is explicitly a muted loop with a clean seam back to frame 0).
- Extracted frames from the final render were visually inspected across all scenes and transitions with no clipping, flashing, or fallback fonts.
