---
name: comms-unslop
description: Cut machine-written patterns from prose while keeping meaning and voice, or flag them without rewriting. Use when drafting or editing prose, docs, PR descriptions, commit messages, or replies that read machine-written.
---

# Unslop

Edit text to remove AI patterns. Scan for the patterns below, then rewrite. Preserve meaning and match the intended tone. Keep the author's vocabulary, cadence, and uncertainty. Do not add claims or certainty the draft lacks.

For detection-only requests, quote each pattern and suggest a fix. Do not rewrite the whole draft, and do not claim to know whether AI wrote it.

## Content

- **Superficial -ing phrases.** "highlighting...", "ensuring...", "showcasing...". Delete or give a real source.
- **Vague attributions.** "Experts believe", "Studies suggest". Name the source or delete.

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

## Verify

- No em dashes, emojis, curly quotes, or title case headings remain.
- No word from the AI vocabulary or metaphor noun lists remains.
- Every sentence states a fact, instruction, or number.
- Meaning, technical accuracy, and the author's stated uncertainty are unchanged.
