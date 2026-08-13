import { describe, expect, it } from "vitest";
import { MockShippingProvider } from "./provider.js";

const parcel = {
  lengthInches: 8,
  widthInches: 6,
  heightInches: 1,
  weightOunces: 8,
};

describe("MockShippingProvider", () => {
  it("quotes faster and slower trackable services", async () => {
    const rates = await new MockShippingProvider().rates(parcel);
    expect(rates).toHaveLength(2);
    expect(rates[0]).toMatchObject({ carrier: "USPS", amountMinor: 499 });
    expect(rates[1]!.estimatedDays).toBeLessThan(rates[0]!.estimatedDays);
  });

  it("returns the same provider identifiers for an idempotency key", async () => {
    const provider = new MockShippingProvider();
    const rate = (await provider.rates(parcel))[0]!;
    const key = "754c733c-e8b8-4337-a36e-24ab565b828c";
    expect(await provider.buy(rate, key)).toEqual(
      await provider.buy(rate, key),
    );
  });
});
