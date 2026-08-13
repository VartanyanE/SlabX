# Shipping and insurance policy

Status: Milestone 8 test-mode policy. Provider rates and labels use EasyPost test mode when `EASYPOST_API_KEY` is configured and fall back to the deterministic local adapter otherwise.

## Seller responsibilities

- Ship only after SlabX marks the order paid.
- Use the address snapshot attached to the order; do not request a different address through messages.
- Protect the card with a sleeve, rigid holder, team bag, padding, and a crush-resistant tracked mailer or box.
- Purchase the label through SlabX so tracking is attached to the order and auditable.
- Tender the package to the carrier within three business days.

## Tracking and delivery

- Buyer and seller see the same append-only tracking timeline.
- EasyPost webhook deliveries require the v2 HMAC signature and must be less than one minute old.
- Provider events are deduplicated and may arrive out of order; an older event cannot move fulfillment backwards.
- Delivery is based on the carrier's confirmed delivery event. Exceptions remain visible until resolved.

## Insurance

- Tracked service is required for every order.
- Signature confirmation and declared-value insurance will be required above thresholds finalized before public launch.
- Until those thresholds are approved, SlabX test labels are previews and are not valid postage.

## Failures and retries

- Label purchase uses an idempotency key so a retry cannot create a second charge or label.
- If the provider is unavailable, the order stays paid and unshipped; inventory and payment records are unchanged.
- Refunds, lost-package claims, and payout holds are completed in Milestone 10.
