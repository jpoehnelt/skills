---
name: agents-correct
description: Find the mistakes agents keep repeating in a repo and make each one impossible, trying architecture first, then types, lint, tests, and docs last. Use when the operator keeps correcting the same mistake, or for /agents-correct.
---

# Correct

The operator keeps correcting agents for the same mistakes. Change the repo so the next agent cannot make them.

Assume every contributor is an agent that sees only the files it opened, copies the nearest example, and takes the shortest path that compiles. Design the repo so a change that looks right from one file is right for the whole repo.

Repo facts (from AGENTS.md or CLAUDE.md): the lint and check systems and where their rules and rule tests live, the suppression syntax, the test policy, and where invariants versus skill checklists belong.

## Find the mistake classes

Read recent commits, reverts, review comments, agent instruction files, and comments that explain workarounds. Group the mistakes into classes. A class counts once it has happened twice.

## Fix each class at the highest level that works

The ladder, in order: architecture, types, lint, tests, docs.

1. **Eliminate it with architecture.** Give each piece of state one owner and each task one supported way. Hide internals so the wrong import fails. Replace hand-synced lists with one source of truth. Delete old ways and dead code an agent would copy.
2. **Enforce it with types** (schemas, branded IDs, tagged unions) so the bad state cannot be written. If bad code still compiles, add a rule to the repo's existing lint or CI check system, with a test case if that system has rule tests, whose error names the file, type, or function to use instead. If the pattern is already common, fail only when a change adds more.
3. **Test the behavior**, following the repo's test policy. Where it prefers fewer tests, decompose uncertain code or flag it for review instead. Fix or delete any test that still passes when the behavior it checks breaks, or that fails when only internals change.
4. **Write docs or agent rules last**, and only for judgment calls. Nothing fails when an agent skips them.

## Fix and prove

Fix the existing occurrences of the most frequent classes now, one commit each when the user has asked for commits. Prove each new check fails on a real past mistake and accepts valid use. Run the same command locally and in CI. Exceptions go on the offending line using the check's suppression syntax, with a reason and a human approval; never add a permanent blanket exception for existing violations.

## Place the rule

Each rule lives in exactly one place: a durable invariant in `AGENTS.md`, a syntactic check in the lint system, and a design or context check in the owning skill's review checklist. When a check enforces an `AGENTS.md` rule, name the check on that line instead of adding prose. When the operator corrects you, fix the mistake and place the rule. If the rule already existed and nothing enforced it, that is a repeat, so fix it at the highest level in the same change. Drop a rule once its mistake cannot happen.

## Review checklist

- Each class has evidence: at least two past occurrences.
- Each fix sits at the highest level that works, with a stated reason why a higher level did not.
- Each new check failed on a real past mistake before it was accepted.
- Each rule sits in one place, and each enforced AGENTS.md rule names its enforcer.
- Reply lists each class, its evidence, the level chosen, and why.
