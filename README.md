# SlabX

SlabX is a planned mobile-first marketplace for buying, selling, offering on, collecting, and eventually trading collectible cards.

This repository is currently in **Milestone 0: Architecture**. It intentionally contains planning documentation rather than application code. Architecture approval is required before implementation begins.

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

The current workspace was empty and was not a Git repository. These files form a repository-ready architecture package.

**Next task after approval:** initialize the TypeScript monorepo foundation from `docs/ARCHITECTURE.md` and Milestone 1 in `docs/ROADMAP.md`, without implementing authentication or marketplace features.
