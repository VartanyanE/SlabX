# Public Launch Checklist

Milestone 11 engineering work makes these gates testable; it does not substitute for the named human approvals.

## Engineering

- [ ] Production configuration uses rotated secrets and separate live provider credentials.
- [ ] CI, migration-from-empty, mobile E2E, provider sandbox, and dependency scans pass.
- [ ] Load test meets the documented SLO at twice forecast peak traffic.
- [ ] Accessibility audit has no serious or critical WCAG 2.2 AA findings.
- [ ] Backup restore, rollback, and financial reconciliation drills are recorded.
- [ ] Dashboards alert on availability, latency, provider failures, reconciliation drift, and elevated admin actions.
- [ ] DNS, TLS, CSP, HSTS, cookies, CORS, and webhook signatures are verified in production.

## Operations

- [ ] Primary and backup on-call owners accept the runbook and escalation policy.
- [ ] Stripe, EasyPost, Cloudinary, Resend, database, and hosting status contacts are documented privately.
- [ ] Support can locate an order by public reference without exposing personal data.
- [ ] Fraud thresholds, refund authority, payout holds, and emergency shutdown ownership are approved.

## Security and legal

- [ ] Independent security review has no unresolved high or critical findings.
- [ ] Terms, privacy, returns, prohibited items, fees, taxes, dispute, and shipping language are approved by counsel.
- [ ] Data retention, deletion requests, breach notification, and financial record retention are approved.
- [ ] Production access follows least privilege and requires MFA.

## Go/no-go record

Record the release SHA, date, approvers for Product, Engineering, Operations, Security, Legal, and Finance, known risks, rollback owner, and final decision here or in the controlled release record.
