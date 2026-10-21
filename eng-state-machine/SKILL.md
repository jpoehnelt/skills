---
name: eng-state-machine
description: Model an entity's lifecycle (status, state, phase) as an explicit state machine with a pure decide function, one guarded write path, and events from a durable record. Use when adding or changing a status field, a transition, or a reaction to one, when several writers set the same status, or when moving ad hoc status writes onto a machine.
---

# State machines for entity lifecycles

A status column that any code path can set drifts: two writers race, a rejected move succeeds from a stale read, an event fires for a write that rolled back. Give each lifecycle one machine and one way to change it.

Repo facts (from AGENTS.md or CLAUDE.md): the machine helper and where machines live, the transition write helper and the transaction API, where transition history or an outbox lives, the lint or check that flags direct status writes, the error convention for rejected moves, and the test runner.

## Define the machine

- **States and moves, in one place.** List every state, every command or event, and each allowed `from -> to` move. Mark terminal states. Anything not listed is rejected.
- **Per-state data is a union.** Make illegal states unrepresentable: a `cancelled` entity carries its `reason`, an `active` one does not. Handle every variant exhaustively.
- **Derived statuses are never stored.** If a status follows from other fields (ready when every check passed), compute it on read. Storing it creates a second source of truth that drifts.
- **Encode current behavior.** When moving existing writes onto a machine, allow every move the code makes today, even odd ones. Tightening a move is a product change: make it in its own commit, or mark the permissive move with a `TODO` naming the open decision.

## Decide purely

`decide(current, command)` returns the accepted transition or a typed rejection. It is synchronous and has no I/O: time, actor, and anything else it needs come in as arguments.

```ts
type Decision<S> =
  | { ok: true; from: S; to: S }
  | { ok: false; from: S; command: string; reason: string };
```

The caller turns a rejection into the owning module's error at the write site. Guards that need data (an approval count, a role) take it as input, so the same rule runs in tests, previews ("can I archive this?"), and writes.

## Write through one path

1. Read the current state inside the transaction, with at most one row lock on the entity, or use a guarded update.
2. Run `decide`.
3. Write the new state guarded on the decided `from` (`UPDATE ... SET status = :to WHERE id = :id AND status = :from`). Zero rows updated means a concurrent move won. Retry from step 1 or return a conflict; never write unguarded.
4. Record the transition (id, entity, from, to, actor, time) in the same transaction, as history or an outbox row.

No other code sets the status field. Add a lint or grep check that flags writes to it outside the write helper, so a new writer fails CI instead of review.

## React to transitions

- **Send events from the durable record.** An outbox drain or a log consumer publishes `<machine>.transitioned`. Sending from the writer after commit loses the event when the process dies between commit and send; sending before commit announces a move that may roll back.
- **When the store has no transaction for an outbox** (an object store, an external API), make the conditional write first, then send from a retried step with a deterministic transition id.
- **Reactions are idempotent and order-tolerant.** Deduplicate on the transition id, accept events out of order, and reread current state instead of trusting the event payload. A reaction that changes another entity goes through that entity's machine.

## Migrating ad hoc status writes

1. Inventory every writer: search for assignments to the field, raw SQL updates, ORM `set` calls, and fixtures.
2. Map each write to a command and a `from -> to` move. Record moves the code makes today even if they look wrong.
3. Add the machine and the write helper. Move writers over one at a time, each with a check that the old write is gone.
4. Add the lint check last, once no writer is left outside the helper. Prove the removal with `eng-cutover-verification`.

## Tests

Test `decide` with a table over every (state, command) pair: each accepted move and each rejection. It is pure, so this is fast and complete. Test the write helper once for the concurrent case: two moves from the same `from`, one wins, one gets a conflict. Reactions get one test for a duplicate event and one for an out-of-order event.

## Review checklist

- Every state, move, and terminal state is listed in one machine.
- `decide` is pure; time and actor are arguments.
- The write is guarded on `from` and records the transition in the same transaction.
- No status write exists outside the helper, and a check enforces it.
- Events come from the durable record, never straight from the writer.
- Reactions deduplicate on the transition id and reread state.
- No derived status is stored.
- A refactor allows every move the old code made; tightening is a separate, named decision.
