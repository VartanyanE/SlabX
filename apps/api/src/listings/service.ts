import type {
  ListingInput,
  ListingQuery,
  ListingUpdate,
} from "@slabx/contracts";
import { CatalogError } from "../catalog/service.js";
import { ListingRepository } from "./repository.js";

export class ListingService {
  constructor(private readonly repository: ListingRepository) {}
  search(query: ListingQuery, userId?: string) {
    return this.repository.search(query, userId);
  }
  get(id: string, userId?: string) {
    return this.repository.get(id, userId);
  }
  mine(userId: string) {
    return this.repository.mine(userId);
  }
  watchlist(userId: string) {
    return this.repository.watchlist(userId);
  }
  async create(userId: string, verified: boolean, input: ListingInput) {
    if (!verified)
      throw new CatalogError(
        "SELLER_NOT_VERIFIED",
        403,
        "Verify your email before creating a listing.",
      );
    try {
      const listing = await this.repository.create(userId, input);
      if (!listing)
        throw new CatalogError("NOT_FOUND", 404, "Collection item not found.");
      return listing;
    } catch (error) {
      if (isUnique(error))
        throw new CatalogError(
          "ITEM_ALREADY_LISTED",
          409,
          "This card already has an open listing.",
        );
      throw error;
    }
  }
  async update(userId: string, id: string, input: ListingUpdate) {
    const listing = await this.repository.update(userId, id, input);
    if (!listing)
      throw new CatalogError(
        "STALE_LISTING",
        409,
        "This listing changed. Refresh and try again.",
      );
    return listing;
  }
  async publish(userId: string, id: string) {
    return this.transition(userId, id, ["DRAFT", "PAUSED"], "ACTIVE");
  }
  async pause(userId: string, id: string) {
    return this.transition(userId, id, ["ACTIVE"], "PAUSED");
  }
  async close(userId: string, id: string) {
    return this.transition(userId, id, ["DRAFT", "ACTIVE", "PAUSED"], "CLOSED");
  }
  private async transition(
    userId: string,
    id: string,
    from: string[],
    to: string,
  ) {
    if (!(await this.repository.transition(userId, id, from, to)))
      throw new CatalogError(
        "LISTING_TRANSITION_INVALID",
        409,
        "That listing action is no longer available.",
      );
  }
  async watch(userId: string, id: string) {
    if (!(await this.repository.watch(userId, id)))
      throw new CatalogError("NOT_FOUND", 404, "Active listing not found.");
  }
  unwatch(userId: string, id: string) {
    return this.repository.unwatch(userId, id);
  }
}
function isUnique(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23505"
  );
}
