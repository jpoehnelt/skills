---
name: comms-impact
description: State what a change means for users and the business in plain words, as "When <who> does <what>, <now>. Before, <then>." Use when writing the impact part of a PR description, change note, changeset, release note, incident summary, or status update, or when someone asks what a change does for users.
---

# Impact statements

An impact statement tells a reader who never sees the code what changes for whom. It names a person, an action, the new result, and the old result. Work from the observed behavior, since commit messages and file names describe how the author worked.

Repo facts (from AGENTS.md): where impact statements go (PR template section, change notes, changesets, release notes), the product's names for its users and screens, who reads each surface (customers, operators, support, developers), and where usage or support numbers come from, if anywhere.

## Find the behavior

1. List the behavior the change touches from the diff, its tests, and stories: routes, screens, API responses, emails, jobs, limits, error messages. Ignore refactors that change no output.
2. For each behavior, name four things:
   - **Who**: the role in the product's words (signed-in member, workspace admin, API client, on-call operator), not "the user" when a role exists.
   - **Does what**: the action or condition that triggers it, specific enough to reproduce.
   - **Now**: what they see or get after the change.
   - **Before**: what they saw or got on the base branch. Check it there by running it, reading the old code path, or reading the test the change edits. Do not infer it from the PR title.
3. If you cannot establish the old result, write "Before: not verified".

## Write it

Use one statement per behavior:

> When a workspace admin removes a member who owns open reviews, the reviews move to the admin and the member sees an "access removed" email. Before, the reviews stayed assigned to the removed member and no one could close them.

- Lead with the person and the action. Put the condition in the same sentence.
- Name the visible result: the screen, button label, error text, field, status code, number, or delay. "Faster" becomes "loads in about 1 s instead of 4 s".
- Keep code out of the user sentence: no function names, flags, tables, or file paths. A developer-facing API statement may name the endpoint and field, since that is what its reader sees.
- Drop empty verbs: "improved", "enhanced", "better", "fixed an issue with". Say what is different.
- Use the past tense for before and the present for now.
- Put several statements in a table:

| Who | Does | Now | Before |
| --- | --- | --- | --- |
| Workspace admin | Removes a member with open reviews | Reviews move to the admin | Reviews stuck on the removed member |

## Business impact

Add one line on why it matters only when you can support it: who and how many it reaches, support load, revenue, risk, or a commitment it meets. Cite the source (a dashboard, a ticket count, an incident, the request that asked for it). With no source, name the affected group and stop. Never invent a number or a percentage.

## Special cases

- **Required action.** If the reader must do something (re-authenticate, migrate a setting, update a client), put a "What you need to do" line first, with the exact step.
- **Nothing visible changes.** Say "No user-visible change", then one clause on what it enables or prevents ("so the next release can add exports"). Do not describe internal work as a feature.
- **Prevented failures.** For a fix to a failure no one has hit yet, state the failure it prevents: "When two admins approve the same request at once, only one approval is recorded. Before, both were recorded and the request was charged twice."
- **Several audiences.** Write one statement per audience. Customers get the screen-level effect, operators get the alert or runbook effect, API clients get the field-level effect.
- **Order.** Required actions first, then by how many people a change reaches.

## Review checklist

- Every statement names who, the action, now, and before, or says before was not verified.
- A reader outside the team could reproduce the "when" part.
- No code names in user-facing sentences; no empty verbs; numbers have units.
- Each business-impact claim cites a source or is cut.
- Internal-only changes say so instead of claiming a benefit.
- Prose follows `comms-technical-writing` and passes `comms-unslop`.
