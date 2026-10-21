---
name: comms-why
description: Explain why code is shaped the way it is, using git history, PRs, and connected MCP evidence, with citations and honest confidence. Use for "why does X work this way", "why did we pick Y", design rationale, regressions, and postmortems. Use comms-how for runtime behavior.
---

# Why

Investigate the motivation behind code. `comms-how` explains what code does. This skill explains what forces led to its shape. Be careful and precise. Separate what you know from what you infer.

Repo facts: where the repo keeps design records, ADRs, or plans, if anywhere (`AGENTS.md` or `CLAUDE.md`).

## 1. Pin the target and question

The target is a chunk of code, a pattern, or a named decision. If it is vague, pick the best interpretation from context, state it, and proceed.

## 2. Build the code anchor

Gather evidence with these commands. Capture long outputs in scratch files, then read bounded excerpts:

- `git blame -L <start>,<end> <file>` for the last-touch commits.
- `git log --follow --oneline -20 -- <file>` for recent history.
- `git log --follow -p -5 -- <file> > <history-file>` when patches matter. Read targeted excerpts from the saved file.
- `git log -1 --format=%B <sha>` for the full message. Look for PR numbers like `(#1234)` and issue IDs.
- PR bodies, reviews, and comments through the GitHub MCP tools (`pull_request_read`, `issue_read`, `search_pull_requests`). As an alternative when `gh` is available, save `gh pr view <number> --json title,body,comments,reviews > <pr-file>` and display a bounded selection:

```sh
jq '{title, body: .body[:4000], comments: [.comments[-10:][] | {url, body: .body[:1500]}], reviews: [.reviews[-5:][] | {state, body: .body[:1500]}]}' <pr-file>
```

Bound entry counts and text length before printing. Keep raw responses for targeted follow-up reads. Excerpts are not exhaustive; read older entries when the question needs them. Read the code, its comments, and nearby tests too.

When the target spans several packages, services, or data paths (for example generation, persistence, API responses, and display), trace only the parts the question touches, and tie each claimed change to evidence for that part.

## 3. Select relevant evidence sources

Check the repo's design records first if `AGENTS.md` names a place for them. Then pick the sources likely to hold evidence about this decision: issue tracker, long-form documents, team chat, observability, error tracking, product analytics. Before searching or delegating, verify the intended workspace and that the tools are callable. A connector listing alone does not establish access. Do not broaden access only to inventory integrations.

When delegation is authorized, give each read-only subagent one bounded question and one accessible source, and ask for dated, linked evidence, including explicit null results. Otherwise, investigate yourself. Record material access gaps as limits on the explanation.

For defensive code (null checks, retries, timeouts, rate limits, flags), also search incidents and errors that would have motivated it.

## 4. Synthesize

Weigh the evidence yourself. When delegation is authorized and the evidence is large, you may hand it to one synthesis subagent using the strongest available model. Verify cited sources before relying on them. Do not assume the latest commit is authoritative. The current shape is often many decisions stacked, so trace back.

## 5. Present

- **The question** and **the code in question**, with `file:line`.
- **What we found.** Facts with citations: commit SHA, PR link, ticket, doc, or message.
- **What we can reasonably infer.** Labeled as inference, with the reasoning.
- **Competing hypotheses.** What would separate them.
- **What we do not know.** Gaps and unsearched sources.
- **Sources consulted.** One line per source, including empty and skipped ones, with the reason.
- **Confidence.** High, medium, or low per conclusion.

If the user is about to change the code, end with Preserve, Change, Avoid, and Risk constraints.

## Review checklist

- Every finding cites a commit, PR, or document that exists.
- Inference is labeled and kept apart from fact.
- Empty and skipped sources are listed with reasons.
- Confidence language was not inflated.
