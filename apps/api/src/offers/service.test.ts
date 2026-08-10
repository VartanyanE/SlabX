import { describe, expect, it, vi } from "vitest";
import { OfferRepository } from "./repository.js";
import { OfferService } from "./service.js";
describe("OfferService", () => {
  it("maps invalid negotiation amounts to a stable validation error", async () => {
    const repository = {
      create: vi.fn().mockResolvedValue("AMOUNT"),
    } as unknown as OfferRepository;
    await expect(
      new OfferService(repository).create("buyer", "listing", {
        amountMinor: 1000,
        idempotencyKey: "10000000-0000-4000-8000-000000000001",
      }),
    ).rejects.toMatchObject({ code: "OFFER_AMOUNT_INVALID", status: 422 });
  });
  it("enforces the five-offer policy", async () => {
    const repository = {
      counter: vi.fn().mockResolvedValue("LIMIT"),
    } as unknown as OfferRepository;
    await expect(
      new OfferService(repository).counter("buyer", "thread", {
        amountMinor: 1000,
        version: 2,
        idempotencyKey: "10000000-0000-4000-8000-000000000001",
      }),
    ).rejects.toMatchObject({ code: "OFFER_LIMIT_REACHED", status: 409 });
  });
  it("rejects simultaneous or stale acceptance", async () => {
    const repository = {
      resolve: vi.fn().mockResolvedValue(false),
    } as unknown as OfferRepository;
    await expect(
      new OfferService(repository).act(
        "seller",
        "thread",
        { version: 3 },
        "ACCEPTED",
      ),
    ).rejects.toMatchObject({ code: "OFFER_STATE_CHANGED", status: 409 });
  });
});
