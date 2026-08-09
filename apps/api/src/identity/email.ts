import type { Logger } from "pino";
import type { EmailDelivery } from "./types.js";

export class PendingEmailDelivery implements EmailDelivery {
  constructor(private readonly logger: Logger) {}
  async sendVerification(email: string, token: string): Promise<void> {
    void email;
    void token;
    this.logger.info(
      { template: "email-verification" },
      "Email delivery queued; configure a provider before staging",
    );
  }
  async sendPasswordReset(email: string, token: string): Promise<void> {
    void email;
    void token;
    this.logger.info(
      { template: "password-reset" },
      "Email delivery queued; configure a provider before staging",
    );
  }
}
