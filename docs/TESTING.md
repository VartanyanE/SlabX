# Testing Strategy

## Goals

Protect money, ownership, state transitions, authorization, and the journeys that make the marketplace viable. Prefer deterministic tests and provider adapters over broad snapshots.

| Layer | Tools | Scope |
|---|---|---|
| Static | TypeScript, ESLint, dependency/secret scanning | Types, unsafe patterns, supply chain |
| Unit | Vitest | Money math, fees, state machines, validation, policies |
| Component | React Testing Library | Forms, accessibility, loading/error/empty states |
| API | Supertest | HTTP contracts, sessions, CSRF, RBAC, errors, idempotency |
| Integration | Vitest + Testcontainers PostgreSQL | Transactions, constraints, locks, migrations, outbox |
| Contract | Provider adapters + sanitized fixtures | Stripe, EasyPost, Cloudinary, Google assumptions |
| End-to-end | Playwright | Critical journeys in a production-like stack |
| Operational | k6/Artillery and drills | Load, recovery, observability, runbooks |

## Critical scenarios

### Identity and authorization

- Register, verify, log in/out, rotate/revoke session, reset password, Google sign-in/linking.
- CSRF failure, expired/forged token, rate limiting, disabled user, and global session invalidation.
- Cross-user reads/writes for every owned resource; moderator/admin boundaries.

### Catalog, collection, listings, and offers

- Canonical card resolution, duplicate item handling, grading fields, and image ownership.
- Draft/publish/pause/close transitions, stale-version conflicts, and search pagination stability.
- Offer/counter immutable revisions, accept/decline/cancel/expire, concurrent acceptance, and expired listing behavior.

### Orders, payments, and fulfillment

- Two buyers attempt the same item; exactly one order reserves it.
- Reusing an idempotency key returns the same result; changing its payload conflicts.
- Payment succeeds/fails/requires action; duplicate and out-of-order webhooks converge correctly.
- Commercial/address snapshots remain stable after user or listing edits.
- Label retry, tracking, delivery, cancellation, refund, dispute, transfer, and payout holds.
- Ledger entries balance for sale, fee, refund, dispute, transfer, and correction.

### Trust and operations

- Reviews require an eligible completed order and remain unique per reviewer/order/subject.
- Report/moderation actions retain reason and audit trail without exposing PII.
- Outbox delivery retries and deduplicates while honoring notification preferences.

## Design rules

- Use factories with explicit defaults; never share mutable fixture state.
- Freeze clocks and IDs where order matters. Run concurrency tests on real PostgreSQL, not SQLite.
- Use provider fakes for most tests and a small sandbox suite against provider test environments.
- Assert observable behavior and database invariants rather than implementation details.
- Add property-based tests for fee rounding, money allocation, ledger balance, and transition closure.
- Every production defect receives the smallest regression test that would have caught it.

## Environments and data

- **Local:** disposable PostgreSQL, fake email, test provider keys, deterministic seed users/cards/listings.
- **CI:** isolated database per job; migrations run from empty and from a prior-release snapshot.
- **Staging:** production topology with provider sandboxes and synthetic data only.
- **Production:** smoke checks use dedicated synthetic accounts and no real charges/payouts.

Never copy production personal data to lower environments. Sanitized webhook fixtures exclude secrets and personal fields.

## CI pipeline

1. Install from lockfile and verify generated files.
2. Format, lint, type-check, and scan secrets/dependencies.
3. Run unit, component, and API tests in parallel.
4. Run migrations and integration tests on PostgreSQL.
5. Build web/API/worker and validate generated OpenAPI.
6. Run Playwright smoke journeys against the assembled stack.
7. On protected branches, run migration compatibility, provider sandbox smoke, and artifact scans.

Required checks block merge. A flaky test may be quarantined only with an owner, issue, and short expiration.

## Quality gates

- Require 90% branch coverage for money, authorization, and state-machine modules and 80% for service modules; scenario coverage remains more important than totals.
- Critical E2E journeys pass on Chromium and a mobile viewport; accessibility scans have no serious/critical findings.
- Constraints and concurrency tests demonstrate no double sale or repeated financial effect.
- Define SLOs before beta and load-test browse/search and checkout at twice forecast peak.
- Promotion requires restore/reconciliation success and rollback rehearsal for risky migrations.

## Initial E2E journeys

1. A user verifies email, adds a collectible, uploads images, and publishes a listing.
2. A buyer searches, watches, purchases, completes test payment, and sees the timeline.
3. A buyer offers, seller counters, buyer accepts, and checkout uses the accepted price.
4. A seller buys a label, tracking reaches delivered, and both parties review.
5. A moderator handles a report and every action appears in the audit log.
