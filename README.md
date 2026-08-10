# SlabX

SlabX is a planned mobile-first marketplace for buying, selling, offering on, collecting, and eventually trading collectible cards.

This repository includes Milestones 1–6: platform foundation, authentication and profiles, catalog and collection, image uploads, listings and discovery, and offer negotiation.

## Product vision

SlabX will launch with basketball, baseball, football, and Pokémon cards while keeping the catalog flexible enough for additional sports and trading-card games. The marketplace will distinguish:

1. a canonical catalog record, such as *2023 Panini Prizm Victor Wembanyama #136*;
2. a specific physical copy owned by a user, including condition, grading, certification, and photographs; and
3. a listing that offers that physical item for sale.

## Recommended stack

- **Language:** TypeScript throughout
- **Frontend:** React, Vite, React Router, TanStack Query, React Hook Form, Zod
- **Backend:** Node.js 24 LTS, Express 5, modular monolith
- **Database:** PostgreSQL 18 with Prisma ORM
- **Authentication:** server-managed secure sessions, Argon2id passwords, Google OIDC
- **Payments:** Stripe Connect Express and Stripe Checkout/PaymentIntents
- **Shipping:** EasyPost
- **Images:** Cloudinary for the MVP
- **Jobs/cache:** Redis with BullMQ when asynchronous workflows are introduced
- **Testing:** Vitest, React Testing Library, Supertest, Testcontainers, Playwright
- **CI/CD:** GitHub Actions with separate staging and production environments

## Documentation map

| Document | Purpose |
| --- | --- |
| [Product specification](docs/PRODUCT_SPEC.md) | Users, capabilities, MVP boundaries, requirements |
| [Architecture](docs/ARCHITECTURE.md) | System boundaries, modules, deployment, state machines |
| [Database schema](docs/DATABASE_SCHEMA.md) | PostgreSQL entities, relationships, constraints, indexes |
| [API design](docs/API_DESIGN.md) | REST conventions, endpoints, idempotency, errors |
| [Security](docs/SECURITY.md) | Threat model and marketplace security controls |
| [Testing](docs/TESTING.md) | Unit, API, integration, E2E, CI quality gates |
| [Roadmap](docs/ROADMAP.md) | Phased milestones and definitions of done |
| [Development](docs/DEVELOPMENT.md) | Local/staging/production workflow and Git conventions |
| [Decisions](docs/DECISIONS.md) | Architecture Decision Record log and open decisions |

## Core engineering principles

1. Security and least privilege
2. Financial correctness and auditability
3. Transactional data integrity
4. Maintainability and modular boundaries
5. Automated testability
6. Measured performance
7. Accessible, mobile-first user experience

## MVP summary

The first production release includes accounts, profiles, catalog-backed collection items, multi-image sale listings, browse/search/filter, offers, Stripe Connect onboarding and Buy Now checkout, orders, EasyPost labels and tracking, reviews, a user dashboard, and basic administrative operations.

Explicitly deferred: card-for-card trading, cards-plus-cash trades, market-price analytics, AI card recognition, auctions, native mobile apps, international shipping, and multi-currency settlement.

## Status and next step

Milestone 1 provides:

- React/Vite web application in `apps/web`
- Express API with liveness, readiness, request IDs, safe errors, and OpenAPI in `apps/api`
- PostgreSQL 18 and Prisma baseline in `packages/database`
- typed contracts, environment validation, structured logging, and test helpers
- unit/API/component tests, Playwright smoke coverage, and GitHub Actions CI
- local PostgreSQL Compose configuration and production container definitions

Milestone 2 adds:

- email/password registration, verification, login, logout, and password recovery
- Google OpenID Connect with state, nonce, and PKCE protection
- Argon2id password hashing, opaque server sessions, CSRF protection, throttling, and lockout controls
- collector profiles, an ownership-scoped address book, active-session visibility, and sign-out-everywhere
- identity, profile, role, token, session, address, and audit-event database models
- security-focused identity tests and an expanded OpenAPI contract

Milestone 3 adds:

- searchable canonical cards across basketball, baseball, football, and Pokémon
- extensible categories, manufacturers, sets, and grading-company data
- raw and graded physical collection items with certification collision protection
- private/public visibility, ownership-scoped editing, and cursor-ready pagination
- a curated starter catalog that can later be replaced or expanded by an importer
- mobile-first catalog search, card details, and personal collection screens

Milestone 4 adds:

- secure, ownership-scoped Cloudinary upload signatures without exposing provider secrets
- direct browser uploads with progress, retry guidance, format validation, and a 12 MB limit
- ordered collection images with a primary image, removal, and responsive previews
- provider confirmation, moderation state, and protection against cross-user attachment

Milestone 5 adds:

- fixed-price listing drafts with publish, pause, resume, and close controls
- responsive marketplace search, offer filters, price sorting, and listing detail pages
- condition disclosures, seller summaries, price history, and optimistic version checks
- idempotent buyer watchlists and seller-owned inventory controls

Milestone 6 adds immutable offer and counteroffer timelines, safe actor/state transitions, expiration processing, transactional notifications, and a checkout-eligible accepted-price reservation.

### Run locally

1. Install Node.js 24 and enable the pinned pnpm version with Corepack.
2. Copy `.env.example` to `.env` and keep the local placeholder credentials.
3. Run `docker compose up -d postgres`.
4. Run `pnpm install`, `pnpm db:migrate`, and `pnpm db:seed`.
5. Run `pnpm dev`, then open `http://localhost:5173`.

Use `pnpm check` for the full local quality suite and `pnpm test:e2e` for browser smoke tests.

Before staging, configure the providers listed in `.env.example`. The next product milestone is **Milestone 7: Checkout and Stripe Connect**.
