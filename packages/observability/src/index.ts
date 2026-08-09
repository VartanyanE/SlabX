import pino, { type Logger } from "pino";

export function createLogger(service: string, level = "info"): Logger {
  return pino({
    name: service,
    level,
    base: { service },
    redact: {
      paths: [
        "req.headers.authorization",
        "req.headers.cookie",
        "*.password",
        "*.token",
        "*.secret",
      ],
      censor: "[Redacted]",
    },
  });
}
