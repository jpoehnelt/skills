---
name: eng-state-machine
description: Model an entity's lifecycle (status, state, phase) as an explicit state machine with a pure decide function, one guarded write path, and events from a durable record. Use when adding or changing a status field, a transition, or a reaction to one, when several writers set the same status, or when moving ad hoc status writes onto a machine.
---

# State machines for entity lifecycles

A status column that any code path can set drifts: two writers race, a rejected move succeeds from a stale read, an event fires for a write that rolled back, and the rules end up in scattered `if` checks that nobody owns. Give each lifecycle one machine and one way to change it.

Use one when more than one code path changes the status, a move has preconditions, or other work reacts to a move. A flag with one writer and no reactions stays a boolean.

Repo facts (from AGENTS.md or CLAUDE.md): the machine helper and where machines live, the transition write helper and the transaction API, where transition history or an outbox lives, the lint or check that flags direct status writes, the error convention for rejected moves, and the test runner.

## Define the machine

- **States and moves, in one place.** List every state, every command, and each allowed `from -> to` move. Mark the initial and terminal states. Name states and commands in domain terms (`approve`, `cancelled`), not UI or storage terms.
- **Decide every (state, command) pair.** Each pair not listed as a move is either rejected or an explicit no-op. Repeating a command that already took effect (archive an archived entity) is usually a no-op so retries stay safe; anything else is a rejection. An unhandled pair is how illegal moves slip through.
- **Modes live in the status, data lives beside it.** No boolean that restates the status (`isArchived` next to `status = 'archived'`). Per-state data is a union: a `cancelled` entity carries its `reason`, an `active` one does not.
- **Derived statuses are never stored.** If a status follows from other fields (ready when every check passed, expired when `expires_at` is past), compute it on read. A stored copy is a second source of truth that drifts, and a stored "expired" needs a job that can fall behind.
- **Encode current behavior.** When moving existing writes onto a machine, allow every move the code makes today, even odd ones. Tightening a move is a product change: make it in its own commit, or mark the permissive move with a `TODO` naming the open decision.
- **Stored state names are a contract.** Renaming or removing a state needs a data migration for rows in the old state and a check of every consumer of its events.

## Decide purely

`decide(current, command)` returns the accepted transition, a no-op, or a typed rejection. It is synchronous and has no I/O: time, actor, and any data a guard needs come in as arguments.

```ts
type Decision<S> =
  | { kind: "moved"; from: S; to: S }
  | { kind: "unchanged"; state: S }
  | { kind: "rejected"; from: S; command: string; reason: string };
```

The caller turns a rejection into the owning module's error at the write site. Because guards take their data as input, the same rule runs in tests, in previews ("can I archive this?"), and in the write. Time-based moves (expiry, timeouts) are commands too: a scheduler sends them with the current time, and `decide` checks the deadline.

## Write through one path

1. Read the current state inside the transaction, with at most one row lock on the entity, or use a guarded update.
2. Run `decide`. On `unchanged`, return without writing.
3. Write the new state guarded on the decided `from` (`UPDATE ... SET status = :to WHERE id = :id AND status = :from`). Zero rows updated means a concurrent move won: retry from step 1 or return a conflict. Never write unguarded.
4. Record the transition (id, entity, from, to, actor, time) in the same transaction, as history or an outbox row.

No other code sets the status field. Add a lint or grep check that flags writes to it outside the write helper, so a new writer fails CI instead of review.

## React to transitions

- **Send events from the durable record.** An outbox drain or a log consumer publishes `<machine>.transitioned`. Sending from the writer after commit loses the event when the process dies between commit and send; sending before commit announces a move that may roll back.
- **When the store has no transaction for an outbox** (an object store, an external API), make the conditional write first, then send from a retried step with a deterministic transition id.
- **Reactions are idempotent and order-tolerant.** Delivery is at least once. Deduplicate on the transition id, accept events out of order, and reread current state instead of trusting the payload. A reaction that changes another entity goes through that entity's machine.

## Migrating ad hoc status writes

1. Inventory every writer: assignments to the field, raw SQL updates, ORM `set` calls, fixtures, and booleans that shadow the status.
2. Map each write to a command and a `from -> to` move. Record moves the code makes today even if they look wrong.
3. Add the machine and the write helper. Move writers over one at a time, each with a check that the old write is gone.
4. Add the lint check last, once no writer is left outside the helper. Prove the removal with `eng-cutover-verification`.

## Tests

- **Check the graph.** Every state is reachable from the initial state, every non-terminal state can reach a terminal one, terminal states have no outgoing moves, and every move names states that exist. Run this as one test over the machine definition.
- **Test `decide` with a table** over every (state, command) pair: each move, each no-op, and each rejection. It is pure, so the table is fast and complete.
- **Test the write helper once for concurrency:** two moves from the same `from`, one wins, one gets a conflict.
- **Reactions** get one test for a duplicate event and one for an out-of-order event.
- **For complex machines**, a property-based stateful test (for example Hypothesis `RuleBasedStateMachine` or fast-check model-based testing) runs random command sequences and checks invariants after every step.

## Review checklist

- Every state, move, and terminal state is listed in one machine, and every (state, command) pair is a move, a no-op, or a rejection.
- No boolean or stored field restates or derives the status.
- `decide` is pure; time, actor, and guard data are arguments.
- The write is guarded on `from` and records the transition in the same transaction.
- No status write exists outside the helper, and a check enforces it.
- Events come from the durable record; reactions deduplicate on the transition id and reread state.
- The graph test passes: reachable states, no dead ends, terminal states closed.
- A refactor allows every move the old code made; tightening is a separate, named decision. A renamed state ships with a data migration.
