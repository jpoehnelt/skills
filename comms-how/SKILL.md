---
name: comms-how
description: Explain how a subsystem works, its architecture, runtime flow, and where new code belongs. Use for "how does X work", walkthroughs before changing something, and placement or ownership questions like "where should this live" or "which package owns this". Use comms-why for motivation.
disable-model-invocation: true
---

# How

Answer "how does X work?" at the level of a senior engineer onboarding onto a subsystem. Build a working mental model without reading like annotated source. Use `comms-why` for motivation and history.

Repo facts: the ownership, layering, and boundary rules in the repo's `AGENTS.md` (or `CLAUDE.md`).

## 1. Assess scope

If the question is ambiguous, state your interpretation and proceed. The user can redirect.

- **Simple.** One module, one function, or a narrow question. Explore it yourself with the client's file read and search tools (or `rg` and `cat`), then go to step 4.
- **Complex.** A subsystem spanning files or services, a cross-cutting feature, or an architecture overview. Go to step 2.

When in doubt, take the simple path.

## 2. Explore (complex only)

Split the question into 2 to 4 angles, each a distinct slice such as entry points, data model, side effects, or error paths.

When delegation is authorized, spawn one read-only exploration subagent per angle, all in a single turn, using a smaller, faster model. (Claude Code: the Agent tool with the Explore type; Codex: its subagent/collaboration tool.) If the client caps concurrent subagents, run the angles in batches within that cap. Without delegation authorization, or when the client cannot spawn subagents, inspect the angles yourself in sequence.

Each brief states the angle and asks for: key files with `file:line`, the main types and functions, the control flow in order, and anything surprising. It tells the explorer to report only what it read.

## 3. Synthesize (complex only)

Merge the findings yourself. Resolve conflicts by re-reading the cited lines. Drop anything you could not confirm.

## 4. Answer

Read the code and its nearby tests before explaining it. Use these sections, dropping any that do not apply:

- **Overview.** What the subsystem does and why it exists, in a few sentences.
- **Key concepts.** The terms and types a reader needs.
- **How it works.** The flow in order, with `file:line` references.
- **Where things live.** The directories and files that own each concern, and where new code of each kind belongs. Cite the ownership and layering rules in `AGENTS.md`.
- **Gotchas.** Non-obvious behavior, ordering requirements, and traps.

For placement questions, answer with the owning directory, the rule that decides it, and the closest existing example.

## Review checklist

- Every claim cites a real `file:line` you read.
- Placement advice matches `AGENTS.md` and an existing example.
- Delegation followed the user's authorization, and each explored angle has evidence.
- The answer explains flow, not a line-by-line paraphrase.
