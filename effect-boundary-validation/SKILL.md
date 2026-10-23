---
name: effect-boundary-validation
description: Decode untrusted data once at ingress with Effect Schema (v4) and pass typed values downstream. Use for HTTP bodies, params and query strings, webhooks, RPC and message payloads, MCP tool arguments, env and config, JSON.parse, stored JSON or rows, third-party API responses, unsafe casts, or porting Zod/Valibot schemas.
---

# Boundary validation

Decode untrusted data once, at the ingress, then pass the decoded type downstream. TypeScript types, `satisfies`, and `as` casts are not runtime validation. Assumes Effect v4 `Schema`, imported the way the repo's import policy says (the `effect` root or `effect/Schema`); see `effect` for errors and runners.

Repo facts (from AGENTS.md): where shared wire schemas live, retired schema libraries, safe-decode helpers, ast-grep boundary rules, the public error shape, and check and test commands.

## Inventory the boundary

Run `scripts/boundary-audit.sh [--ban MODULE]... [--rule RULE_ID]... [paths]` on the changed paths. It lists parse and cast sites, signature checks, and decode sites, fails on imports of any `--ban` module (for example `--ban zod --ban valibot`; a text search, so enforce a ban structurally with an ast-grep rule), and runs the named ast-grep rules when the repo has `sgconfig.yml`. For each change, name:

1. The ingress point (route, webhook, message or topic handler, RPC method, upstream response, env read, stored row).
2. The owning schema: shared wire schemas live in the contract package when several packages consume them; local-only shapes stay beside their consumer.
3. Checks that run before decoding: signature or MAC, bearer token or session, origin.
4. The decoded internal type.
5. What the caller sees on failure and what is logged.

## Policy: requests strict, responses tolerant

- Request decoders reject excess fields: `Schema.decodeUnknownEffect(schema, { onExcessProperty: "error" })` where the contract is strict.
- Response decoders use the default mode, which ignores added fields, so a newer server never breaks an older client. Keep error `code` unions open to future codes.
- Persistence compatibility (old stored shapes) is decoded locally, for example with `decodeUnknownOption`; it never widens the shared contract.
- Change a shared schema first, then producers and consumers together, with a test pinning both policies.

## Signed and raw input

- Bound every body or frame with a byte budget before buffering or decoding. Reject oversized input with a typed error; never truncate silently.
- Read the exact bytes, verify the signature or MAC on those bytes, and only then parse. Never verify a decoded and re-serialized value.
- Compare MACs and tokens in constant time.
- Keep gates distinct: signature-gated routes, intentionally public routes, and session-authenticated routes. An origin check is not authentication.
- Binary frames go through the protocol codec first; then validate the decoded struct before persistence. Never trust lengths or field ranges from the wire.
- Privileged state (billing, roles) comes from verified events and stored rows, never from client-supplied claims.

## Implement

- Treat input as `unknown`. Decode with `Schema.decodeUnknownEffect` inside Effect, or `decodeUnknownExit`/`decodeUnknownResult`/`decodeUnknownOption` when a value is easier to branch on. Build decoders once at module scope, not per call, and do not validate a boundary with `Schema.is`.
- Porting from Zod: `.strict()` is `{ onExcessProperty: "error" }`; `.passthrough()`/`.loose()` is `Schema.StructWithRest(struct, [Schema.Record(Schema.String, Schema.Unknown)])` (v4 strips unknown keys by default and has no preserve mode); `z.coerce.number()` is `Schema.NumberFromString` or `FiniteFromString`; JSON in a string is `Schema.fromJsonString`; `instanceof ZodError` is `Schema.isSchemaError`.
- Apply `Schema.Trim` before length or format checks on user text. Brand IDs at ingress with `Schema.brand`.
- LLM structured output: pass the Effect Schema to the provider so it derives JSON Schema; prefer `Schema.Finite` over `Schema.Number`, which admits `"Infinity"`/`"NaN"` strings.
- Database driver generics (`run<T>`, `query<T>`) are casts. Decode projection rows that are JSON or loosely typed.
- Narrowing a persisted literal union makes old rows undecodable. Never decode stored rows against a narrowed schema under `orDie` (or any defect conversion) unless the query filters to the same set; one leftover row otherwise kills the whole read.
- Error envelopes (RPC failures, stored errors) decode with an explicit envelope schema, never by matching message text.
- Return a generic public error; never echo raw input, tokens, secrets, or internal causes into responses or logs.
- Do not re-validate downstream; transform the decoded value explicitly.

## Verify

- `boundary-audit.sh` shows no banned imports, and every parse or cast site feeds a decode or reads trusted local data.
- Tests cover valid input, malformed JSON or bytes, missing and wrong-typed fields, the excess-field policy, oversized payloads, and bad signatures or auth, where branch behavior is uncertain.
- The repo's lint, ast-grep rules, type check, and focused tests pass.
