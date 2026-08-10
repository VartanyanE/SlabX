import type { OfferAction, OfferCounter, OfferCreate } from "@slabx/contracts";
import { CatalogError } from "../catalog/service.js";
import { OfferRepository } from "./repository.js";

export class OfferService {
  constructor(private readonly repository: OfferRepository) {}
  list(userId: string) {
    return this.repository.list(userId);
  }
  get(userId: string, id: string) {
    return this.repository.get(id, userId);
  }
  async create(userId: string, listingId: string, input: OfferCreate) {
    return this.result(await this.repository.create(userId, listingId, input));
  }
  async counter(userId: string, threadId: string, input: OfferCounter) {
    return this.result(await this.repository.counter(userId, threadId, input));
  }
  async act(
    userId: string,
    threadId: string,
    input: OfferAction,
    action: "ACCEPTED" | "DECLINED" | "CANCELLED",
  ) {
    if (
      !(await this.repository.resolve(userId, threadId, input.version, action))
    )
      throw new CatalogError(
        "OFFER_STATE_CHANGED",
        409,
        "This offer changed or expired. Refresh and try again.",
      );
  }
  private result(value: unknown) {
    if (value === "AMOUNT")
      throw new CatalogError(
        "OFFER_AMOUNT_INVALID",
        422,
        "Offer must be below the listing price, above the seller minimum, and move toward agreement.",
      );
    if (value === "LIMIT")
      throw new CatalogError(
        "OFFER_LIMIT_REACHED",
        409,
        "You can send up to five offers for this listing.",
      );
    if (!value)
      throw new CatalogError(
        "OFFER_UNAVAILABLE",
        409,
        "This listing or offer is no longer available.",
      );
    return value;
  }
}
