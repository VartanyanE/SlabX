# SlabX Offer Policy

## Research basis

SlabX adapts established marketplace patterns while reserving inventory for a later payment step:

- eBay gives sellers a short response window, permits accept/decline/counter, limits repeated offers, and treats acceptance as a purchase commitment: https://www.ebay.com/help/buying/buy-now/making-best-offer?id=4019
- eBay counteroffers supersede earlier revisions and must move the parties toward agreement: https://developer.ebay.com/api-docs/user-guides/static/trading-user-guide/best-offers-counter.html
- Whatnot allows cancellation while an offer is pending and automatically charges only after acceptance: https://help.whatnot.com/hc/en-us/articles/4407216260493-Make-an-offer-on-a-Buy-It-Now-product

## SlabX MVP rules

- Offers are available only on active listings whose seller enabled offers.
- Buyers cannot offer on their own listings.
- Buyer offers and all counteroffers expire after 24 hours.
- A buyer may originate at most five offer revisions per listing.
- Offers must be below the fixed price and at or above the seller's private minimum.
- Seller counters must be above the buyer's current amount; buyer counters must be below the seller's current amount.
- A counter supersedes the prior revision, but every revision remains immutable and visible in the timeline.
- A buyer may cancel only while their latest offer is waiting for the seller. A party may decline only when the latest revision is waiting for them.
- Acceptance is final for negotiation purposes and produces one immutable accepted-price snapshot.
- Acceptance reserves the listing for that buyer for 30 minutes. Milestone 7 will attach payment to this reservation.
- All transitions use optimistic versions and database locks. Simultaneous acceptance can produce only one winner.
- Expired negotiations and checkout reservations are released by the worker. Notifications are written transactionally with an outbox event.
