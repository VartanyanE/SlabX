import { randomUUID } from "node:crypto";
import type { CheckoutCreate, ConnectedAccount } from "@slabx/contracts";
import { CatalogError } from "../catalog/service.js";
import { PaymentRepository } from "./repository.js";
import type { PaymentProvider } from "./stripe.js";

export class PaymentService {
  constructor(
    private readonly repository: PaymentRepository,
    private readonly provider: PaymentProvider,
    private readonly webOrigin: string,
  ) {}

  async account(userId: string): Promise<ConnectedAccount> {
    const account = await this.repository.connectedAccount(userId);
    if (!account) return emptyAccount;
    return publicAccount(account);
  }

  async onboarding(userId: string, email: string) {
    let stored = await this.repository.connectedAccount(userId);
    if (!stored?.providerAccountId) {
      const created = await this.provider.createAccount(email);
      stored = await this.repository.saveConnectedAccount(userId, created);
    } else {
      const refreshed = await this.provider.retrieveAccount(
        stored.providerAccountId,
      );
      stored = await this.repository.saveConnectedAccount(userId, refreshed);
    }
    if (!stored?.providerAccountId)
      throw new Error("Connected account was not saved.");
    const url = await this.provider.createOnboardingLink(
      stored.providerAccountId,
      `${this.webOrigin}/seller/onboarding?refresh=1`,
      `${this.webOrigin}/seller/onboarding?returned=1`,
    );
    return { url, account: publicAccount(stored) };
  }

  async refreshAccount(userId: string) {
    const stored = await this.repository.connectedAccount(userId);
    if (!stored?.providerAccountId) return emptyAccount;
    return publicAccount(
      (await this.repository.saveConnectedAccount(
        userId,
        await this.provider.retrieveAccount(stored.providerAccountId),
      )) ?? emptyAccount,
    );
  }

  async checkout(userId: string, input: CheckoutCreate) {
    const orderNumber = `SX-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${randomUUID().slice(0, 8).toUpperCase()}`;
    const draft = await this.repository.beginCheckout(
      userId,
      input,
      orderNumber,
    );
    if (draft === "ADDRESS")
      throw new CatalogError(
        "ADDRESS_REQUIRED",
        422,
        "Choose a valid U.S. shipping address.",
      );
    if (draft === "SELLER_NOT_READY")
      throw new CatalogError(
        "SELLER_NOT_READY",
        409,
        "This seller has not completed payment onboarding.",
      );
    if (draft === "NOT_AVAILABLE")
      throw new CatalogError(
        "LISTING_NOT_AVAILABLE",
        409,
        "This card is no longer available for checkout.",
      );
    try {
      const session = await this.provider.createCheckout({
        orderId: draft.orderId,
        orderNumber: draft.orderNumber,
        itemName: draft.itemName,
        amountMinor: draft.amountMinor,
        platformFeeMinor: draft.platformFeeMinor,
        currency: draft.currency,
        connectedAccountId: draft.providerAccountId,
        successUrl: `${this.webOrigin}/checkout/return?order=${draft.orderId}`,
        cancelUrl: `${this.webOrigin}/checkout/return?order=${draft.orderId}&cancelled=1`,
        idempotencyKey: draft.idempotencyKey,
      });
      await this.repository.attachCheckout(draft.orderId, session.id);
      const order = await this.repository.order(draft.orderId, userId);
      if (!order)
        throw new Error("Order was not found after checkout creation.");
      return { order, checkoutUrl: session.url };
    } catch (error) {
      await this.repository.failCheckout(
        draft.orderId,
        error instanceof Error ? error.message : "Payment provider error",
      );
      throw error;
    }
  }

  orders(userId: string) {
    return this.repository.orders(userId);
  }
  order(userId: string, orderId: string) {
    return this.repository.order(orderId, userId);
  }
  webhook(payload: Buffer, signature: string) {
    return this.repository.processEvent(
      this.provider.parseWebhook(payload, signature),
    );
  }
}

const emptyAccount: ConnectedAccount = {
  status: "NOT_STARTED",
  detailsSubmitted: false,
  chargesEnabled: false,
  payoutsEnabled: false,
  requirementsCurrentlyDue: [],
};
function publicAccount(account: ConnectedAccount): ConnectedAccount {
  return {
    status: account.status,
    detailsSubmitted: account.detailsSubmitted,
    chargesEnabled: account.chargesEnabled,
    payoutsEnabled: account.payoutsEnabled,
    requirementsCurrentlyDue: account.requirementsCurrentlyDue,
  };
}
