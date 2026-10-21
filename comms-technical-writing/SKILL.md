---
name: comms-technical-writing
description: Layered technical-writing standard covering document modes, sentence style, instruction rules, and unambiguous syntax. Use when writing or reviewing skills, docs, READMEs, RFCs, PR descriptions, or commit messages.
---

# Technical writing

Write so a tired engineer understands on the first read. Apply all layers.

Repo facts: where the repo keeps durable docs, design records, and change notes or changesets, and any style guides for user-facing copy (`AGENTS.md` or `CLAUDE.md`).

Three rules sit above them:

- **Cut every word that does no work.** "In order to" is "to".
- **Use the short, everyday word.** "Use", not "utilize". A long word must buy its length with precision.
- **When a rule makes a sentence worse, fix the sentence another way.** A sentence that obeys every rule and sounds machine-written has failed.

The codebase is the word list. Write the real symbol, file, flag, or command name. Do not invent jargon. Use words a developer says out loud: "move", "delete", "a budget that only decreases". Preserve the author's meaning and uncertainty when editing.

## Vary the rhythm

- Mix sentence lengths. Short sentences land a point. Longer ones carry a fact with its condition.
- Have a view where the mode allows it. Explanation weighs trade-offs. Reference stays dry.
- Be specific. Not "schema changes can cause issues" but "a column rename fails the build".

## Pick one mode per document

Ask whether the content serves action or understanding, and learning or work.

- **Tutorial** (action, learning). Say what the learner will build. Every step shows a visible result and the expected output. Explanation is one clause and a link.
- **How-to** (action, work). Solve a task the reader already has. Assume competence. Action only, no background. Name the guide by the task.
- **Reference** (understanding, work). Describe only. No instruction or opinion. Dry, complete, mirrors the structure of the thing described.
- **Explanation** (understanding, learning). One bounded topic. Give context, constraints, alternatives. Opinion is allowed here only.

Do not mix modes. Split and link instead.

## Sentences

- Address the reader as "you", in the present tense.
- Name the actor: "the compiler checks", not "is checked".
- Write instructions as commands. Put the condition first: "To delete the file, run X."
- Put the common case first and exceptions after.
- No "please", "simply", "easy", or "quickly" in a procedure.
- Link with words that say where the link goes. Never "click here".
- Headings carry the point, in sentence case. One h1 per page, no skipped levels.
- Numbered lists for sequences, bullets otherwise. Introduce lists with a full sentence. Keep items parallel.
- Code in code font. Use serial commas. Drop "etc.".

## Instructions

- One instruction per sentence. Split instructions over about 20 words and other sentences over about 25.
- Put the warning before the step it guards.
- Keep "the" and "a". Use one word per action and one meaning per word.
- Write procedures as direct commands, not passive narration.

## One reading only

- Keep "only" and "not" next to the word they change.
- Break long noun strings: "the script that checks the import budget".
- Make every "it", "they", and "this" point at one thing. Never use "this" or "which" for a whole clause.
- Do not drop verbs. Keep "that" where it shows structure.
- Use periods, not semicolons or em dashes. No slashes: write "a, b, or both".
- Call each thing by one name everywhere.
- Skip idioms, Latin abbreviations, and metaphors.

## Where things go

- Run `comms-unslop` over every document this skill touches. User-facing copy also follows any style guide `AGENTS.md` names.
- Keep durable rules in `AGENTS.md` and short task guidance in skills. Keep a README to purpose and quick start. Put design docs and change notes where `AGENTS.md` says; do not invent a new docs folder.
- Read the code for current files, contracts, commands, and limits instead of copying them into Markdown inventories.
- A PR body is a briefing a reviewer reads in under a minute. Describe the problem, resulting behavior, decisions, validation, and deferred scope. Link long logs and metric tables instead of pasting them.
- Do not list files, exported signatures, error class names, or test counts in a PR body. The diff and CI already show them, and review pushes make the copy wrong.
- After a push that changes behavior, renames a surface, or drops scoped work, update the PR body and the linked issue's scope in the same session.
- Write real paths. Make every count or tree claim true at the commit that lands it, and include the command that regenerates it.

## Review checklist

- One document, one mode.
- Every sentence has a named actor and a single reading.
- Every path, flag, and command exists.
- `comms-unslop` pass done.
