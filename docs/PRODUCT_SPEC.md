# Product Specification

## 1. Purpose

SlabX is a trusted marketplace and collection system for physical collectible cards. It helps collectors discover cards, manage specific owned copies, negotiate offers, complete secure purchases, ship items, and build reputation.

## 2. Product goals

- Make listing a raw or graded card fast on a phone.
- Preserve catalog quality without blocking sellers when a catalog entry is missing.
- Prevent double sales and inconsistent financial states.
- Give buyers clear item-level evidence: grading, certification, condition, and photos.
- Provide traceable payments, shipping, reviews, disputes, and administrative actions.
- Support new collectible categories and grading companies as data, not code changes.

## 3. Non-goals for MVP

- Auctions, breaks, mystery packs, or randomized purchases
- Card-for-card trading or cards-plus-cash trades
- Native iOS or Android apps
- Automated pricing recommendations
- AI image recognition or automated grading
- International shipping, duties, and multi-currency settlement
- Seller subscriptions, promoted listings, or advertising
- Escrow outside the capabilities and legal model supported by Stripe Connect

## 4. Primary users

### Collector/buyer

Browses, searches, watches cards, makes offers, buys, tracks delivery, adds items to a collection, and reviews sellers.

### Seller

Creates catalog-backed physical items and listings, uploads evidence, accepts or counters offers, completes Stripe onboarding, buys shipping labels, and receives eligible payouts.

### Marketplace administrator

Reviews users, listings, orders, reports, disputes, webhook failures, and audit history. Administrative capabilities are permission-based rather than a single all-powerful flag.

## 5. Core concepts

### Canonical card

A product-like catalog identity shared across copies. Example: `2023 Panini Prizm Victor Wembanyama #136 Silver`.

### Collection item

A specific physical copy owned by a user. It contains raw/graded state, grade, certification, condition notes, acquisition data, and ownership status.

### Listing

A time-bound commercial offer to sell one collection item. The listing references a price and listing images but never substitutes for ownership.

### Order

A server-created transaction snapshot that preserves buyer, seller, listing, item, prices, fees, addresses, and state even if source records later change.

## 6. MVP capabilities

### Accounts and profiles

- Email/password registration, verification, login, logout, password reset
- Google OIDC login with safe account linking
- Public collector profile and private account settings
- Multiple shipping addresses with an explicit default
- Stripe Connect Express onboarding for sellers

### Catalog and collection

- Search or create a canonical catalog entry
- Add a specific raw or graded copy to a collection
- Extensible categories and grading companies
- Multiple images with a designated primary image
- Visibility controls for collection items

### Marketplace

- Draft, publish, pause, and close fixed-price listings
- Browse, keyword search, sorting, and structured filters
- Listing detail with seller summary and item evidence
- Watchlist add/remove
- Abuse-report entry point

### Offers

- Buyer offer with amount and expiry
- Seller accept, decline, or counter
- Buyer accept/decline counter and cancel pending offers
- Listing reservation when an offer is accepted

### Commerce and shipping

- Stripe Connect seller onboarding
- Buy Now and accepted-offer checkout
- Server-calculated subtotal, marketplace fee, shipping, and total
- Idempotent payment creation and webhook processing
- EasyPost rates, label purchase, tracking, and webhook updates
- Buyer/seller order timelines

### Reputation and administration

- One review per eligible order participant after delivery/completion
- Admin views for users, listings, orders, disputes, reports, and audit logs
- Manual action reasons and immutable administrative audit events

## 7. UX requirements

- Mobile-first layouts with 44px minimum touch targets
- Major navigation: Marketplace, Sell, Collection, Offers, Activity, Profile
- Homepage priority: search, categories, new listings, featured/trending cards, open-to-offers listings
- Progressive disclosure for advanced card attributes
- Accessible labels, keyboard navigation, focus management, contrast, and error summaries
- Seller creation flow may save drafts at every step
- Monetary values always show currency and source-of-truth server totals

## 8. Business rules

- A physical item has one current owner.
- At most one active/reserved listing may exist for an item.
- A seller cannot purchase or offer on their own listing.
- Checkout never trusts price, fee, ownership, or payment success from the browser.
- An accepted offer reserves the listing for the accepting buyer for a bounded checkout window.
- Reviews require a completed eligible order and cannot be duplicated for the same author/order/role.
- Deleting a user does not erase financial, shipment, dispute, or audit records.
- A catalog entry can be corrected or merged without changing historical order snapshots.

## 9. Success measures

- Listing completion rate and median listing time
- Browse-to-detail, detail-to-offer, and detail-to-purchase conversion
- Offer acceptance and checkout completion rates
- Payment and shipping webhook failure rates
- Median time to shipment and delivery
- Dispute and refund rates
- Repeat buyer/seller activity
- Search zero-result rate and catalog-creation rate

## 10. Open product decisions

1. Marketplace fee percentage, fee minimum, and who pays payment/shipping fees
2. Seller payout timing and whether delivery confirmation delays payout
3. Reservation duration after accepted offer
4. Cancellation and refund policy by order stage
5. Domestic-only MVP geography and supported currency
6. Raw-card condition scale and required disclosure fields
7. Minimum photo set and certification-image requirements
8. Catalog moderation: immediate publication, review queue, or trusted-contributor model
9. Review window, edit policy, and moderation policy
10. Dispute intake, evidence requirements, and service-level targets
