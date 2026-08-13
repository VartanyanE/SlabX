# Financial Operations Policy

Refunds are limited to the remaining refundable order amount and require a documented reason. Buyers may request refunds; only authorized staff may approve or reject them. Provider calls use stable idempotency keys, and failed requests remain safe to retry.

SlabX currently uses Stripe destination charges. Approved refunds therefore reverse the destination transfer and refund the application fee so seller funds are recovered proportionally instead of leaving the platform to absorb the refund. Each completed refund creates compensating ledger entries and a provider reconciliation record.

Stripe dispute webhooks are deduplicated through the webhook inbox. An open dispute creates one seller payout hold for the affected order. Winning the dispute releases that hold; losing it consumes the hold. Closed disputes retain their full audit history.

Financial staff must document decisions, use least privilege, avoid changing provider state outside the SlabX workflow, and escalate reconciliation differences immediately. Production release requires legal and accounting approval of refund windows, evidence handling, negative-balance ownership, and payout timing.
