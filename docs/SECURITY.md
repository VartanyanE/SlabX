# Security Plan

## Objectives and threat model

Protect accounts, collectible ownership, personal data, money, and marketplace integrity. The browser is never trusted to determine ownership, price, fees, or state transitions.

| Asset | Principal threats | Primary controls |
|---|---|---|
| Accounts/sessions | Credential stuffing, fixation, takeover | Argon2id, throttling, secure rotation/revocation |
| Listings/inventory | IDOR, double sale, price tampering | Object authorization, transactions, row locks |
| Orders/money | Duplicate charge, forged webhook, replay | Idempotency, signatures, ledger, unique provider IDs |
| Personal data | Disclosure and over-retention | Least privilege, minimization, encryption, redaction |
| Uploads | Malware, polyglots, abusive content | Signed restricted upload, validation, moderation |
| Administration | Privilege escalation, hidden changes | RBAC, re-authentication, immutable audit log |

Trust boundaries exist at browser/API, API/database, API/provider, provider/webhook receiver, worker/queue, and administrator/operations interfaces.

## Identity and sessions

- Hash passwords with Argon2id using production-benchmarked parameters. Keep an optional pepper in a separate secret store.
- Require verified email before selling, offering, or purchasing. Verification and reset tokens are single-use, hashed, and short-lived.
- Google login uses OIDC. Validate issuer, audience, signature, nonce, state, redirect URI, and verified-email status. Link identities only after proving control of both accounts.
- Put only an opaque session ID in a `Secure`, `HttpOnly`, `SameSite=Lax` cookie. Rotate after login, privilege changes, password resets, and sensitive account changes.
- Store sessions server-side with idle and absolute expiry, revocation, and “sign out everywhere.” Do not store authorization claims in browser-managed storage.
- Throttle login, reset, verification, offer, checkout, review, report, and search by account and privacy-preserving network key.

## Authorization

- Deny by default. Every protected operation checks role and resource ownership in the service layer.
- Never accept seller, buyer, fee, total, status, or ownership fields when the server can derive them.
- Separate customer, moderator, support, and administrator permissions. High-impact actions require recent re-authentication and a reason.
- Scope database lookups by the authorized actor to prevent IDOR. Test every state transition for actor, prior state, and invariants.

## Browser and API controls

- Enforce TLS and HSTS. Use a narrow CORS origin allowlist; never combine wildcard origins with credentials.
- Require CSRF tokens for state-changing cookie-authenticated requests and verify origin as defense in depth.
- Set a nonce-based CSP, `frame-ancestors 'none'`, `object-src 'none'`, `X-Content-Type-Options`, a strict referrer policy, and a minimal permissions policy.
- Encode output by context; avoid raw HTML. Validate body, path, query, and provider payloads with Zod, rejecting unknown fields for sensitive endpoints.
- Use parameterized Prisma queries and review raw SQL. Bound pagination, strings, arrays, and nested payload depth.
- Return generic errors with a request ID. Keep sensitive diagnostics only in restricted telemetry.

## Financial and marketplace integrity

- Use integer minor units and an append-only double-entry ledger. Reconcile ledger, Stripe balances, transfers, refunds, and payouts daily.
- Require `Idempotency-Key` for checkout and retry-prone money mutations. Bind its saved response to actor, route, and request hash.
- Lock inventory in a database transaction before creating an order. A unique active-order constraint prevents double sale.
- Calculate price, fee, tax, shipping, and payout server-side; freeze commercial and address snapshots on the order.
- Never store card data. Stripe-hosted components and Stripe Connect own payment and payout details.
- Disputes, refunds, and corrections append compensating ledger entries rather than changing history.

## Webhooks and jobs

- Verify provider signature against the raw body, timestamp tolerance, endpoint secret, and expected account/context before accepting an event.
- Persist events under unique `(provider, provider_event_id)` before processing. Duplicates succeed without repeating effects.
- Do not trust delivery order. Handlers look up current provider state or safely no-op until prerequisites arrive.
- Isolate webhook routes from browser session/CSRF middleware. Never authorize from untrusted body metadata.
- Use a transactional outbox for email, notifications, transfers, and labels, with bounded retries and dead-letter review.

## Upload security

- Issue short-lived user-scoped Cloudinary signatures with allowlisted folders, formats, transformations, and byte limits.
- After upload, verify signature/public ID, owner, detected type, dimensions, size, and provider status before attachment.
- Strip metadata, deliver safe transformed formats, moderate reports, and keep originals private unless needed.
- Treat filenames and metadata as untrusted text. Prevent SVG/script delivery and cross-account public-ID reuse.

## Data, secrets, and operations

- Keep secrets in each environment’s encrypted secret store; local `.env` is ignored. Rotate after exposure, staff changes, or provider alerts.
- Separate least-privilege credentials and provider projects for local, staging, and production.
- Encrypt managed disks/backups, restrict database networking, and redact tokens, cookies, addresses, email, and payment data from logs.
- Define retention/deletion rules before launch. Preserve financial records only as required and pseudonymize deleted accounts where possible.
- Back up automatically and test restoration quarterly with documented RPO/RTO.
- Pin the package manager/lockfile; run dependency, secret, static, and container scans. Protect the default branch with review and required CI.
- Audit authentication, permissions, moderation, order intervention, refunds, disputes, and configuration changes.
- Alert on abuse, webhook failures, reconciliation drift, payout anomalies, elevated admin actions, and SLO violations.

## Incident response

1. Triage severity and preserve evidence without copying secrets into tickets.
2. Contain by revoking sessions/keys, disabling affected paths, or pausing payouts.
3. Identify affected users, orders, and time window from audit/provider records.
4. Patch, rotate, reconcile, and restore from verified backups if needed.
5. Notify users, providers, insurers, or regulators according to law and policy.
6. Complete a post-incident review with owners and deadlines.

## Launch gates

- Threat reviews completed for checkout, payouts, uploads, Google login, and administration.
- Authorization matrix and negative tests pass; no unresolved high/critical findings.
- Forged, replayed, duplicate, and out-of-order webhook tests pass.
- Backup restoration and payment reconciliation demonstrated in staging.
- Legal review covers terms, privacy, prohibited goods, taxes, payments, shipping, and disputes.

This plan reduces risk; it is not a compliance certification or legal opinion.
