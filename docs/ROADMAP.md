# Delivery Roadmap

Each milestone should ship as a reviewable vertical slice. Dates follow team capacity and approval; milestones are ordered by dependency, not calendar promise.

## Milestone 0 — Architecture approval

- **Objective:** Agree on product boundaries, domain language, stack, risks, and delivery rules.
- **Features:** Planning documents, ADRs, state machines, threat model, API and schema proposals.
- **Database/API/frontend:** No implementation; review contracts, models, and mobile-first journeys.
- **Tests:** Define quality gates, critical scenarios, and CI design.
- **Definition of done:** Stakeholders resolve blocking open decisions and approve the documented MVP.
- **Dependencies:** Product owner, payments/legal consultation.

## Milestone 1 — Repository and platform foundation

- **Objective:** Produce a deployable empty vertical slice with safe engineering defaults.
- **Features:** pnpm workspace, web/API/worker packages, configuration, structured logs, health checks, error handling.
- **Database:** PostgreSQL container, Prisma baseline, migration/seed commands.
- **API:** `/health/live`, `/health/ready`, versioned router, error envelope, OpenAPI generation.
- **Frontend:** App shell, routes, responsive tokens, accessibility baseline, API client.
- **Tests:** Lint/type/unit/build, database migration smoke, Playwright home-page smoke.
- **Definition of done:** CI passes and identical artifacts deploy to staging with telemetry.
- **Dependencies:** Milestone 0 approval, hosting/environment choice.

## Milestone 2 — Authentication and profiles

- **Objective:** Establish trustworthy customer identity and account management.
- **Features:** Registration, verification, login/logout, password reset, Google OIDC, profile/address book, session management.
- **Database:** Users, credentials, identities, sessions, tokens, profiles, addresses, roles.
- **API:** Auth/profile/address endpoints, CSRF, throttling, authorization middleware.
- **Frontend:** Mobile-first auth, account settings, address forms, session/device view.
- **Tests:** Account takeover negatives, token expiry/reuse, CSRF, IDOR, Google adapter contract.
- **Definition of done:** Verified users can securely manage identity/profile in staging; audit events exist.
- **Dependencies:** Email provider and Google credentials.

## Milestone 3 — Catalog and collection

- **Objective:** Separate canonical card identity from a user’s physical collectible.
- **Features:** Browse/search catalog, add collection item, raw/graded details, certification, ownership visibility.
- **Database:** Categories, manufacturers, sets, catalog cards, grading companies, collection items.
- **API:** Catalog search/detail and collection CRUD with cursor pagination.
- **Frontend:** Search/browse, card detail, collection list/detail, add/edit flow.
- **Tests:** Catalog uniqueness, ownership authorization, filters, pagination, accessibility.
- **Definition of done:** A user can reliably record a distinct physical card against the catalog.
- **Dependencies:** Initial catalog ingestion/source decision.

## Milestone 4 — Image uploads

- **Objective:** Attach safe, high-quality images to collectibles.
- **Features:** Signed upload, progress/retry, ordering, primary image, removal, moderation hooks.
- **Database:** Media assets, item-media joins, scan/moderation state.
- **API:** Upload signature, confirmation, reorder/delete endpoints.
- **Frontend:** Camera/file picker, preview, crop guidance, error recovery.
- **Tests:** Signature scope, type/size spoofing, cross-user attach, provider contract.
- **Definition of done:** Users upload and manage images without exposing provider secrets or unsafe formats.
- **Dependencies:** Cloudinary account and content policy.

## Milestone 5 — Listings and discovery

- **Objective:** Let sellers publish inventory and buyers find it quickly.
- **Features:** Draft/publish/pause/close, fixed price, condition disclosures, search/filter/sort, listing detail, watchlist.
- **Database:** Listings, price history, watchlist, searchable indexes.
- **API:** Listing lifecycle, browse/search, watch/unwatch, optimistic version checks.
- **Frontend:** Seller form, responsive result grid/list, filters, detail page, saved items.
- **Tests:** Transition/ownership rules, hidden inventory, search correctness, stale updates.
- **Definition of done:** A verified seller publishes a searchable listing that a buyer can watch.
- **Dependencies:** Milestones 3–4; fee policy draft.

## Milestone 6 — Offers and counteroffers

- **Objective:** Support safe negotiation without losing history.
- **Features:** Offer, counter, accept, decline, cancel, expiration, notification.
- **Database:** Offer threads and immutable revisions with current-revision pointer.
- **API:** Offer transitions with idempotency and concurrency protection.
- **Frontend:** Negotiation timeline, action forms, status/expiry feedback.
- **Tests:** Actor/state matrix, simultaneous acceptance, immutable history, expiration worker.
- **Definition of done:** An accepted offer produces one checkout-eligible price snapshot.
- **Dependencies:** Listings, notifications/outbox foundation, offer policy.

## Milestone 7 — Checkout and Stripe Connect

- **Objective:** Collect buyer payment and establish a traceable seller obligation.
- **Features:** Seller onboarding, buy-now/accepted-offer checkout, fees, payment status, receipts.
- **Database:** Orders/items/snapshots, payment attempts, connected accounts, ledger, webhook inbox.
- **API:** Checkout, order read, Stripe onboarding/return, signed webhook receiver.
- **Frontend:** Seller onboarding, checkout, payment return/recovery, buyer/seller order views.
- **Tests:** Double-sale race, idempotency, webhook replay/order, fee math, ledger balance.
- **Definition of done:** Stripe test-mode purchase reconciles to one order and balanced ledger; no double sale.
- **Dependencies:** Stripe approval, tax/fee/refund decisions, legal review.

## Milestone 8 — Shipping and fulfillment

- **Objective:** Move sold cards with trackable fulfillment.
- **Features:** EasyPost rates/labels, tracking timeline, shipment reminders, delivery state.
- **Database:** Shipments, parcels, rates, labels, tracking events.
- **API:** Rates, label purchase, tracking webhook, fulfillment transitions.
- **Frontend:** Seller shipping flow, printable label link, buyer/seller timeline.
- **Tests:** Address validation, label retry/deduplication, out-of-order tracking, provider outage.
- **Definition of done:** A test order advances from paid through delivered with auditable tracking.
- **Dependencies:** Checkout, EasyPost account, shipping/insurance policy.

## Milestone 9 — Reviews and trust

- **Objective:** Add transaction-backed reputation and abuse reporting.
- **Features:** Buyer/seller reviews, ratings, reports, basic moderation queue, public trust summary.
- **Database:** Reviews, aggregates, reports, moderation actions, audit events.
- **API:** Eligible review/report endpoints and moderator actions.
- **Frontend:** Review prompts/forms, profile reputation, report flow, moderator queue.
- **Tests:** Eligibility/uniqueness, retaliation/privacy rules, moderation RBAC/audit.
- **Definition of done:** Only transaction participants can review and reports have accountable resolution.
- **Dependencies:** Delivered orders, moderation policy and staffing.

## Milestone 10 — Refunds, disputes, transfers, and payouts

- **Objective:** Complete the financial lifecycle safely.
- **Features:** Refund requests, dispute evidence/status, seller transfers, payout holds, reconciliation dashboard.
- **Database:** Refunds, disputes, transfers, payouts, ledger/reconciliation records.
- **API:** Policy-driven refund/admin operations and provider webhook transitions.
- **Frontend:** Case status, evidence capture, staff tools, seller balance visibility.
- **Tests:** Partial/full refunds, chargebacks, insufficient balance, duplicate webhooks, compensating ledger entries.
- **Definition of done:** Every provider movement reconciles to an immutable balanced ledger and auditable case.
- **Dependencies:** Stripe policy/design review, support process, legal/accounting input.

## Milestone 11 — Hardening and public launch

- **Objective:** Demonstrate production readiness under realistic failure and load.
- **Features:** Performance tuning, accessibility remediation, fraud signals, runbooks, dashboards, backups, incident controls.
- **Database:** Index review, retention jobs, restore/reconciliation proof.
- **API:** SLOs, rate-limit tuning, graceful degradation, admin safety rails.
- **Frontend:** Cross-device QA, resilient error/empty/offline states, performance budgets.
- **Tests:** Pen test, load/soak, restore and rollback drills, full provider sandbox, WCAG audit.
- **Definition of done:** Launch checklist, security/legal approvals, on-call ownership, and rollback plan signed off.
- **Dependencies:** All MVP milestones, forecast traffic, operations ownership.

## Milestone 12 — Trading foundation (post-MVP)

- **Objective:** Add multi-item trade proposals without weakening sale inventory guarantees.
- **Features:** Trade offers, item bundles, optional cash adjustment, negotiation, acceptance, dual shipment.
- **Database:** Trade threads/revisions/legs/items, generalized item locks, dual fulfillment.
- **API:** Trade lifecycle and atomic multi-item reservation.
- **Frontend:** Trade composer, valuation summary, negotiation and two-sided timeline.
- **Tests:** Deadlock/concurrency, item reuse, partial shipment, cancellation, cash adjustment accounting.
- **Definition of done:** One accepted trade atomically locks all items and has a recoverable fulfillment/dispute path.
- **Dependencies:** Stable marketplace operations and an approved escrow/risk model.

## MVP release boundary

MVP includes Milestones 0–11. Trading, auctions, native apps, internationalization, advanced pricing, bulk dealer tools, and social features remain outside the first release.
