---
name: cloudflare-edge-hardening
description: Harden Cloudflare Workers, SvelteKit edge routes, WAF and Browser Integrity Check rules, security headers, CSP, CSRF exemptions, SSRF guards, and telemetry scrubbing. Use when adding or modifying public routes, static assets, webhooks, outbound fetches, auth callbacks, or Cloudflare WAF and header config.
---

# Cloudflare edge hardening

Every public route sits behind four layers: zone WAF and Browser Integrity Check (BIC), static asset `_headers`, Worker or framework middleware, and outbound or telemetry boundaries. Changing one layer without the others causes 1010 agent outages, missing headers on Worker responses, or silent security regressions.

Repo facts (from AGENTS.md): the route manifest or router entrypoint, WAF and BIC config, static `_headers` and server hook paths, the repo's shared edge security helpers (capped body reader, SSRF fetch, security-header hook, telemetry scrubber, analytics wrapper), `sgpack` security rules, and the security lint and edge-router test commands.

## Classify every route once

Before adding a route, static machine file (`/llms.txt`, `/robots.txt`, `/schemas/*`), or content-negotiated endpoint, declare five properties in the repo's single route table (or verify all surfaces in one change):

1. **Audience:** browser page, non-browser API or AI agent, webhook receiver, or OAuth callback.
2. **WAF and BIC:** non-browser clients fail Cloudflare BIC (error 1010) unless exempted. Match exact path prefixes and parse `Accept` media-type quality values strictly so `text/markdown;q=0` never bypasses browser rules.
3. **Methods and 405:** list allowed HTTP methods explicitly and return JSON 405 with an `Allow` header for unsupported methods rather than falling through to an HTML 404.
4. **Headers on every response path:** static `_headers` does not cover Worker-generated JSON, auth redirects, or framework 404 or 500 responses. Emit HSTS, CSP, `X-Content-Type-Options`, and `Referrer-Policy` in server hooks too. Check that `Referrer-Policy` preserves `Origin` on same-origin POSTs so CSRF checks do not see `Origin: null`.
5. **Auth and CSRF:** authenticate before reading bodies on protected routes (`effect-boundary-validation`); add explicit narrow exemptions for external OAuth callbacks and signed webhooks.

## Harden ingress, egress, and telemetry

- **Capped ingress:** use the repo's shared streaming byte-capped body helper on every POST, PUT, and PATCH, including routes with trailing slashes or missing `Content-Length`. Never buffer unbounded bodies in Workers or Durable Objects.
- **SSRF-safe egress:** use the repo's shared SSRF fetch helper (`redirect: "manual"`, per-hop DNS and CIDR re-validation, trailing-dot normalization, outer timeout) rather than raw `fetch` or hand-rolled IP bitmasks. Keep registration-time and delivery-time URL checks identical.
- **Privacy scrubbing:** never log raw parse errors, request URLs with query strings, or auth headers to error trackers. Pin a regression test asserting sensitive fields are scrubbed so later SDK refactors cannot silently drop the scrubber.
- **Third-party analytics:** strip private route paths and referrers before sending events, and suspend tracking on excluded or authenticated admin routes.
- **Strict CSP:** avoid `unsafe-inline` and inline `style=` attributes in app shells; verify built pages and 404 pages against the live CSP header. Follow `alchemy-infra` for zone and Worker bindings.

## Verify

- Run `sgpack` security rules, the repo's security lint pack, and edge-router tests covering the full Worker entrypoint, not an isolated handler.
- Probe a wrong HTTP method (expect 405 with `Allow`), an oversized body without `Content-Length` (expect 413), a non-browser `User-Agent` on agent routes, and a Worker 404 or redirect for required security headers.
- Confirm telemetry scrubber and analytics exclusion tests assert on actual emitted payloads.
