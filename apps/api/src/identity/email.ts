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

export class ResendEmailDelivery implements EmailDelivery {
  constructor(
    private readonly options: {
      apiKey: string;
      from: string;
      webOrigin: string;
    },
  ) {}

  sendVerification(email: string, token: string): Promise<void> {
    const url = new URL("/verify-email", this.options.webOrigin);
    url.searchParams.set("token", token);
    return this.send({
      to: email,
      subject: "Verify your SlabX account",
      text: `Welcome to SlabX. Verify your email address by opening this link:\n\n${url.href}\n\nThis link expires in 24 hours.`,
    });
  }

  sendPasswordReset(email: string, token: string): Promise<void> {
    const url = new URL("/reset-password", this.options.webOrigin);
    url.searchParams.set("token", token);
    return this.send({
      to: email,
      subject: "Reset your SlabX password",
      text: `A password reset was requested for your SlabX account. Choose a new password here:\n\n${url.href}\n\nThis link expires in one hour. If you did not request this, you can ignore this email.`,
    });
  }

  private async send(input: {
    to: string;
    subject: string;
    text: string;
  }): Promise<void> {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.options.apiKey}`,
        "Content-Type": "application/json",
        "User-Agent": "SlabX/0.1",
      },
      body: JSON.stringify({ from: this.options.from, ...input }),
    });
    if (!response.ok) {
      throw new Error(`Email provider rejected delivery (${response.status})`);
    }
  }
}
