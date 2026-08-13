import { describe, expect, it, vi } from "vitest";
import { TrustService } from "./service.js";
import type { TrustRepository } from "./repository.js";

const input = { orderId: "00000000-0000-4000-8000-000000000001", rating: 5 };

describe("TrustService review eligibility", () => {
  it("rejects users who are not participants in a delivered order", async () => {
    const repository = {
      createReview: vi.fn().mockResolvedValue(null),
    } as unknown as TrustRepository;
    await expect(
      new TrustService(repository).review("outsider", input),
    ).rejects.toMatchObject({ code: "REVIEW_NOT_ELIGIBLE", status: 403 });
  });

  it("rejects a second review for the same participant and order", async () => {
    const repository = {
      createReview: vi.fn().mockResolvedValue("DUPLICATE"),
    } as unknown as TrustRepository;
    await expect(
      new TrustService(repository).review("buyer", input),
    ).rejects.toMatchObject({ code: "REVIEW_ALREADY_EXISTS", status: 409 });
  });
});
