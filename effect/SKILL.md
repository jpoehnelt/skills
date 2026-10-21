---
name: effect
description: Apply Effect v4 conventions for services, layers, tagged errors, boundary runners, resources, retries, deadlines, HTTP, and tests. Use when writing or reviewing TypeScript that imports effect, adds a service or error class, chooses where to run a program, bounds external I/O, or tests Effect code.
---

# Effect v4

Assumes Effect v4 (the `effect@4.0.x` line, including its release candidates). Effect 3 differs in names and modules (`Context.Tag`, `Effect.catchAll`, `@effect/platform`); do not mix the two. Read the installed version before using an API you have not seen in the repo, and follow the repo's AGENTS.md where it differs from this skill: a repo rule or a documented exception wins.

Repo facts (from AGENTS.md): pinned Effect version and how bumps land, import policy (deep imports, `effect/unstable/*` barrels), boundary runners and the shared `ManagedRuntime`, the house error file, Effect lint gates, test runner and helpers, check and test commands.

## Boundaries

A boundary is where a Promise or process exit is the contract: an HTTP or route handler, a framework load or action, a Durable Object method, a queue or workflow step body, an extension or CLI entrypoint. Everything else returns an Effect under its own name and composes with `yield*`.

- Run programs only at boundaries, through the repo's runner and one `ManagedRuntime` per process (`NodeRuntime.runMain` for Node entrypoints). No `Effect.runPromise`/`runSync`/`runFork` in domain code outside tests.
- No `fooEffect` twin, no Promise wrapper lifted back with `Effect.promise`, no runner's Promise re-entered as an Effect.
- Browser code may import pure modules (`Schema`, `Option`, `Data`, `Result`) but never runs a program that needs services.
- Deep imports (`import * as Effect from "effect/Effect"`) unless the repo says otherwise. Keep every package on the same exact Effect version; bump it in its own change.

## Errors

- One class per expected failure, owned by the package that raises it. `Schema.TaggedError` when the error crosses a serialization boundary (wire, RPC, journal); `Data.TaggedError` is fine in-process if the repo allows it. Type `cause` as `Schema.Defect()`.
- Class name, `_tag`, wire `code`, and `catchTag` argument are one identifier, unique across everything a consumer can see. The compiler cannot catch a duplicate tag; use the repo's check if it has one.
- Derive `message` on the class; never author it at the call site.

```ts
class OrderNotFound extends Schema.TaggedError<OrderNotFound>()("OrderNotFound", {
  id: Schema.String,
}) {
  override get message() {
    return `order ${this.id} not found`;
  }
}
const load = Effect.fn("loadOrder")(function* (id: string) {
  const row = yield* findOrder(id);
  if (!row) return yield* new OrderNotFound({ id });
  return row;
});
```

- Narrow with `Effect.catchTag`/`catchTags`, never by comparing a `code` or message string.
- Lift a Promise API with `Effect.tryPromise({ try, catch: (cause) => new SpecificError({ cause }) })`. Never a zero-arg `catch`, never one generic catch-all class. An unmapped throw stays a defect.
- Decode an error of unknown shape (RPC envelope, stored JSON, step failure) with a `Schema.Union` of the classes that operation admits, and derive the type from that schema. Never guess a class.
- The public wire shape is an explicit projection (`{ code, message }` plus any public fields). Never encode the error class itself: that emits `name`, `message`, and nested `cause`.
- Defects (bugs, missing config, broken bindings, failed setup) stay defects. Do not wrap setup or pure factories in `Effect.try`, and do not `Effect.catchDefect`/`catchCause` them into a domain error. The boundary runner reports and sanitizes them.
- Retry policy lives where the retry happens (a `while` guard naming tags); errors carry no retryable flag.

## Services and resources

- A service is a `Context.Service` class with a concrete shape (`class Db extends Context.Service<Db, DbShape>()("Db") {}`). Dependencies travel in `R` and are supplied by `Layer` at the composition root. Tags expose shapes, not fallible Effects that produce shapes.
- No `deps = liveDeps` parameter bags or module singletons. Build clients, pools, and connections in a scoped layer with `Effect.acquireRelease` so they close on shutdown and interruption.
- On serverless runtimes (Workers), request-scoped I/O never lives in a memoized layer.
- Read config with `Config` inside the layer that needs it; missing required config is a startup defect.

## Functional core

- Pure calculation (scoring, state transitions, diffing, decoding) stays synchronous and outside `Effect.gen`. Do not wrap a pure decision in an Effect.
- Inside programs read time and randomness through `Clock` and `Random`, never `Date.now()`, `new Date()`, `Math.random()`, or ambient `crypto.randomUUID()`. In durable workflows, read time through the workflow's journaled step before branching.
- Brand entity IDs at ingress with `Schema.brand` (or `Brand.nominal` outside schemas). Use `Data.Class` for in-memory equality; keep wire and journal values plain JSON.

## State machines

Effect v4 has no state-machine module. Follow `eng-state-machine` for the design; this is how its parts map to Effect.

- `decide` is plain TypeScript with no `Effect`, `Clock`, or service. If the repo provides a machine kernel (see its repo facts), use that kernel's `decide`. Otherwise match on both dimensions so a missing (state, command) pair is a type error: an outer `Match.exhaustive` over the state union with an inner one over the `Schema.TaggedUnion` of commands, or one match over a union of pairs. Matching commands alone only proves every command has a handler.
- Decode the stored status at the boundary with `Schema.Literals([...states])`, so an unknown value never reaches `decide`, unless the kernel's `decide` already rejects unknown states as data.
- `decide` returns a rejection as data. The write turns it into the owning package's tagged error; do not make `decide` fail in the error channel.
- The write is one `Effect.fn` inside the repo's transaction: lock or read, `decide`, guarded update, outbox row. Read time and ids from `Clock` and the id service and pass them to `decide`. A guarded update that misses fails with a conflict tag the caller retries (`Effect.retry({ while: (e) => e._tag === "...Conflict", times })`); a miss under a row lock is a defect.
- An in-memory machine (session, connection, worker) serializes moves with `SynchronizedRef.modifyEffect` and publishes states with `SubscriptionRef.changes`. Multi-step processes that wait on time or events belong in the repo's workflow engine, not in an entity machine.

## IO

- Trace service boundaries with `Effect.fn("operationName")(function* () {...})`; add dynamic attributes with `Effect.annotateCurrentSpan`. Private helpers stay untraced.
- Outbound HTTP uses `HttpClient` with `FetchHttpClient.layer` (the module path depends on the installed v4 build: `effect/http` or `effect/unstable/http/*`; follow existing imports). Scope the response. No raw `fetch` with `AbortSignal.timeout`, `Promise.race` timers, or hand-rolled in-flight promise sets.
- Give external I/O one total deadline covering setup, retries, retry delays, and body consumption: `Effect.timeout` around the whole retried operation, and `Effect.retry({ while: isTransient, times, schedule: Schedule.exponential(...).pipe(Schedule.jittered) })` inside it.
- Concurrency is `Effect.all`/`Effect.forEach` with explicit `{ concurrency }`, never `Promise.all` inside `Effect.gen`. Long-lived consumers use `Stream`, `Queue`, and `Fiber`/`FiberSet`, not ad hoc timers.
- Scope child work to its request, document, or connection. Interruption must join bounded cleanup before release; lift fallible finalizers with `Effect.tryPromise` and `Effect.orDie` an unrecoverable release failure.

## Testing

- Provide test layers (`Effect.provide(TestLayer)`, `Effect.provideService`) instead of stubbing globals or `vi.mock()`. Pure core functions get plain synchronous tests.
- Time: `TestClock` from `effect/testing`; fork the program, then `TestClock.adjust`.
- Assert the failure `_tag` or code and the resulting state, not merely that something failed.
- For boundary or resource-lifetime changes, add one test proving cancellation or cleanup (release order, stalled cleanup, no late writes), not just the success path. Signal readiness from the operation under test, not a sleep.
- Durable step ids and their journal shapes are a persisted contract: a rename or changed result shape under the same id breaks in-flight runs and replay. Give a changed step a new id.

## Review checklist

- `rg -n 'Effect\.(runPromise|runSync|runFork)' --glob '!**/*.test.ts' <paths>` finds only boundary runners.
- `rg -n 'catchDefect|Date\.now\(\)|Math\.random\(\)' <changed paths>` finds nothing inside Effect programs.
- Each function returns its own Effect with the narrow union of tagged errors it can raise.
- A state real data can reach stays modeled: a nullable column decodes with `Schema.NullOr`, a count over a cap is a tagged failure. Not `orDie`, not an invented `?? 0` default. An aggregate over zero rows returning its defined empty value is fine.
- The repo's Effect gate, type check, and focused tests pass (commands in AGENTS.md).
