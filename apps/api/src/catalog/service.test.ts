import { describe, expect, it, vi } from "vitest";
import type { CollectionItemInput } from "@slabx/contracts";
import { CatalogRepository } from "./repository.js";
import { CatalogService } from "./service.js";

describe("CatalogService", () => {
  it("turns duplicate canonical cards into a stable conflict", async () => {
    const repository = {
      createCard: vi.fn().mockRejectedValue({ code: "23505" }),
    } as unknown as CatalogRepository;
    const service = new CatalogService(repository);
    await expect(
      service.createCard("user-1", {
        categoryId: "10000000-0000-4000-8000-000000000001",
        cardSetId: "30000000-0000-4000-8000-000000000001",
        playerOrCharacter: "Victor Wembanyama",
        year: 2023,
        cardNumber: "136",
        isRookie: true,
      }),
    ).rejects.toMatchObject({ code: "CATALOG_DUPLICATE", status: 409 });
  });

  it("reports a grading certification collision without exposing another item", async () => {
    const repository = {
      createItem: vi.fn().mockRejectedValue({ code: "23505" }),
    } as unknown as CatalogRepository;
    const service = new CatalogService(repository);
    const item: CollectionItemInput = {
      catalogCardId: "40000000-0000-4000-8000-000000000001",
      conditionType: "GRADED",
      gradingCompanyId: "50000000-0000-4000-8000-000000000001",
      grade: 10,
      certificationNumber: "12345678",
      visibility: "PRIVATE",
      availabilityStatus: "NOT_FOR_SALE",
    };
    await expect(service.createItem("user-2", item)).rejects.toMatchObject({
      code: "CERTIFICATION_CONFLICT",
      status: 409,
    });
  });

  it("always scopes collection mutations to the authenticated user", async () => {
    const repository = {
      deleteItem: vi.fn().mockResolvedValue(false),
    } as unknown as CatalogRepository;
    const service = new CatalogService(repository);
    await expect(service.deleteItem("owner-a", "item-b")).resolves.toBe(false);
    expect(repository.deleteItem).toHaveBeenCalledWith("owner-a", "item-b");
  });
});
