import { resolve } from "node:path";
import { config as loadDotenv } from "dotenv";
import { loadServerEnvironment } from "@slabx/config";
import { createDatabaseHealthCheck, createDatabasePool } from "@slabx/database";
import { createLogger } from "@slabx/observability";
import { createApp } from "./app.js";
import { CatalogRepository } from "./catalog/repository.js";
import { createCatalogRouter } from "./catalog/routes.js";
import { CatalogService } from "./catalog/service.js";
import { PendingEmailDelivery, ResendEmailDelivery } from "./identity/email.js";
import { GoogleOidc } from "./identity/google.js";
import { PostgresIdentityRepository } from "./identity/postgres-repository.js";
import { createIdentityRouter } from "./identity/routes.js";
import { IdentityService } from "./identity/service.js";
import { CloudinaryProvider } from "./media/cloudinary.js";
import { MediaRepository } from "./media/repository.js";
import { MediaService } from "./media/service.js";
import { ListingRepository } from "./listings/repository.js";
import { createListingRouter } from "./listings/routes.js";
import { ListingService } from "./listings/service.js";

loadDotenv({ path: resolve(process.cwd(), "../../.env"), quiet: true });
const environment = loadServerEnvironment(process.env);
const logger = createLogger("slabx-api", environment.LOG_LEVEL);
const databasePool = createDatabasePool(environment.DATABASE_URL);
const identityService = new IdentityService({
  repository: new PostgresIdentityRepository(databasePool),
  email: environment.EMAIL_PROVIDER_API_KEY
    ? new ResendEmailDelivery({
        apiKey: environment.EMAIL_PROVIDER_API_KEY,
        from: environment.EMAIL_FROM,
        webOrigin: environment.WEB_ORIGIN,
      })
    : new PendingEmailDelivery(logger),
  secret: environment.SESSION_SECRET,
  passwordPepper: environment.PASSWORD_PEPPER,
});
const identityRouter = createIdentityRouter({
  service: identityService,
  google: new GoogleOidc({
    ...(environment.GOOGLE_CLIENT_ID
      ? { clientId: environment.GOOGLE_CLIENT_ID }
      : {}),
    ...(environment.GOOGLE_CLIENT_SECRET
      ? { clientSecret: environment.GOOGLE_CLIENT_SECRET }
      : {}),
    callbackUrl: environment.GOOGLE_CALLBACK_URL,
    secret: environment.SESSION_SECRET,
  }),
  secureCookies: environment.NODE_ENV === "production",
  webOrigin: environment.WEB_ORIGIN,
});
const catalogRouter = createCatalogRouter({
  service: new CatalogService(new CatalogRepository(databasePool)),
  identity: identityService,
  ...(environment.CLOUDINARY_CLOUD_NAME &&
  environment.CLOUDINARY_API_KEY &&
  environment.CLOUDINARY_API_SECRET
    ? {
        media: new MediaService(
          new MediaRepository(databasePool),
          new CloudinaryProvider(
            environment.CLOUDINARY_CLOUD_NAME,
            environment.CLOUDINARY_API_KEY,
            environment.CLOUDINARY_API_SECRET,
          ),
        ),
      }
    : {}),
});
const app = createApp({
  databaseHealthCheck: createDatabaseHealthCheck(environment.DATABASE_URL),
  logger,
  webOrigin: environment.WEB_ORIGIN,
  identityRouter,
  catalogRouter,
  listingRouter: createListingRouter({
    service: new ListingService(new ListingRepository(databasePool)),
    identity: identityService,
  }),
});

const server = app.listen(environment.API_PORT, () => {
  logger.info({ port: environment.API_PORT }, "SlabX API listening");
});

function shutdown(signal: string) {
  logger.info({ signal }, "Graceful shutdown started");
  server.close((error) => {
    if (error) {
      logger.error({ err: error }, "Graceful shutdown failed");
      process.exitCode = 1;
    }
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
