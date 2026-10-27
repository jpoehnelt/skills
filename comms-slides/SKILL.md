---
name: comms-slides
description: Review and fix a talk's slide text and speaker notes, replacing quotable one-liners with plain claims, checking every claim against evidence, and keeping slide order and cross-references consistent. Use when editing a deck or talk, asked to tighten or unslop slides, reorder slides, or trim a talk for time.
---

# Slides

Slide text is read by the audience in a few seconds, so each line states one literal claim. Speaker notes are spoken and may keep some rhythm, but every line still says something. Use `comms-unslop` for word-level patterns; this skill covers the patterns that show up in talks.

Repo facts (from AGENTS.md): where decks and speaker notes live and their format, how to build or preview a deck, and where the evidence behind the talk lives (an example repo, data, past PRs).

## Shape each slide

- One idea per slide. If a slide makes two points, split it or cut one.
- The title states the slide's claim as a short sentence ("Agents copied the most common catch pattern"), not a topic label or a slogan. The body is the evidence: a chart, diagram, code, or a few short lines.
- Keep slide text light enough to read while the speaker talks. Move explanation, caveats, and transitions into the notes.
- Read the titles in order: they should tell the talk's argument on their own.

## Find the one-liners

Read every sentence in the slide text, card titles, and speaker notes. Flag the short, quotable-sounding ones:

- **Punchline after a fact.** A short closer that restates or dramatizes the sentence before it ("Expect it.").
- **Staccato set of three.** "The first is volume. The second is inconsistency. The third is progress."
- **Reversal.** "A doc did not stop this. A failing check did."
- **Aphorism.** A general maxim in place of the specific finding ("A passing check proves nothing by itself.").
- **Figure of speech for a claim.** "use the bridge as a way out" for "add a suppression instead of fixing the code".
- **Setup line.** Announces content without giving any ("The catch is cost.", "Two things are new.").
- **Slogan title.** A card or slide title that reads as a tagline instead of stating the slide's claim.

## Fix them

- Fix slide text first; the audience reads it. Then fix the notes.
- Rewrite each line as the literal claim it stands for, or cut it when the line before already makes the point. "Cut it" is often the best fix.
- A rewrite never adds a claim. If the plain version would state something the evidence cannot back (a share, a trend, a comparison between models or teams), cut the line or soften it to what is shown, and say which you chose.
- Merge a staccato set into one sentence or a list. Replace a reversal with the direct statement ("The fix was an architecture change.").
- In notes, keep cadence that helps delivery, but drop setup lines and aphorisms.

## Order and cross-references

- Introduce a thing before any slide or note refers to it: show the example before saying "this migration".
- Put the motivating problem right before the method it motivates.
- After any reorder, search the notes for references to position and time: "we saw", "earlier", "next", "the next part of this talk", slide numbers, and section outlines. Fix each one for the new order.

## Trim for time

Merge slides that make one point instead of cutting content: a multi-slide case study into fewer slides, two short related slides into one. Propose merges with slide numbers and keep the count visible.

## Report

- **Detection only:** a table of slide number, the original line, and the plain version or "Cut it", for slide text; notes lines grouped by pattern. List the rewrites that would add a claim and need evidence, then ask before applying.
- **After applying:** the new order with the old position of each moved slide, the cross-references fixed, lines cut, lines rewritten, claims softened or removed and why, and the slide count.

## Review checklist

- Each slide has one idea and a title that states its claim; the titles in order tell the argument.
- Every slide line states one literal claim, with numbers that have a source.
- No punchlines, staccato threes, reversals, aphorisms, setup lines, or slogan titles remain on slides.
- No rewrite added a claim the evidence does not support.
- Each thing is introduced before it is referenced, and no note points to the wrong position.
- Prose passes `comms-unslop`.
