# Development and Delivery

## Intended repository layout

```text
apps/web                  React/Vite frontend
apps/api                  Express HTTP application
apps/worker               BullMQ jobs when introduced
packages/contracts        Zod schemas and generated API types
packages/database         Prisma schema, migrations, seeds
packages/config           Typed configuration
packages/observability    Logging, tracing, metrics
packages/test-utils       Factories and provider fakes
docs                      Product and engineering plans
```

Use pnpm workspaces with a committed lockfile and pinned Node.js 24 LTS. Keep domain modules inside the API; do not create deployable services merely to mirror folders.

## Environments

| Environment | Purpose | Data/providers | Deployment rule |
|---|---|---|---|
| Local | Fast feature work | Disposable synthetic data; provider test keys | Developer-controlled |
| CI | Repeatable verification | Database per job; fakes/sandboxes | Ephemeral per commit |
| Staging | Release candidate | Synthetic data; provider sandboxes | Automatic from protected integration flow |
| Production | Customer traffic | Real data; live providers | Approved immutable artifact promotion |

Configuration is validated at startup. Missing or malformed required values fail fast. Never allow production to point at test providers or lower environments to point at production resources.

## Local setup (after Milestone 1 scaffolding)

1. Install Node.js 24 LTS and enable the repository-pinned pnpm version through Corepack.
2. Copy `.env.example` to `.env`; use only local/test credentials.
3. Start PostgreSQL (and Redis when jobs exist) through the repository’s container definition.
4. Install dependencies from the lockfile.
5. Apply migrations and run the deterministic development seed.
6. Start web and API in watch mode; verify readiness and the Playwright smoke test.

The future repository should expose memorable root commands such as `dev`, `build`, `lint`, `typecheck`, `test`, `test:e2e`, `db:migrate`, `db:seed`, and `openapi:check`. Their implementation belongs to Milestone 1.

## Environment variables and secrets

`.env.example` documents names and safe placeholders only. Local `.env*` files containing values must be ignored. Production/staging values live in encrypted platform secret stores.

| Group | Examples | Notes |
|---|---|---|
| Runtime | `NODE_ENV`, origins, port, log level | Explicit origin allowlists |
| Database/queue | `DATABASE_URL`, `DIRECT_DATABASE_URL`, `REDIS_URL` | Separate roles where hosting supports it |
| Identity | session/CSRF secrets, Google credentials | Rotate without code changes |
| Commerce | Stripe keys/webhook secret | Distinct test/live accounts and endpoints |
| Shipping/media | EasyPost, Cloudinary credentials | Least privilege, signed operations |
| Email/telemetry | sender/provider key, Sentry DSN | Redact user and financial data |

Each secret has an owner, purpose, environments, creation date, rotation method, and revocation procedure. Never print environment values in tests, CI logs, screenshots, issues, or Codex prompts.

## Database workflow

- The Prisma schema is the model source, but every generated migration is reviewed as SQL.
- One feature PR owns a forward migration. Never edit an applied migration; add a corrective migration.
- Prefer expand/migrate/contract changes: add compatible structure, backfill asynchronously, switch code, then remove later.
- Transactions and hand-written SQL implement locks, partial unique indexes, check constraints, and ledger guarantees Prisma cannot express.
- CI migrates a blank database and a previous-release snapshot. Production migration runs as a separate, observable release step before compatible application promotion.
- Seeds are deterministic, synthetic, idempotent, and prohibited in production.

## Git and review workflow

- Protect `main`; no direct pushes. Use short-lived branches named `feat/...`, `fix/...`, `chore/...`, or `docs/...`.
- Keep commits focused and imperative. Rebase/update before final review according to repository policy.
- Every PR states intent, screenshots for visible changes, schema/API impact, security/privacy impact, test evidence, rollout, and rollback.
- Require at least one reviewer; require a domain/security reviewer for auth, money, permissions, uploads, migrations, and provider webhooks.
- Require CI, resolved conversations, and current branch protection. Prefer squash merge unless preserving a meaningful migration sequence.
- Releases promote the same built artifact from staging to production and record commit, migrations, operator, and timestamp.

## CI/CD and observability

- Pull requests run static checks, tests, migration validation, build, OpenAPI drift, E2E smoke, and supply-chain scans.
- Default-branch artifacts are signed/versioned and deployed to staging. Production promotion requires environment approval until operations maturity supports automation.
- Use structured JSON logs with request, user (pseudonymous), order, provider event, and job correlation IDs. Never log secrets or full personal/payment payloads.
- Track request rate/error/duration, queue depth/age, webhook failures, checkout conversion, payment reconciliation drift, and provider latency.
- Define SLOs and alerts before beta; every actionable alert links to a runbook.

## Coding standards

- TypeScript strict mode; avoid `any` at external boundaries. Parse external input before domain use.
- Domain services own state transitions and authorization; controllers translate HTTP only.
- Share schemas/contracts, not database models, with the frontend.
- Use integer money values and explicit ISO currency codes; use UTC instants and explicit user time zones for display.
- Build mobile-first semantic UI, keyboard support, visible focus, sufficient contrast, labels, and reduced-motion support.
- Keep modules acyclic and prohibit cross-module table mutation outside approved application services.

## Using Codex safely

Give Codex one milestone or bounded vertical slice at a time. Include the relevant approved documents, expected files, acceptance tests, and a clear statement about whether it may edit, commit, push, or deploy. Review migrations, auth/payment logic, provider configuration, and generated secrets manually.

Recommended next Codex task:

> Implement Milestone 1 only from the approved SlabX documents. Scaffold the pnpm TypeScript monorepo, React/Vite web app, Express API, PostgreSQL/Prisma baseline, typed environment validation, health endpoints, structured logging, CI, and smoke tests. Do not implement marketplace features. Show all assumptions and stop before any external deployment.

## Release checklist

- Acceptance criteria and required tests pass.
- Migration, compatibility, backfill, and rollback reviewed.
- API/OpenAPI and user-facing documentation updated.
- Security/privacy and accessibility impacts reviewed.
- Provider sandbox and observability checks pass in staging.
- Backup/restore posture is current; operator and rollback owner are known.
- Post-deploy smoke and reconciliation checks have an owner.
