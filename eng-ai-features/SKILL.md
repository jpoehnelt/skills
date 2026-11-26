---
name: eng-ai-features
description: Ship user-facing AI features with grounding, explicit consent, deterministic fallbacks, kill switches, cost estimates, and admin-only model controls. Use when adding or changing product AI features, prompts, embeddings, or admin MCP surfaces.
---

# AI features

Ship user-facing AI features under grounding, consent, fallback, and cost guardrails. Keep model controls, prompts, tooling details, internal MCP discovery, and unreleased experiments restricted to platform admins.

Repo facts (from AGENTS.md): runtime feature-flag or off-switch mechanism, user data export and account-deletion fixtures, admin role and auth or MCP paths, PR cost-reporting rules, and product copy guidelines.

## User-facing features

- **Grounded.** Base statements about stored records on stored facts and link their source and checked date. Never let a model assert a policy or record fact the store lacks. Quote stored text rather than paraphrasing it.
- **Consent and ownership.** Send user content to a model only after an explicit user action, and state what is sent. Keep model output owner-scoped. Any persisted output is an owned record included in data export and account deletion. Never share user content across accounts or use it for training.
- **Deterministic fallback.** Give every feature a deterministic non-AI path. A missing binding, timeout, or classified provider failure falls back to it under a total deadline, and the page still works.
- **Off switch and cost.** Guard every feature with a setting that disables it at runtime. State the cost driver, the monthly cost per account at target scale, and that setting name in the PR description.
- **Honest copy.** Describe what the feature does in product vocabulary (`comms-unslop`). Label generated text as generated. Avoid chat personas, hype, and model or vendor names.

## Admin-only surfaces

- Ordinary organization, team, editor, or publisher roles grant no platform-admin access.
- Authorize the current session and role on the server before reading inputs or acquiring storage. Return a generic 404 to non-admins without protocol or authentication details.
- Where a standard MCP client requires OAuth discovery, answer 401 with a discovery challenge and serve `/.well-known` metadata that names only the authorization server and scope, with no tool, role-holder, or account names. Show signed-in non-admins a plain denial on the consent page.
- Issue admin tokens only from an admin's consent, and reread the account's role and ban status on every request so revocation and role removal take effect immediately.
- Keep admin controls, prompt details, and tooling strings out of user screens, metadata, client bundles, and navigation.

## Verify

- User features: test the AI path, the deterministic fallback path, the off switch, and owner scoping. When output is persisted, extend the export and deletion round-trip test.
- Admin surfaces: test the admin path plus anonymous, expired, revoked, banned, and signed-in non-admin requests.
- Confirm copy rules preserve user-authored content and factual source text that mention AI.
