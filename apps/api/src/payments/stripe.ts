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
  dispute?: {
    id: string;
    paymentIntentId: string | null;
    chargeId: string;
    amountMinor: number;
    currency: string;
    reason: string;
    status:
      | "WARNING_NEEDS_RESPONSE"
      | "WARNING_UNDER_REVIEW"
      | "NEEDS_RESPONSE"
      | "UNDER_REVIEW"
      | "WON"
      | "LOST";
    evidenceDueAt: Date | null;
  };
  transfer?: {
    id: string;
    paymentIntentId: string;
    amountMinor: number;
    currency: string;
    orderId: string | null;
  };
  payout?: {
    id: string;
    connectedAccountId: string;
    amountMinor: number;
    currency: string;
    status: "PENDING" | "IN_TRANSIT" | "PAID" | "FAILED" | "CANCELED";
    arrivalAt: Date | null;
    failureCode: string | null;
    failureMessage: string | null;
  };
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
  createRefund?(request: {
    paymentIntentId: string;
    amountMinor: number;
    idempotencyKey: string;
  }): Promise<{ id: string; status: string }>;
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
    if (
      event.type === "charge.dispute.created" ||
      event.type === "charge.dispute.updated" ||
      event.type === "charge.dispute.closed"
    ) {
      const dispute = event.data.object;
      return {
        id: event.id,
        type: event.type,
        payload: event,
        dispute: {
          id: dispute.id,
          paymentIntentId:
            typeof dispute.payment_intent === "string"
              ? dispute.payment_intent
              : (dispute.payment_intent?.id ?? null),
          chargeId:
            typeof dispute.charge === "string"
              ? dispute.charge
              : dispute.charge.id,
          amountMinor: dispute.amount,
          currency: dispute.currency.toUpperCase(),
          reason: dispute.reason,
          status: dispute.status.toUpperCase() as NonNullable<
            PaymentEvent["dispute"]
          >["status"],
          evidenceDueAt: dispute.evidence_details.due_by
            ? new Date(dispute.evidence_details.due_by * 1000)
            : null,
        },
      };
    }
    if (event.type === "charge.succeeded") {
      const charge = event.data.object;
      const transferId =
        typeof charge.transfer === "string"
          ? charge.transfer
          : charge.transfer?.id;
      const paymentIntentId =
        typeof charge.payment_intent === "string"
          ? charge.payment_intent
          : charge.payment_intent?.id;
      if (transferId && paymentIntentId)
        return {
          id: event.id,
          type: event.type,
          payload: event,
          transfer: {
            id: transferId,
            paymentIntentId,
            amountMinor: charge.amount - (charge.application_fee_amount ?? 0),
            currency: charge.currency.toUpperCase(),
            orderId: charge.metadata.orderId ?? null,
          },
        };
    }
    if (
      [
        "payout.created",
        "payout.updated",
        "payout.paid",
        "payout.failed",
        "payout.canceled",
      ].includes(event.type)
    ) {
      const payout = event.data.object as Stripe.Payout;
      const connectedAccountId =
        typeof event.account === "string" ? event.account : null;
      if (connectedAccountId)
        return {
          id: event.id,
          type: event.type,
          payload: event,
          payout: {
            id: payout.id,
            connectedAccountId,
            amountMinor: payout.amount,
            currency: payout.currency.toUpperCase(),
            status: payout.status.toUpperCase() as NonNullable<
              PaymentEvent["payout"]
            >["status"],
            arrivalAt: payout.arrival_date
              ? new Date(payout.arrival_date * 1000)
              : null,
            failureCode: payout.failure_code ?? null,
            failureMessage: payout.failure_message ?? null,
          },
        };
    }
    return { id: event.id, type: event.type, payload: event };
  }

  async createRefund(request: {
    paymentIntentId: string;
    amountMinor: number;
    idempotencyKey: string;
  }) {
    const refund = await this.stripe.refunds.create(
      {
        payment_intent: request.paymentIntentId,
        amount: request.amountMinor,
        reverse_transfer: true,
        refund_application_fee: true,
        metadata: { platform: "slabx" },
      },
      { idempotencyKey: request.idempotencyKey },
    );
    return { id: refund.id, status: refund.status ?? "pending" };
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
