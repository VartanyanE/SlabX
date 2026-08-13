import type { RefundRequestInput } from "@slabx/contracts";
import { CatalogError } from "../catalog/service.js";
import type { PaymentProvider } from "../payments/stripe.js";
import { FinancialRepository } from "./repository.js";

export class FinancialService {
  constructor(
    private readonly repository: FinancialRepository,
    private readonly provider: PaymentProvider,
  ) {}
  async request(userId: string, input: RefundRequestInput) {
    const value = await this.repository.requestRefund(userId, input);
    if (!value)
      throw new CatalogError(
        "REFUND_NOT_ELIGIBLE",
        422,
        "The refund exceeds the refundable order balance or the order is not eligible.",
      );
    return value;
  }
  list(userId: string, staff: boolean) {
    return this.repository.list(userId, staff);
  }
  overview() {
    return this.repository.overview();
  }
  sellerSummary(userId: string) {
    return this.repository.sellerSummary(userId);
  }
  async approve(actorId: string, refundId: string) {
    if (!this.provider.createRefund)
      throw new CatalogError(
        "REFUNDS_UNAVAILABLE",
        503,
        "Refund processing is temporarily unavailable.",
      );
    const execution = await this.repository.beginApproval(refundId);
    if (!execution)
      throw new CatalogError(
        "REFUND_STATE_CHANGED",
        409,
        "This refund is no longer eligible for approval.",
      );
    try {
      const refund = await this.provider.createRefund(execution);
      await this.repository.completeRefund(execution, refund.id, actorId);
    } catch (error) {
      await this.repository.failRefund(
        refundId,
        error instanceof Error ? error.message : "Stripe refund failed",
      );
      throw new CatalogError(
        "REFUND_PROVIDER_FAILED",
        502,
        "Stripe could not complete this refund. It is safe to retry.",
      );
    }
  }
  async reject(actorId: string, refundId: string, note: string) {
    if (!(await this.repository.rejectRefund(actorId, refundId, note)))
      throw new CatalogError(
        "REFUND_STATE_CHANGED",
        409,
        "This refund is no longer awaiting a decision.",
      );
  }
}
