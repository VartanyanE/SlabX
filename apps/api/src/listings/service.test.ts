import { describe, expect, it, vi } from "vitest";
import { ListingRepository } from "./repository.js";
import { ListingService } from "./service.js";

const input = {
  collectionItemId: "40000000-0000-4000-8000-000000000001",
  priceMinor: 2500,
  currency: "USD" as const,
  acceptsOffers: true,
  minimumOfferMinor: 2000,
  conditionDisclosure: "Clean surface with minor corner wear.",
};
describe("ListingService", () => {
  it("requires a verified seller", async () => {
    const repository = {} as ListingRepository;
    await expect(
      new ListingService(repository).create("user", false, input),
    ).rejects.toMatchObject({ code: "SELLER_NOT_VERIFIED", status: 403 });
  });
  it("prevents multiple open listings for one item", async () => {
    const repository = {
      create: vi.fn().mockRejectedValue({ code: "23505" }),
    } as unknown as ListingRepository;
    await expect(
      new ListingService(repository).create("user", true, input),
    ).rejects.toMatchObject({ code: "ITEM_ALREADY_LISTED", status: 409 });
  });
  it("rejects stale listing transitions", async () => {
    const repository = {
      transition: vi.fn().mockResolvedValue(false),
    } as unknown as ListingRepository;
    await expect(
      new ListingService(repository).pause("owner", "listing"),
    ).rejects.toMatchObject({
      code: "LISTING_TRANSITION_INVALID",
      status: 409,
    });
    expect(repository.transition).toHaveBeenCalledWith(
      "owner",
      "listing",
      ["ACTIVE"],
      "PAUSED",
    );
  });
});
