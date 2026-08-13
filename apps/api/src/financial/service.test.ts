import { describe, expect, it, vi } from "vitest";
import { FinancialService } from "./service.js";
import type { FinancialRepository } from "./repository.js";
import type { PaymentProvider } from "../payments/stripe.js";

describe("FinancialService", () => {
  it("rejects refund amounts outside the refundable balance", async () => {
    const repository = {
      requestRefund: vi.fn().mockResolvedValue(null),
    } as unknown as FinancialRepository;
    const service = new FinancialService(repository, {} as PaymentProvider);
    await expect(
      service.request("buyer", {
        orderId: "00000000-0000-4000-8000-000000000001",
        amountMinor: 100,
        reasonCode: "OTHER",
        details: "A sufficiently detailed reason",
        idempotencyKey: "00000000-0000-4000-8000-000000000002",
      }),
    ).rejects.toMatchObject({ code: "REFUND_NOT_ELIGIBLE" });
  });
  it("records a provider failure and leaves the refund retryable", async () => {
    const execution = {
      refundId: "r",
      orderId: "o",
      amountMinor: 100,
      currency: "USD",
      paymentIntentId: "pi",
      idempotencyKey: "00000000-0000-4000-8000-000000000002",
      subtotalMinor: 100,
      platformFeeMinor: 8,
    };
    const repository = {
      beginApproval: vi.fn().mockResolvedValue(execution),
      failRefund: vi.fn(),
    } as unknown as FinancialRepository;
    const provider = {
      createRefund: vi.fn().mockRejectedValue(new Error("down")),
    } as unknown as PaymentProvider;
    await expect(
      new FinancialService(repository, provider).approve("staff", "r"),
    ).rejects.toMatchObject({ code: "REFUND_PROVIDER_FAILED" });
    expect(repository.failRefund).toHaveBeenCalledWith("r", "down");
  });
});
