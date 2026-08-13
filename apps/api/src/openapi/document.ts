export const openApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "SlabX API",
    version: "0.1.0",
    description:
      "Versioned API contract for the SlabX collectible card marketplace.",
  },
  servers: [{ url: "/api/v1" }],
  paths: {
    "/health/live": {
      get: {
        operationId: "getLiveness",
        summary: "Process liveness",
        responses: { "200": { description: "API process is running" } },
      },
    },
    "/health/ready": {
      get: {
        operationId: "getReadiness",
        summary: "Dependency readiness",
        responses: {
          "200": { description: "API and database are ready" },
          "503": { description: "A required dependency is unavailable" },
        },
      },
    },
    "/auth/register": { post: operation("register", "Create an account", 201) },
    "/auth/email/verify": {
      post: operation("verifyEmail", "Verify an email address", 204),
    },
    "/auth/login": { post: operation("login", "Create a session", 200) },
    "/auth/logout": { post: operation("logout", "Revoke this session", 204) },
    "/auth/logout-all": {
      post: operation("logoutAll", "Revoke every session", 204),
    },
    "/auth/password/forgot": {
      post: operation("forgotPassword", "Request a password reset", 202),
    },
    "/auth/password/reset": {
      post: operation("resetPassword", "Reset a password", 204),
    },
    "/auth/google/start": {
      get: operation("startGoogleLogin", "Begin Google OIDC", 302),
    },
    "/auth/google/callback": {
      get: operation("completeGoogleLogin", "Complete Google OIDC", 302),
    },
    "/me": { get: operation("getMe", "Read the current user", 200) },
    "/me/sessions": {
      get: operation("listSessions", "List active sessions", 200),
    },
    "/me/profile": {
      patch: operation("updateProfile", "Update the current profile", 200),
    },
    "/me/addresses": {
      get: operation("listAddresses", "List saved addresses", 200),
      post: operation("createAddress", "Create a saved address", 201),
    },
    "/me/addresses/{addressId}": {
      parameters: [
        {
          name: "addressId",
          in: "path",
          required: true,
          schema: { type: "string", format: "uuid" },
        },
      ],
      patch: operation("updateAddress", "Update an owned address", 200),
      delete: operation("deleteAddress", "Archive an owned address", 204),
    },
    "/categories": {
      get: operation("listCategories", "List active card categories", 200),
    },
    "/grading-companies": {
      get: operation(
        "listGradingCompanies",
        "List active grading companies",
        200,
      ),
    },
    "/catalog/sets": {
      get: operation("listCardSets", "List canonical card sets", 200),
    },
    "/catalog/cards": {
      get: operation(
        "searchCatalogCards",
        "Search the canonical card catalog",
        200,
      ),
      post: operation(
        "submitCatalogCard",
        "Submit a missing card for review",
        201,
      ),
    },
    "/catalog/cards/{cardId}": {
      parameters: [
        {
          name: "cardId",
          in: "path",
          required: true,
          schema: { type: "string", format: "uuid" },
        },
      ],
      get: operation("getCatalogCard", "Read canonical card details", 200),
    },
    "/me/collection/items": {
      get: operation(
        "listMyCollection",
        "List the current user’s collection",
        200,
      ),
    },
    "/collection/items": {
      post: operation("createCollectionItem", "Add a physical card copy", 201),
    },
    "/collection/items/{itemId}": {
      parameters: [
        {
          name: "itemId",
          in: "path",
          required: true,
          schema: { type: "string", format: "uuid" },
        },
      ],
      get: operation(
        "getCollectionItem",
        "Read an owned or public collection item",
        200,
      ),
      patch: operation(
        "updateCollectionItem",
        "Update an owned collection item",
        200,
      ),
      delete: operation(
        "deleteCollectionItem",
        "Archive an owned collection item",
        204,
      ),
    },
    "/collection/items/{itemId}/media/sign": {
      parameters: [itemIdParameter()],
      post: operation(
        "signCollectionImageUpload",
        "Create an ownership-scoped image upload signature",
        200,
      ),
    },
    "/collection/items/{itemId}/media/confirm": {
      parameters: [itemIdParameter()],
      post: operation(
        "confirmCollectionImageUpload",
        "Verify and attach an uploaded collection image",
        201,
      ),
    },
    "/collection/items/{itemId}/media/order": {
      parameters: [itemIdParameter()],
      put: operation(
        "reorderCollectionImages",
        "Reorder images and select the first as primary",
        200,
      ),
    },
    "/collection/items/{itemId}/media/{mediaId}": {
      parameters: [
        itemIdParameter(),
        {
          name: "mediaId",
          in: "path",
          required: true,
          schema: { type: "string", format: "uuid" },
        },
      ],
      delete: operation(
        "deleteCollectionImage",
        "Remove an owned collection image",
        204,
      ),
    },
    "/listings": {
      get: operation(
        "searchListings",
        "Search active marketplace listings",
        200,
      ),
      post: operation(
        "createListing",
        "Create a listing draft for an owned item",
        201,
      ),
    },
    "/listings/{listingId}": {
      parameters: [listingIdParameter()],
      get: operation("getListing", "Read public listing details", 200),
      patch: operation(
        "updateListing",
        "Update a draft or paused owned listing",
        200,
      ),
      delete: operation("closeListing", "Close an owned listing", 204),
    },
    "/listings/{listingId}/publish": {
      parameters: [listingIdParameter()],
      post: operation("publishListing", "Publish an owned listing", 204),
    },
    "/listings/{listingId}/pause": {
      parameters: [listingIdParameter()],
      post: operation("pauseListing", "Pause an active owned listing", 204),
    },
    "/listings/{listingId}/resume": {
      parameters: [listingIdParameter()],
      post: operation("resumeListing", "Resume a paused owned listing", 204),
    },
    "/me/listings": {
      get: operation(
        "listMyListings",
        "List the current seller's listings",
        200,
      ),
    },
    "/me/watchlist": {
      get: operation(
        "listMyWatchlist",
        "List the current buyer's watched listings",
        200,
      ),
    },
    "/me/watchlist/{listingId}": {
      parameters: [listingIdParameter()],
      put: operation("watchListing", "Watch an active listing", 204),
      delete: operation("unwatchListing", "Remove a watched listing", 204),
    },
    "/listings/{listingId}/offers": {
      parameters: [listingIdParameter()],
      post: operation("createOffer", "Create a buyer offer", 201),
    },
    "/me/offers": {
      get: operation("listMyOffers", "List buyer and seller negotiations", 200),
    },
    "/offers/{threadId}": {
      parameters: [threadIdParameter()],
      get: operation(
        "getOfferThread",
        "Read an immutable negotiation timeline",
        200,
      ),
    },
    "/offers/{threadId}/counter": {
      parameters: [threadIdParameter()],
      post: operation(
        "counterOffer",
        "Counter the current offer revision",
        201,
      ),
    },
    "/offers/{threadId}/accept": {
      parameters: [threadIdParameter()],
      post: operation(
        "acceptOffer",
        "Accept and reserve the listing for checkout",
        204,
      ),
    },
    "/offers/{threadId}/decline": {
      parameters: [threadIdParameter()],
      post: operation(
        "declineOffer",
        "Decline the current offer revision",
        204,
      ),
    },
    "/offers/{threadId}/cancel": {
      parameters: [threadIdParameter()],
      post: operation("cancelOffer", "Cancel a pending buyer offer", 204),
    },
    "/seller/payment-account": {
      get: operation(
        "getSellerPaymentAccount",
        "Read seller onboarding status",
        200,
      ),
    },
    "/seller/payment-account/onboarding": {
      post: operation(
        "startSellerOnboarding",
        "Create a secure Stripe onboarding link",
        201,
      ),
    },
    "/seller/payment-account/refresh": {
      post: operation(
        "refreshSellerPaymentAccount",
        "Refresh seller capability status",
        200,
      ),
    },
    "/checkout": {
      post: operation(
        "createCheckout",
        "Reserve one listing and create Stripe Checkout",
        201,
      ),
    },
    "/payments/stripe/webhook": {
      post: operation(
        "receiveStripeWebhook",
        "Verify and reconcile a Stripe event",
        200,
      ),
    },
    "/me/orders": {
      get: operation("listMyOrders", "List purchases and sales", 200),
    },
    "/orders/{orderId}": {
      parameters: [
        {
          name: "orderId",
          in: "path",
          required: true,
          schema: { type: "string", format: "uuid" },
        },
      ],
      get: operation("getOrder", "Read a buyer or seller order", 200),
    },
    "/shipping/rates": {
      post: operation(
        "getShippingRates",
        "Validate a parcel and quote shipping services",
        200,
      ),
    },
    "/shipping/easypost/webhook": {
      post: operation(
        "receiveEasyPostTrackingWebhook",
        "Verify and reconcile an EasyPost tracking event",
        200,
      ),
    },
    "/orders/{orderId}/shipping-label": {
      parameters: [orderIdParameter()],
      post: operation(
        "purchaseShippingLabel",
        "Purchase an idempotent seller shipping label",
        201,
      ),
    },
    "/orders/{orderId}/shipment": {
      parameters: [orderIdParameter()],
      get: operation(
        "getOrderShipment",
        "Read the buyer and seller tracking timeline",
        200,
      ),
    },
    "/reviews": {
      post: operation(
        "createReview",
        "Create a delivered-transaction review",
        201,
      ),
    },
    "/profiles/{userId}/trust": {
      parameters: [
        {
          name: "userId",
          in: "path",
          required: true,
          schema: { type: "string", format: "uuid" },
        },
      ],
      get: operation(
        "getTrustProfile",
        "Read public verified reputation and reviews",
        200,
      ),
    },
    "/reports": {
      post: operation(
        "createReport",
        "Report marketplace content or conduct",
        201,
      ),
    },
    "/moderation/reports": {
      get: operation(
        "listModerationReports",
        "List reports for moderators",
        200,
      ),
    },
    "/moderation/reports/{reportId}/actions": {
      parameters: [
        {
          name: "reportId",
          in: "path",
          required: true,
          schema: { type: "string", format: "uuid" },
        },
      ],
      post: operation(
        "moderateReport",
        "Record an audited moderator action",
        204,
      ),
    },
    "/refunds": {
      get: operation(
        "listMyRefunds",
        "List refunds for order participants",
        200,
      ),
      post: operation("requestRefund", "Request a bounded buyer refund", 201),
    },
    "/financial/refunds": {
      get: operation("listRefundQueue", "List the staff refund queue", 200),
    },
    "/financial/overview": {
      get: operation(
        "getFinancialOverview",
        "Read staff dispute, hold, and reconciliation metrics",
        200,
      ),
    },
    "/seller/financial-summary": {
      get: operation(
        "getSellerFinancialSummary",
        "Read seller proceeds, holds, and payouts",
        200,
      ),
    },
    "/refunds/{refundId}/decision": {
      parameters: [
        {
          name: "refundId",
          in: "path",
          required: true,
          schema: { type: "string", format: "uuid" },
        },
      ],
      post: operation(
        "decideRefund",
        "Approve or reject a refund request",
        204,
      ),
    },
  },
} as const;

function itemIdParameter() {
  return {
    name: "itemId",
    in: "path",
    required: true,
    schema: { type: "string", format: "uuid" },
  } as const;
}

function listingIdParameter() {
  return {
    name: "listingId",
    in: "path",
    required: true,
    schema: { type: "string", format: "uuid" },
  } as const;
}

function threadIdParameter() {
  return {
    name: "threadId",
    in: "path",
    required: true,
    schema: { type: "string", format: "uuid" },
  } as const;
}

function orderIdParameter() {
  return {
    name: "orderId",
    in: "path",
    required: true,
    schema: { type: "string", format: "uuid" },
  } as const;
}

function operation(operationId: string, summary: string, status: number) {
  return {
    operationId,
    summary,
    responses: { [status]: { description: summary } },
  };
}
