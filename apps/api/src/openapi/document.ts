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
  },
} as const;

function operation(operationId: string, summary: string, status: number) {
  return {
    operationId,
    summary,
    responses: { [status]: { description: summary } },
  };
}
