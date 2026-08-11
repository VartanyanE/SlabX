import Stripe from "stripe";

export type ProviderAccount = {
  id: string;
  detailsSubmitted: boolean;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  requirementsCurrentlyDue: string[];
};

export type CheckoutRequest = {
  orderId: string;
  orderNumber: string;
  itemName: string;
  amountMinor: number;
  platformFeeMinor: number;
  currency: "USD";
  connectedAccountId: string;
  successUrl: string;
  cancelUrl: string;
  idempotencyKey: string;
};

export type PaymentEvent = {
  id: string;
  type: string;
  payload: unknown;
  checkout?: {
    id: string;
    orderId: string | null;
    paymentIntentId: string | null;
    paid: boolean;
    amountTotal: number | null;
    currency: string | null;
  };
  account?: ProviderAccount;
};

export interface PaymentProvider {
  createAccount(email: string): Promise<ProviderAccount>;
  retrieveAccount(id: string): Promise<ProviderAccount>;
  createOnboardingLink(
    accountId: string,
    refreshUrl: string,
    returnUrl: string,
  ): Promise<string>;
  createCheckout(
    request: CheckoutRequest,
  ): Promise<{ id: string; url: string }>;
  parseWebhook(payload: Buffer, signature: string): PaymentEvent;
}

export class StripePaymentProvider implements PaymentProvider {
  private readonly stripe: Stripe;
  constructor(
    secretKey: string,
    private readonly webhookSecret: string,
  ) {
    this.stripe = new Stripe(secretKey);
  }

  async createAccount(email: string) {
    return accountShape(
      await this.stripe.accounts.create({
        type: "express",
        country: "US",
        email,
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        business_profile: {
          product_description: "Collectible cards sold on SlabX",
        },
        metadata: { platform: "slabx" },
      }),
    );
  }

  async retrieveAccount(id: string) {
    return accountShape(await this.stripe.accounts.retrieve(id));
  }

  async createOnboardingLink(
    accountId: string,
    refreshUrl: string,
    returnUrl: string,
  ) {
    const link = await this.stripe.accountLinks.create({
      account: accountId,
      refresh_url: refreshUrl,
      return_url: returnUrl,
      type: "account_onboarding",
    });
    return link.url;
  }

  async createCheckout(request: CheckoutRequest) {
    const session = await this.stripe.checkout.sessions.create(
      {
        mode: "payment",
        customer_creation: "always",
        client_reference_id: request.orderId,
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: request.currency.toLowerCase(),
              unit_amount: request.amountMinor,
              product_data: { name: request.itemName },
            },
          },
        ],
        metadata: {
          orderId: request.orderId,
          orderNumber: request.orderNumber,
        },
        payment_intent_data: {
          application_fee_amount: request.platformFeeMinor,
          transfer_data: { destination: request.connectedAccountId },
          metadata: {
            orderId: request.orderId,
            orderNumber: request.orderNumber,
          },
        },
        success_url: request.successUrl,
        cancel_url: request.cancelUrl,
      },
      { idempotencyKey: request.idempotencyKey },
    );
    if (!session.url) throw new Error("Stripe did not return a checkout URL.");
    return { id: session.id, url: session.url };
  }

  parseWebhook(payload: Buffer, signature: string): PaymentEvent {
    const event = this.stripe.webhooks.constructEvent(
      payload,
      signature,
      this.webhookSecret,
    );
    if (
      event.type === "checkout.session.completed" ||
      event.type === "checkout.session.async_payment_succeeded"
    ) {
      const session = event.data.object;
      return {
        id: event.id,
        type: event.type,
        payload: event,
        checkout: {
          id: session.id,
          orderId: session.metadata?.orderId ?? session.client_reference_id,
          paymentIntentId:
            typeof session.payment_intent === "string"
              ? session.payment_intent
              : (session.payment_intent?.id ?? null),
          paid: session.payment_status === "paid",
          amountTotal: session.amount_total,
          currency: session.currency,
        },
      };
    }
    if (event.type === "account.updated") {
      return {
        id: event.id,
        type: event.type,
        payload: event,
        account: accountShape(event.data.object),
      };
    }
    return { id: event.id, type: event.type, payload: event };
  }
}

function accountShape(account: Stripe.Account): ProviderAccount {
  return {
    id: account.id,
    detailsSubmitted: account.details_submitted,
    chargesEnabled: account.charges_enabled,
    payoutsEnabled: account.payouts_enabled,
    requirementsCurrentlyDue: account.requirements?.currently_due ?? [],
  };
}
