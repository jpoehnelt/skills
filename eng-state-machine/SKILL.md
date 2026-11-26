---
name: eng-state-machine
description: Model an entity's lifecycle (status, state, phase) as an explicit state machine with a pure decide function, one guarded write path, and events from a durable record. Use when adding or changing a status field, a transition, or a reaction to one, when several writers set the same status, or when moving ad hoc status writes onto a machine.
---

# State machines for entity lifecycles

A status column that any code path can set drifts: two writers race, a rejected move succeeds from a stale read, an event fires for a write that rolled back, and rules scatter into ad hoc `if` checks. Give each lifecycle one machine and one way to change it.

Use one when more than one code path changes the status, a move has preconditions, or other work reacts to a move. A flag with one writer and no reactions stays a boolean.

Repo facts (from AGENTS.md or CLAUDE.md): the machine helper and where machines live, the transition write helper and transaction API, where transition history or an outbox lives, the lint or check that flags direct status writes, the error convention for rejected moves, and the test runner.

## Define the machine

- **States and moves, in one place.** List every state, every command, and each allowed `from -> to` move. Mark starting states and any terminal states. A lifecycle that cycles (open, closed, open again) has no terminal state, and that is valid. Name states and commands in domain terms (`approve`, `cancelled`), not UI or storage terms.
- **Decide every (state, command) pair.** Each pair not listed as a move is either rejected or an explicit no-op. Repeating a command that already took effect is usually a no-op so retries stay safe; anything else is a rejection.
- **Modes live in the status, data lives beside it.** No boolean that restates the status (`isArchived` next to `status = 'archived'`). Per-state data is a union: a `cancelled` entity carries its `reason`, an `active` one does not.
- **Derived statuses are never stored.** Compute statuses that follow from other fields (ready, expired) on read.
- **Tri-state outcomes.** Projections, conflict checks, and paginated evaluations return an explicit tri-state outcome (`complete | truncated | failed`), never a bare boolean or zero count. An incomplete or truncated evaluation must never render as clean or passing.
- **Encode current behavior.** When moving existing writes onto a machine, allow every move the code makes today. Tightening a move is a product change; land it separately or mark it with a `TODO`.
- **Stored state names are a contract.** Renaming or removing a state needs a data migration (`eng-data-backward-compat`) and a check of every consumer.

## Decide purely

`decide(current, command)` returns the accepted transition, a no-op, or a typed rejection. It is synchronous and does no I/O. Time, actor, and guard data come in as arguments.

```ts
type Decision<S> =
  | { kind: "moved"; from: S; to: S }
  | { kind: "unchanged"; state: S }
  | { kind: "rejected"; from: S; command: string; reason: string };
```

Turn a rejection into the owning module's error at the write site. Time-based moves (expiry, timeouts) are commands sent with the current time. In an Effect repo, `effect` shows how these parts map onto Effect.

## Write through one path

1. Read the current state inside the transaction, with at most one row lock on the entity, or use a guarded update. When a transition locks multiple rows or tables (`FOR UPDATE` or `FOR SHARE`), acquire locks in one deterministic canonical order (table hierarchy, then sorted primary key) so concurrent transitions cannot deadlock.
2. Run `decide`. On `unchanged`, return without writing.
3. Write the new state guarded on `from` (`UPDATE ... SET status = :to WHERE id = :id AND status = :from`). Zero rows updated means a concurrent move won; retry from step 1 or return a conflict. Never write unguarded.
4. **Fence async writes and break ties with monotonic `seq`.** Background work (LLM judges, webhook mirrors, async fingerprints) carries a monotonic fencing token (`version`, `seq`, or `commit_sha`) and re-checks persisted lifecycle state inside the write guard. Discard stale results when the entity reopened, closed, was superseded, or its source artifact was deleted. Never break ties with unix-second wall clocks; use monotonic sequence numbers.
5. Record the transition (id, entity, from, to, actor, time) in the same transaction, as history or an outbox row.

No other code sets the status field. Add a lint or grep check flagging writes outside the write helper so new writers fail CI instead of review.

## React to transitions

- **Send events from the durable record.** An outbox drain or log consumer publishes `<machine>.transitioned`. When the store has no transaction for an outbox, make the conditional write first, then send from a retried step with a deterministic transition id.
- **Reactions are idempotent and order-tolerant.** Delivery is at least once. Deduplicate on the transition id, accept out-of-order events, and reread current state instead of trusting the payload. A reaction that changes another entity goes through that entity's machine.

## Migrating ad hoc status writes

1. Inventory every writer: assignments, raw SQL updates, ORM `set` calls, fixtures, and shadowing booleans.
2. Map each write to a command and a `from -> to` move, preserving existing moves first.
3. Add the machine and write helper, move writers over one at a time, then add the lint check last and prove removal with `eng-cutover-verification`.

## Tests

- **Graph test:** verify every state is reachable from a starting state, and when terminal states are declared, every other state can reach one and no terminal state has an outgoing move.
- **Table test `decide`** over every (state, command) pair: each move, no-op, and rejection.
- **Concurrency test:** run two moves from the same `from` and assert exactly one applies.
- **Reactions:** test a duplicate event and an out-of-order event.
- **Snapshot vs live-stream projection parity:** when both a snapshot query and an incremental event stream (SSE or WebSocket) project state, drive both through one pure reducer ordered by monotonic `seq` and add a differential property test (`project(snapshot) === project(applyEvents(init, log))`) including reconnect and cursor-reset faults.
- **Complex machines:** run random command sequences with a stateful property test (such as `fast-check` model-based testing) and assert invariants after every step.

## Review checklist

- Every state, move, and terminal state lives in one machine; every (state, command) pair is handled.
- No boolean or stored field restates or derives status; evaluations return tri-state `complete | truncated | failed`.
- `decide` is pure; writes are guarded on `from`, fenced with monotonic `seq`, lock multiple rows in canonical order, and record transitions in one transaction.
- No status write exists outside the helper, enforced by CI; events come from the durable record.
- Graph, concurrency, reaction, and snapshot-vs-stream differential parity tests pass.
