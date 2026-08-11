import { describe, expect, it, vi } from "vitest";
import { ledgerAmounts, marketplaceFeeMinor } from "./repository.js";
import { PaymentService } from "./service.js";
import type { PaymentProvider } from "./stripe.js";

describe("payment policy", () => {
  it("calculates the seller-paid fee in integer minor units", () => {
    expect(marketplaceFeeMinor(10_00)).toBe(80);
    expect(marketplaceFeeMinor(10_05)).toBe(80);
    expect(marketplaceFeeMinor(10_07)).toBe(81);
  });

  it("creates balanced purchase ledger amounts", () => {
    const amounts = ledgerAmounts(12_500, marketplaceFeeMinor(12_500));
    expect(amounts).toEqual([12_500, -11_500, -1_000]);
    expect(amounts.reduce((sum, amount) => sum + amount, 0)).toBe(0);
  });
});

describe("PaymentService", () => {
  it("creates a provider checkout from the server-side order snapshot", async () => {
    const repository = {
      beginCheckout: vi.fn().mockResolvedValue({
        orderId: "order-1",
        orderNumber: "SX-1",
        itemName: "Shohei Ohtani",
        amountMinor: 10_000,
        platformFeeMinor: 800,
        currency: "USD",
        providerAccountId: "acct_1",
        idempotencyKey: "key-1",
      }),
      attachCheckout: vi.fn(),
      failCheckout: vi.fn(),
      order: vi.fn().mockResolvedValue({ id: "order-1" }),
    };
    const provider = {
      createCheckout: vi.fn().mockResolvedValue({
        id: "cs_test_1",
        url: "https://checkout.stripe.test/1",
      }),
    };
    const service = new PaymentService(
      repository as never,
      provider as never,
      "http://localhost:5173",
    );
    const result = await service.checkout("buyer-1", {
      listingId: "00000000-0000-4000-8000-000000000001",
      shippingAddressId: "00000000-0000-4000-8000-000000000002",
      idempotencyKey: "00000000-0000-4000-8000-000000000003",
    });
    expect(provider.createCheckout).toHaveBeenCalledWith(
      expect.objectContaining({
        amountMinor: 10_000,
        platformFeeMinor: 800,
        connectedAccountId: "acct_1",
      }),
    );
    expect(repository.attachCheckout).toHaveBeenCalledWith(
      "order-1",
      "cs_test_1",
    );
    expect(result.checkoutUrl).toContain("stripe.test");
  });

  it("marks the attempt failed when Stripe checkout creation fails", async () => {
    const repository = {
      beginCheckout: vi.fn().mockResolvedValue({
        orderId: "order-2",
        orderNumber: "SX-2",
        itemName: "Card",
        amountMinor: 1000,
        platformFeeMinor: 80,
        currency: "USD",
        providerAccountId: "acct_2",
        idempotencyKey: "key-2",
      }),
      failCheckout: vi.fn(),
    };
    const provider = {
      createCheckout: vi
        .fn()
        .mockRejectedValue(new Error("Stripe unavailable")),
    };
    const service = new PaymentService(
      repository as never,
      provider as unknown as PaymentProvider,
      "http://localhost:5173",
    );
    await expect(
      service.checkout("buyer-1", {
        listingId: "00000000-0000-4000-8000-000000000001",
        shippingAddressId: "00000000-0000-4000-8000-000000000002",
        idempotencyKey: "00000000-0000-4000-8000-000000000003",
      }),
    ).rejects.toThrow("Stripe unavailable");
    expect(repository.failCheckout).toHaveBeenCalledWith(
      "order-2",
      "Stripe unavailable",
    );
  });
});
