# Production Runbook

## Service objectives

| Signal | Target | Page threshold |
|---|---:|---:|
| API availability | 99.9% over 30 days | 5-minute success rate below 99% |
| API latency | p95 below 500 ms | p95 above 1 s for 10 minutes |
| Checkout success | 99% excluding customer declines | below 97% for 10 minutes |
| Webhook processing | 99.9% within 5 minutes | oldest pending event above 10 minutes |
| Reconciliation | zero unexplained difference | any non-zero record older than 15 minutes |

Every alert must include environment, request or provider event ID, dashboard link, runbook link, and current deploy identifier. Alerts must not include cookies, tokens, addresses, or provider payloads.

## On-call response

1. Acknowledge within 10 minutes and assign an incident commander.
2. Confirm scope using health checks, structured request logs, provider dashboards, and reconciliation records.
3. Contain risk. Disable the affected mutation, pause payouts, or roll back; keep read-only marketplace access available when safe.
4. Preserve request IDs, audit events, deploy SHA, and provider event IDs. Never copy secrets into an incident channel.
5. Communicate at least every 30 minutes for SEV-1 and hourly for SEV-2.
6. Reconcile affected orders and financial records before resolving.
7. Publish a blameless review with owners and deadlines within five business days.

## Severity

- **SEV-1:** unauthorized access, incorrect money movement, broad checkout outage, or unrecoverable data risk.
- **SEV-2:** material provider or fulfillment degradation with a safe workaround.
- **SEV-3:** limited user impact, elevated latency, or operational toil.

## Deployment and rollback

1. Confirm CI, migration compatibility, provider sandbox smoke, and a current verified backup.
2. Deploy database migrations before code only when backward compatible. Destructive migrations require an expand/migrate/contract sequence.
3. Deploy API and worker, verify `/health/live` and `/health/ready`, then deploy web.
4. Run browse, authentication, checkout, webhook, label, refund, and reconciliation smoke tests.
5. Roll back the application artifact when error rate, latency, or a critical journey breaches its threshold. Do not reverse a migration until restore impact is understood.
6. After rollback, verify provider webhooks are still accepted and reconcile events received during the incident.

## Backup and restore

- Take encrypted managed PostgreSQL backups daily with point-in-time recovery enabled.
- Target RPO: 15 minutes. Target RTO: 2 hours.
- Run `scripts/backup-restore-drill.sh` against an isolated restore database quarterly.
- Record backup identifier, timestamps, migration counts, reconciliation result, operator, and deletion date for drill data.
- Never restore production personal data into local development.

## Provider degradation

- Stripe unavailable: keep browsing available, disable new checkout/refunds, and retain signed webhook retries.
- EasyPost unavailable: keep paid orders visible, prevent duplicate label purchases, and allow retry later.
- Cloudinary unavailable: retain item data, disable upload confirmation, and do not accept unverifiable assets.
- Resend unavailable: preserve pending email work and avoid leaking whether an account exists.
