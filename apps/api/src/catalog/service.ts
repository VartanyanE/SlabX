import { createHash } from "node:crypto";
import type {
  CatalogCardInput,
  CatalogQuery,
  CollectionItemInput,
  CollectionQuery,
} from "@slabx/contracts";
import { CatalogRepository } from "./repository.js";

export class CatalogError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
export class CatalogService {
  constructor(private readonly repository: CatalogRepository) {}
  categories() {
    return this.repository.categories();
  }
  gradingCompanies() {
    return this.repository.gradingCompanies();
  }
  cardSets(categoryId?: string) {
    return this.repository.cardSets(categoryId);
  }
  searchCards(query: CatalogQuery) {
    return this.repository.searchCards(query);
  }
  getCard(id: string) {
    return this.repository.getCard(id);
  }
  async createCard(userId: string, input: CatalogCardInput) {
    const fingerprint = createHash("sha256")
      .update(
        [
          input.categoryId,
          input.cardSetId,
          input.year,
          input.cardNumber,
          input.playerOrCharacter,
          input.variant ?? "",
        ]
          .map((value) => String(value).trim().toLowerCase())
          .join("|"),
      )
      .digest("hex");
    try {
      return await this.repository.createCard(userId, input, fingerprint);
    } catch (error) {
      if (isUnique(error))
        throw new CatalogError(
          "CATALOG_DUPLICATE",
          409,
          "This card already exists in the catalog.",
        );
      throw error;
    }
  }
  async createItem(userId: string, input: CollectionItemInput) {
    try {
      return await this.repository.createItem(userId, input);
    } catch (error) {
      if (isUnique(error))
        throw new CatalogError(
          "CERTIFICATION_CONFLICT",
          409,
          "That grading certification is already attached to a collection item.",
        );
      throw error;
    }
  }
  listItems(userId: string, query: CollectionQuery) {
    return this.repository.listItems(userId, query);
  }
  getItem(id: string, userId?: string) {
    return this.repository.getItem(id, userId);
  }
  async updateItem(userId: string, id: string, input: CollectionItemInput) {
    try {
      return await this.repository.updateItem(userId, id, input);
    } catch (error) {
      if (isUnique(error))
        throw new CatalogError(
          "CERTIFICATION_CONFLICT",
          409,
          "That grading certification is already attached to a collection item.",
        );
      throw error;
    }
  }
  deleteItem(userId: string, id: string) {
    return this.repository.deleteItem(userId, id);
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
