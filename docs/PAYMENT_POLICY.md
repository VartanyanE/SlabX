# SlabX test-mode payment policy

Milestone 7 is intentionally limited to Stripe test mode until payments counsel, tax review, refund rules, and seller payout timing are approved.

## Launch assumptions

- SlabX launches in the United States with USD prices and U.S. shipping addresses.
- Listings remain free. The seller pays an 8% SlabX marketplace fee calculated from the accepted item price in integer cents.
- The buyer pays the item price. Shipping and tax are excluded from this milestone and must be added before live sales.
- Sellers complete Stripe-hosted onboarding and must have both charges and payouts enabled before their listings are checkout-eligible.
- SlabX uses Stripe Connect destination charges. The application fee is retained by SlabX and the remainder is directed to the seller's connected account.
- A listing is reserved for one buyer for 30 minutes. Database locks and a partial unique index prevent two open or paid orders for the same listing.
- Stripe's signed webhook is authoritative for payment completion. Browser redirects never mark an order paid.
- Every paid order writes three immutable entries that net to zero: Stripe clearing, seller payable, and platform fee revenue.
- Webhook event IDs and checkout idempotency keys are unique and safely replayable.
- Refunds, disputes, shipping charges, tax collection, live transfers, and payout holds remain disabled until their policies are approved.

## Provider basis

- Stripe recommends hosted Account Links for connected-account onboarding and requires the account status to be retrieved after return.
- Destination charges create the charge on the platform, transfer proceeds to the connected account, and return the application fee to the platform. Stripe fees, refunds, and disputes debit the platform.
- Stripe requires webhook signature verification against the unmodified request body.

References: [Connect onboarding](https://docs.stripe.com/connect/marketplace/tasks/onboard), [destination charges](https://docs.stripe.com/connect/destination-charges), and [webhook signatures](https://docs.stripe.com/webhooks/signature).
