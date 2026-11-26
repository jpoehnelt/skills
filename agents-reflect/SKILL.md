---
name: agents-reflect
description: After a work session, review what went wrong and right and turn each lesson into a concrete edit to an existing skill or AGENTS.md line. Use when the user says "reflect" or /agents-reflect.
---

# Reflect

Mine the current conversation for durable lessons, then route each into an edit. Use the conversation already in context. Do not read transcript files.

Skip when the session was trivial or a skill the agent followed correctly already covers it. One-offs are not lessons.

Repo facts (from AGENTS.md or CLAUDE.md): the skills folder and table, `skills-lock.json` or `.agents/skills.json`, where durable invariants live and the `AGENTS.md` size budget, where lint or `sgpack` rules live, upstream skills and shared rule-pack repos, and where design docs or plans belong.

## 1. Collect evidence

List, from this conversation:

- Corrections the user made to the agent.
- Steps that failed, were retried, or were redone.
- Searches that took too long, and the fact that would have shortened them.
- Things that worked and should be repeated.
- Instructions the agent ignored or misread.

Each item needs a concrete quote or event from the conversation. Drop anything without one.

## 2. Review through three lenses

When the user authorizes delegation, spawn three parallel subagents in one turn, using a smaller, faster model. Otherwise, review the three lenses yourself. If the client caps concurrent subagents, run the lenses in batches within that cap. Paste the evidence list into each brief. Each lens returns findings with supporting evidence.

- **Judgment.** Wrong decisions, missed questions, unverified claims, scope creep.
- **Tooling.** Wrong commands, missing scripts, slow paths, checks that should have been automated.
- **Divergent.** What a different approach would have avoided, and which assumption was wrong.

Synthesize the findings yourself, or use one synthesizer subagent on the strongest available model when delegation is authorized. Merge duplicates and return Accepted, Rejected, and Backlog lists.

## 3. Route each lesson

Find where each lesson belongs. Run `ls .agents/skills`, check `skills-lock.json` or `.agents/skills.json`, and read `AGENTS.md`. Follow any placement rule `AGENTS.md` states.

- **Upstream-managed vendored skills:** Check `skills-lock.json` or `.agents/skills.json` before editing any `.agents/skills/<name>/SKILL.md`. Never edit an upstream-managed vendored copy locally. Route the edit to the upstream skills repo (or Backlog naming that upstream repo) so `skills-sync` propagates it everywhere.
- **Repo-local skill edit:** Edit that local `.agents/skills/<name>/SKILL.md`, usually its review checklist. Keep it within 100 lines, cutting text to make room.
- **Avoid bloating `AGENTS.md`:** Never append to `AGENTS.md` when it is near the repo's size budget (harnesses silently truncate large instruction files). Prefer an `sgpack` rule, lint check, or domain skill over adding prose to `AGENTS.md`.
- **Enforceable rules:** Move any rule a lint, `sgpack` rule, script, or type could enforce to Backlog naming the target enforcer (`agents-correct`). If it protects a shared stack used across repos, target the shared rule pack or org workflow repo instead of a repo-local script.
- **New repo-local skill:** Only when no existing skill fits and the lesson will recur locally; add it to the skills table.

Never add a duplicate of an existing rule.

## 4. Apply

Invoking `agents-reflect` authorizes applying unambiguous, cap-compliant edits to repo-local skills or non-bloated `AGENTS.md` lines directly without pausing for a separate confirmation round. Only ask before applying edits that expand scope, create a new skill, or modify external repos. In unattended or headless runs, apply only unambiguous repo-local edits and record ambiguous or cross-repo items in Backlog instead of waiting for interactive input. Make exact diffs, then commit, push, or leave the changes as the repo's or session's delivery rules require.

## 5. Summarize

- Edits applied: file path and one line on what changed.
- New skills created, if any.
- Backlog (including upstream skill or shared rule-pack targets): one line each.
- Dropped: one line each with the reason.

## Review checklist

- Each lesson cites an event in the conversation.
- No upstream-managed vendored skill was edited locally.
- `AGENTS.md` stayed within its size budget; enforceable rules went to Backlog (`sgpack`, lint, types).
- Every edited skill remains within 100 lines; unambiguous repo-local edits were applied directly.
