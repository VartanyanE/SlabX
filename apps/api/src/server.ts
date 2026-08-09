import { resolve } from "node:path";
import { config as loadDotenv } from "dotenv";
import { loadServerEnvironment } from "@slabx/config";
import { createDatabaseHealthCheck } from "@slabx/database";
import { createLogger } from "@slabx/observability";
import { createApp } from "./app.js";

loadDotenv({ path: resolve(process.cwd(), "../../.env"), quiet: true });
const environment = loadServerEnvironment(process.env);
const logger = createLogger("slabx-api", environment.LOG_LEVEL);
const app = createApp({
  databaseHealthCheck: createDatabaseHealthCheck(environment.DATABASE_URL),
  logger,
  webOrigin: environment.WEB_ORIGIN,
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
