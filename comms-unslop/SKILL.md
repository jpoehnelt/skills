---
name: comms-unslop
description: Cut machine-written patterns from prose and UI chrome while keeping meaning and voice, or flag them without rewriting. Use when planning, building, or reviewing landing pages, or when drafting or editing prose, docs, PR descriptions, commit messages, replies, or UI copy.
---

# Unslop

Edit text to remove AI patterns. Scan for the patterns below, then rewrite. Preserve meaning and match the intended tone. Keep the author's vocabulary, cadence, and uncertainty. Do not add claims or certainty the draft lacks.

Repo facts (from AGENTS.md): automated prose, brand-term, and SEO or frontmatter lint commands, banned legacy brand terms, and single-source constant files for pricing, limits, and contact details.

For detection-only requests, quote each pattern and suggest a fix. Do not rewrite the whole draft, and do not claim to know whether AI wrote it.

## Run automated checks first

Run the repo's automated prose, brand-term, and frontmatter checks first so mechanical defects (em dashes, curly quotes, banned legacy product names, frontmatter length caps, bare URLs, unlabeled code fences) are caught deterministically. Spend manual editing on judgment calls: cutting filler sections, flattening aphorisms, and checking factual grounding.

## Content

- **Superficial -ing phrases.** "highlighting...", "ensuring...", "showcasing...". Delete or give a real source.
- **Vague attributions.** "Experts believe", "Studies suggest". Name the source or delete.
- **Factual grounding.** Verify dates, metrics, handles, emails, and capability or pricing claims against code or primary sources before keeping them. Derive repeated prices, limits, and contact emails from typed constants rather than hand-copied prose.

## Language

- **AI vocabulary.** Additionally, crucial, delve, enduring, enhance, fostering, garner, interplay, intricate, landscape (abstract), pivotal, showcase, tapestry (abstract), testament, underscore, vibrant. Use plain words.
- **Fancy ways to say "is".** "serves as", "stands as", "boasts", "features". Say "is" or "has".
- **"Not just X, but Y."** State the point directly.
- **Dramatic contrasts.** "X, not Y" disclaimers that deny what no reader assumed. Cut the denial.
- **Rule of three.** Use the natural number of items.
- **Synonym cycling.** Pick one name for a thing and repeat it.
- **False ranges.** "from X to Y" where X and Y are not on a scale. List the topics.

## Style

- **Em dashes.** Avoid them entirely. Use periods or commas. No en dashes or hyphen substitutes.
- **Colon overuse.** Colons are fine before a list or example, not as mid-sentence connectors.
- **Boldface overuse.** Do not bold every proper noun or acronym.
- **Inline-header lists.** A bold label that restates the line ("**Performance:** Performance improved") becomes prose. A bold lead-in that names the item and is followed by new detail is fine.
- **Title case headings.** Use sentence case.
- **Decorative emojis and curly quotes.** Remove them.

## Communication artifacts

- **Chatbot phrases.** "I hope this helps!", "Let me know if...", "Certainly!". Remove.
- **Sycophancy.** "Great question! You're absolutely right!" Answer directly.

## Filler

- "In order to" becomes "To". "Due to the fact that" becomes "Because". Delete "It is important to note that".
- **Hedging.** "could potentially possibly be argued" becomes "may".
- **Generic conclusions.** "The future looks bright." State specific plans or facts. Cut closing recaps that only repeat the point.

## Jargon and plain speech

- **Abstract metaphor nouns.** Substrate, wedge, vector, locus, vantage, nexus, bedrock, scaffolding, modality, paradigm, gold-plating, ratchet, endgame, north star, flywheel, "API surface". Use the concrete word.
- **Say what it does, not how it feels.** "SQL you can read" names a feeling. "`.toSQL()` returns the exact string sent to the database" names a mechanism. If a sentence could appear unchanged in another project's docs, cut it.
- **Dense sentences.** If the reader must backtrack, split it. One idea per sentence.
- **Active voice.** Name the actor: "queries are validated" becomes "the compiler validates queries". Passive is fine when the actor is unknown or irrelevant.
- **Adverbs.** "runs quickly" becomes "is fast" or the number. An adverb propping up a verb means the verb is wrong.
- **Plain words.** utilize and leverage become use, facilitate becomes help, numerous becomes many.
- **Mannered prose.** Aphorisms, rhetorical fragments, personified code, figurative verbs. Say the literal thing.
- **Over-compression.** Dropped articles, verbless fragments, arrows, and abbreviations make the reader decode. Write whole sentences.

## UI chrome

For landing pages, apply these rules before choosing a layout and again when reviewing the rendered page.

- **Labels above the hero headline.** Open the hero with the headline. Add a badge, pill, or plain eyebrow label above it only when the user requests one or the accepted design includes it. Apply the same rule to template defaults. Put verified details that help visitors decide in supporting copy. Put setup instructions in the docs.
- **Decorative section labels.** Remove category chips used as section labels, decorative tags, and version or status badges with no meaningful state. Use numbered labels for actual sequences. Keep labels that communicate meaningful state and chips that serve a user action.
- **Repeated feature cards.** Use a list for peer features that need only a short explanation. Give the main claim room for a concrete example or real product screenshot. Use a card grid when visitors need to scan or compare distinct items.
- **Unsourced proof.** Verify metrics, customer logos, testimonials, and status claims against their sources. Omit unsupported claims and any proof block that would be empty.
- **Decorative motion.** Remove pulsing dots on static labels, blinking cursors on static text, and repeated scroll reveals. Use motion to show a meaningful change or direct attention to an important element.
- **Ornamental backgrounds.** Radial hero glows, decorative grid or dot-matrix backgrounds, and two-tone or gradient heading text. Use a flat surface and one text color.
- **Card-in-card wrappers.** Multi-band cards (header bar, body, muted footer bar) around content that already sits in a section, or a card per paragraph. Use whitespace and hairlines instead.
- **Unrequested chrome.** Filter bars, search boxes, sort toggles, count badges, and decorative icons on every alert or heading that the task did not ask for. Cut them.

## Verify

- Automated prose, brand-term, and frontmatter checks pass with zero banned legacy terms.
- Dates, metrics, emails, and pricing claims match code or typed constants.
- No em dashes, emojis, curly quotes, title case headings, or words from the AI vocabulary or metaphor noun lists remain.
- Every sentence states a fact, instruction, or number. UI surfaces have no decorative pills, glows, grids, or unrequested filter bars.
- On a rendered landing page, check the first viewport at phone and desktop widths. Each label above the hero headline was requested or shown in the accepted design. Each proof claim has a source.
- Meaning, technical accuracy, and the author's stated uncertainty are unchanged.
