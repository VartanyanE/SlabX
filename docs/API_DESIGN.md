# REST API Design

## 1. Conventions

- Base path: `/api/v1`
- JSON request/response bodies; UTF-8
- Resource IDs are opaque UUID strings
- Authentication uses an HttpOnly session cookie
- Mutations require CSRF protection and `Content-Type: application/json`
- Currency fields use integer minor units and ISO codes: `{ "amount": 12500, "currency": "USD" }`
- Timestamps are ISO 8601 UTC
- Collection responses use cursor pagination, never unbounded arrays
- Validation schemas live in the shared contracts package
- API responses never expose password hashes, provider secrets, raw session tokens, internal risk flags, or unnecessary PII

## 2. Response envelope

Single resource:

```json
{ "data": { "id": "..." }, "meta": { "requestId": "..." } }
```

Collection:

```json
{
  "data": [],
  "meta": { "requestId": "...", "nextCursor": "..." }
}
```

Error:

```json
{
  "error": {
    "code": "LISTING_NOT_AVAILABLE",
    "message": "This listing is no longer available.",
    "fields": {},
    "requestId": "..."
  }
}
```

Expected status codes: `200`, `201`, `202`, `204`, `400`, `401`, `403`, `404`, `409`, `412`, `422`, `429`, and `500`. Avoid leaking whether protected resources exist: unauthorized access may return `404`.

## 3. Concurrency and idempotency

- Payment, order, refund, label-purchase, and trade-acceptance mutations require `Idempotency-Key`.
- The server stores `(actor, operation, key, request_hash, response/status)` and rejects reuse with a different payload.
- Mutable resources expose a `version`/ETag; sensitive updates require `If-Match` and return `412` on stale versions.
- Listing purchase/offer acceptance performs row locking and returns `409 LISTING_NOT_AVAILABLE` for losers in a race.

## 4. Authentication and profile

| Method | Endpoint | Purpose |
| --- | --- | --- |
| POST | `/auth/register` | Create email/password account |
| POST | `/auth/email/verify` | Consume verification token |
| POST | `/auth/login` | Create session and rotate CSRF token |
| POST | `/auth/logout` | Revoke current session |
| POST | `/auth/logout-all` | Revoke all user sessions |
| POST | `/auth/password/forgot` | Request reset without account enumeration |
| POST | `/auth/password/reset` | Consume reset and revoke sessions |
| GET | `/auth/google/start` | Begin OIDC with state/nonce/PKCE |
| GET | `/auth/google/callback` | Validate callback and create/link identity |
| GET | `/me` | Current account/profile summary |
| PATCH | `/me/profile` | Update profile |
| GET/POST | `/me/addresses` | List/create address |
| PATCH/DELETE | `/me/addresses/:addressId` | Update/archive address |
| GET | `/profiles/:handle` | Public seller/collector profile |

Account linking requires recent authentication and verified provider claims; never link solely by an unverified matching email.

## 5. Catalog and collection

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/categories` | Active category tree and attribute metadata |
| GET | `/grading-companies` | Active graders and scales |
| GET | `/catalog/cards` | Search/filter canonical cards |
| GET | `/catalog/cards/:cardId` | Canonical card detail |
| POST | `/catalog/cards` | Submit missing catalog entry |
| POST | `/collection/items` | Create owned physical item |
| GET | `/me/collection/items` | Owner collection with filters |
| GET | `/collection/items/:itemId` | Authorized/public item detail |
| PATCH | `/collection/items/:itemId` | Update owner-controlled details |
| DELETE | `/collection/items/:itemId` | Soft-delete eligible item |
| POST | `/media/upload-signatures` | Short-lived signed upload parameters |
| POST | `/collection/items/:itemId/images` | Attach validated uploaded asset |
| PATCH | `/collection/items/:itemId/images/order` | Reorder/set primary |
| DELETE | `/collection/items/:itemId/images/:imageId` | Detach eligible image |

Users cannot mutate grading/certification fields while an item is reserved or sold. Certification collision returns a reviewable conflict.

## 6. Listings and search

| Method | Endpoint | Purpose |
| --- | --- | --- |
| POST | `/listings` | Create draft listing for owned item |
| GET | `/listings` | Browse/search/filter active listings |
| GET | `/listings/:listingId` | Public detail and seller summary |
| PATCH | `/listings/:listingId` | Update eligible draft/paused listing |
| POST | `/listings/:listingId/publish` | Validate and activate |
| POST | `/listings/:listingId/pause` | Pause active listing |
| POST | `/listings/:listingId/resume` | Resume eligible listing |
| DELETE | `/listings/:listingId` | Cancel eligible listing |
| GET | `/me/listings` | Seller listing dashboard |
| PUT | `/me/watchlist/:listingId` | Add watchlist entry idempotently |
| DELETE | `/me/watchlist/:listingId` | Remove watchlist entry |
| GET | `/me/watchlist` | List watched active/historical entries |

Example filters: `category`, `sportOrGame`, `player`, `yearFrom`, `yearTo`, `manufacturer`, `set`, `graded`, `gradingCompany`, `gradeMin`, `priceMin`, `priceMax`, `rookie`, `autograph`, `memorabilia`, `acceptsOffers`, `sort`, and `cursor`.

## 7. Offers

| Method | Endpoint | Purpose |
| --- | --- | --- |
| POST | `/listings/:listingId/offers` | Create buyer offer |
| GET | `/offers/:threadId` | Authorized offer thread |
| GET | `/me/offers` | Sent/received offers by status |
| POST | `/offers/:threadId/accept` | Recipient accepts current revision |
| POST | `/offers/:threadId/decline` | Recipient declines current revision |
| POST | `/offers/:threadId/counter` | Recipient creates next revision |
| POST | `/offers/:threadId/cancel` | Sender cancels current pending revision |

Accept returns a reservation and checkout deadline. It does not claim payment succeeded.

## 8. Checkout, orders, and payments

| Method | Endpoint | Purpose |
| --- | --- | --- |
| POST | `/checkout/listings/:listingId` | Reserve listing and create pending order |
| POST | `/checkout/offers/:threadId` | Create order from accepted offer |
| POST | `/orders/:orderId/payment-session` | Create/reuse Stripe operation |
| GET | `/orders/:orderId` | Authorized order detail/timeline |
| GET | `/me/orders` | Purchases or sales filtered by role/status |
| POST | `/orders/:orderId/cancel` | Policy-controlled cancellation request |
| POST | `/orders/:orderId/refunds` | Authorized/admin refund request |
| POST | `/seller/connect/onboarding-link` | Create Stripe Express onboarding link |
| GET | `/seller/connect/status` | Seller payout-readiness status |
| POST | `/webhooks/stripe` | Raw-body verified Stripe events |

The payment-session endpoint receives only `orderId` and presentation metadata; it recalculates/reads authoritative totals from the order. Return URLs are UX only.

## 9. Shipping

| Method | Endpoint | Purpose |
| --- | --- | --- |
| POST | `/orders/:orderId/shipping/rates` | Validate addresses and obtain rates |
| POST | `/orders/:orderId/shipping/label` | Buy selected rate idempotently |
| GET | `/orders/:orderId/shipment` | Authorized shipment and timeline |
| POST | `/webhooks/easypost` | Verified/allowlisted tracking events |

Rate IDs are server-bound to order/address/package snapshots and expire. Clients cannot submit arbitrary label prices.

## 10. Reviews, reports, notifications

| Method | Endpoint | Purpose |
| --- | --- | --- |
| POST | `/orders/:orderId/reviews` | Create eligible review |
| GET | `/profiles/:handle/reviews` | Paginated public reviews |
| POST | `/reports` | Report user/listing/review/order concern |
| GET | `/me/notifications` | Paginated notification feed |
| POST | `/me/notifications/:id/read` | Mark read idempotently |
| POST | `/me/notifications/read-all` | Mark current feed read |

## 11. Administration

Admin routes use explicit permissions, mandatory reason fields for consequential actions, step-up authentication, and audit logs.

```text
GET  /admin/users
GET  /admin/users/:id
POST /admin/users/:id/suspend
POST /admin/users/:id/restore
GET  /admin/listings
POST /admin/listings/:id/remove
GET  /admin/orders/:id
GET  /admin/disputes
POST /admin/disputes/:id/assign
POST /admin/disputes/:id/resolve
GET  /admin/reports
GET  /admin/audit-logs
GET  /admin/webhooks/failures
POST /admin/webhooks/:id/replay
```

## 12. Future trading API

Reserved design:

```text
POST /trades
GET  /trades/:threadId
POST /trades/:threadId/counter
POST /trades/:threadId/accept
POST /trades/:threadId/decline
POST /trades/:threadId/cancel
POST /trades/:threadId/payment-session
```

Every revision identifies both sides' item components and optional cash direction. Accept performs atomic ownership/availability checks and locks; final transfer waits for required payment and shipping completion rules.

## 13. API documentation and compatibility

- Generate OpenAPI 3.1 from Zod contracts and publish it in CI.
- Additive response fields are compatible; clients ignore unknown fields.
- Never silently change enum meaning or money units.
- Deprecations include headers, migration notes, telemetry, and a removal date.
- Webhooks have internal versioned normalized handlers even when providers evolve payloads.
