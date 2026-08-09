import { createLogger } from "@slabx/observability";

const logger = createLogger("slabx-worker", process.env.LOG_LEVEL ?? "info");
logger.info(
  "Worker foundation ready; durable jobs will be enabled when the first asynchronous workflow is introduced.",
);
