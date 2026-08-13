# Architecture Decision Log

This file is the source of truth for significant technical choices. Accepted decisions should not be reopened without new evidence. New decisions use the next ADR number and record context, decision, consequences, and status.

## ADR-001 — TypeScript end to end

- **Status:** Proposed for approval
- **Decision:** Use strict TypeScript for web, API, workers, shared contracts, and tests.
- **Why:** Marketplace state and money flows benefit from compile-time contracts, safer refactoring, and shared validation types.
- **Consequences:** Slightly more setup; CI must run type checking separately from builds.

## ADR-002 — Modular monolith

- **Status:** Proposed for approval
- **Decision:** Start with one API deployable organized into domain modules.
- **Why:** Preserves transactions and operational simplicity while providing clean boundaries.
- **Consequences:** Module boundaries require review discipline; no direct cross-module table mutation outside application services.

## ADR-003 — PostgreSQL and Prisma

- **Status:** Proposed for approval
- **Decision:** PostgreSQL 18 is the system of record; Prisma handles schema, migrations, and typed access. Use SQL migrations/extensions for constraints Prisma cannot express.
- **Why:** Strong transactions, indexing, JSONB where justified, and broad operational support.
- **Consequences:** Engineers must review generated SQL and may maintain hand-written migration SQL.

## ADR-004 — Server-managed sessions

- **Status:** Proposed for approval
- **Decision:** Use opaque random session tokens in Secure, HttpOnly, SameSite cookies. Store only token hashes with expiry and revocation metadata.
- **Why:** Easier revocation and lower browser token-exposure risk than long-lived JWTs.
- **Consequences:** Session lookup per request; Redis may be added for performance, but PostgreSQL remains authoritative.

## ADR-005 — Argon2id password hashing

- **Status:** Proposed for approval
- **Decision:** Hash passwords with Argon2id using parameters benchmarked for production infrastructure and a server-side pepper from secret storage.
- **Why:** Modern memory-hard protection against offline attacks.
- **Consequences:** Parameters require periodic review and rehash-on-login migration.

## ADR-006 — Stripe Connect Express

- **Status:** Proposed for approval
- **Decision:** Use Stripe Connect Express for seller onboarding and platform fees. Prefer destination charges unless legal/accounting review selects separate charges and transfers.
- **Why:** Minimizes custom KYC and payout UI while supporting marketplace economics.
- **Consequences:** Final charge model, payout timing, refund liability, and geography require product/legal decisions before Milestone 6.

## ADR-007 — Cloudinary for MVP images

- **Status:** Proposed for approval
- **Decision:** Use signed direct Cloudinary uploads behind an `ImageStorage` adapter.
- **Why:** Faster delivery of transformations, thumbnails, CDN, and moderation than a custom S3 pipeline.
- **Consequences:** Vendor cost and lock-in are mitigated by storing portable asset metadata and using an adapter.

## ADR-008 — REST API with Zod contracts

- **Status:** Proposed for approval
- **Decision:** Versioned `/api/v1` REST endpoints with Zod request/response schemas shared through a contracts package.
- **Why:** Clear resource semantics, approachable tooling, and explicit validation.
- **Consequences:** Breaking changes require versioning or compatible evolution.

## ADR-009 — Integer minor units for money

- **Status:** Proposed for approval
- **Decision:** Persist monetary amounts as signed 64-bit integer minor units plus ISO currency code.
- **Why:** Eliminates floating-point errors and makes reconciliation deterministic.
- **Consequences:** Formatting and arithmetic helpers are mandatory; currencies with non-two-decimal minor units must be handled correctly.

## ADR-010 — Webhook inbox and transactional outbox

- **Status:** Proposed for approval
- **Decision:** Deduplicate provider events in a webhook inbox and publish domain side effects through a transactional outbox.
- **Why:** Makes retries, replay, audit, and failure recovery safe.
- **Consequences:** Requires worker/dispatcher monitoring and retention policies.

## ADR-011 — Immutable commercial snapshots

- **Status:** Proposed for approval
- **Decision:** Order items snapshot product identity, item facts, price, fees, and addresses used at purchase time.
- **Why:** Historical and financial records must not change when catalog, profile, listing, or address data changes.
- **Consequences:** Some data is intentionally duplicated and governed by retention/privacy rules.

## ADR-012 — Cloud-neutral deployment

- **Status:** Proposed for approval
- **Decision:** Use containerized Node processes and managed PostgreSQL/Redis/object services without provider-specific application APIs.
- **Why:** Keeps MVP deployment flexible among Render, Fly.io, Railway, AWS, GCP, or similar.
- **Consequences:** Infrastructure provider and IaC tool remain open until Milestone 1.

## ADR-013 — Curated seed catalog before vendor ingestion

- **Status:** Accepted for Milestone 3
- **Decision:** Launch the catalog model and contribution workflow with a small reviewed seed dataset. Keep source-specific imports outside the core catalog repository.
- **Why:** No catalog licensing/source agreement exists yet, and identity/collection development should not depend on a vendor decision.
- **Consequences:** The initial catalog is intentionally small. A licensed dataset or importer must preserve fingerprints, moderation status, and merge history when introduced.

## ADR-014 — Draft marketplace fee policy

- **Status:** Draft for Milestone 5; final approval required before checkout
- **Decision:** Listings are free to create. Display prices represent the seller's asking price in USD. SlabX will model an 8% seller-paid marketplace fee, excluding payment processing, shipping, tax, refunds, and promotions, which remain open before the payments design freeze.
- **Why:** Listing and discovery need a stable price meaning without prematurely coupling marketplace browsing to payment calculations.
- **Consequences:** Milestone 5 stores only the asking price. Checkout must calculate and disclose final fees server-side, and the percentage may change before Milestone 7 without rewriting listing history.

## ADR-015 — Milestone 7 test-mode payment freeze

- **Status:** Accepted for test mode; live-mode approval pending
- **Decision:** Launch development with U.S./USD only, an 8% seller-paid platform fee, Stripe-hosted onboarding, and Connect destination charges. Stripe webhooks are authoritative and financial records use immutable balanced ledger entries.
- **Why:** This matches the existing marketplace model, minimizes stored compliance data, and provides a complete reconciliation path while product/legal decisions remain open.
- **Consequences:** SlabX bears Stripe fees and destination-charge refund/dispute exposure. Shipping, tax, refunds, disputes, and live payouts remain disabled until reviewed.

## ADR-016 — Provider-independent shipping with mock-first delivery

- **Status:** Accepted for Milestone 8 test mode
- **Decision:** Keep rates, label purchase, and tracking behind a shipping-provider interface; use a deterministic mock provider until EasyPost access is approved.
- **Why:** Development can continue without credentials, while production integration becomes an adapter replacement instead of a workflow rewrite.
- **Consequences:** Paid-order and seller ownership checks remain in SlabX, label purchase is idempotent, address and parcel data are snapshotted, and tracking events are append-only.

## Open decisions requiring owners

| ID | Decision | Owner needed by |
| --- | --- | --- |
| OD-01 | Refund allocation and seller payout timing; 8% seller fee accepted for test mode | Before live payments |
| OD-02 | International roadmap; U.S./USD accepted for test mode | Before live payments |
| OD-03 | Live merchant-of-record/legal posture; destination charges accepted for test mode | Before live payments |
| OD-04 | Raw-card condition vocabulary and photo requirements | Before catalog/listing UX |
| OD-05 | Long-term catalog source, licensing, and moderation staffing | Before public catalog launch |
| OD-06 | Reservation timeouts for checkout and accepted offers | Before offers/checkout |
| OD-07 | Cancellation, return, dispute, and review policies | Before order state implementation |
| OD-08 | Seller payout hold and delivery-confirmation policy | Before payments/shipping |
| OD-09 | Hosting provider, regions, backup RPO/RTO, and budget | During Milestone 1 |
| OD-10 | Email provider and notification requirements | Before Milestone 2 |
| OD-11 | Search approach: PostgreSQL first or managed search at launch | During Milestone 4 load testing |
| OD-12 | Data retention/deletion requirements and age restrictions | Before production launch |
