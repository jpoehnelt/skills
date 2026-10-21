---
name: agents-reflect
description: After a work session, review what went wrong and right and turn each lesson into a concrete edit to an existing skill or AGENTS.md line. Use when the user says "reflect" or /agents-reflect.
---

# Reflect

Mine the current conversation for durable lessons, then route each into an edit. Use the conversation already in context. Do not read transcript files.

Skip when the session was trivial or a skill the agent followed correctly already covers it. One-offs are not lessons.

Repo facts (from AGENTS.md or CLAUDE.md): the skills folder and table, where durable invariants live, where lint or syntactic rules live, and where design docs or plans belong.

## 1. Collect evidence

List, from this conversation:

- Corrections the user made to the agent.
- Steps that failed, were retried, or were redone.
- Searches that took too long, and the fact that would have shortened them.
- Things that worked and should be repeated.
- Instructions the agent ignored or misread.

Each item needs a concrete quote or event from the conversation. Drop anything without one.

## 2. Review through three lenses

When the user authorizes delegation, spawn three parallel subagents in one turn, using a smaller, faster model. Otherwise, review the three lenses yourself. (Claude Code: the Agent tool; Codex: its subagent/collaboration tool.) If the client caps concurrent subagents, run the lenses in batches within that cap. Paste the evidence list into each brief. Each lens returns findings with the supporting evidence.

- **Judgment.** Wrong decisions, missed questions, unverified claims, scope creep.
- **Tooling.** Wrong commands, missing scripts, slow paths, checks that should have been automated.
- **Divergent.** What a different approach would have avoided, and which assumption was wrong.

Synthesize the findings yourself, or use one synthesizer subagent on the strongest available model when delegation is authorized. It gets all three outputs, merges duplicates, and returns Accepted, Rejected, and Backlog lists.

## 3. Route each lesson

Find where it belongs. Run `ls .agents/skills` and read `AGENTS.md` and its skills table, if one exists. Follow any placement rule AGENTS.md states.

- A procedure or design check in an existing skill's area: edit that `.agents/skills/<name>/SKILL.md`, usually its review checklist. Keep it within 80 lines, cutting text to make room. If the repo vendors that skill from a shared source, propose the change upstream instead of editing the copy.
- A durable invariant, not a procedure: edit one line of `AGENTS.md`.
- Principles, decision records, and plans go where AGENTS.md says they live, not into a new docs file.
- No skill fits and the lesson will recur: propose a new skill folder and add it to the skills table.
- A rule a lint, script, or type could enforce: move it to Backlog and propose the enforcer (in the repo's existing lint or check system) instead of more text. The `agents-correct` skill covers the ladder.

Never add a duplicate of an existing rule.

## 4. Apply

Present the Accepted, Rejected, and Backlog lists in chat. Apply only the subset the user authorized; an explicit request to incorporate lessons already supplies authorization. Ask when an edit expands the requested scope. Skill edits affect every future agent, so never apply unrequested edits. Make exact diffs, then commit, push, or leave the changes as the repo's or session's delivery rules require.

## 5. Summarize

- Edits applied: file path and one line on what changed.
- New skills created, if any.
- Backlog: one line each.
- Dropped: one line each with the reason.

## Review checklist

- Each lesson cites an event in the conversation.
- Each accepted edit names a real existing file.
- No skill exceeds 80 lines after editing.
- Nothing was applied without authorization.
