import { describe, expect, it, vi } from "vitest";
import type { CollectionItemInput } from "@slabx/contracts";
import { CatalogRepository } from "./repository.js";
import { CatalogService } from "./service.js";

describe("CatalogService", () => {
  it("reuses an existing canonical card when adding a copy", async () => {
    const existing = { id: "card-1", playerOrCharacter: "Victor Wembanyama" };
    const repository = {
      findMatchingCard: vi.fn().mockResolvedValue(existing),
      createCard: vi.fn(),
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
    ).resolves.toBe(existing);
    expect(repository.createCard).not.toHaveBeenCalled();
  });

  it("recovers a concurrent duplicate by returning its canonical card", async () => {
    const existing = { id: "card-1", playerOrCharacter: "Victor Wembanyama" };
    const repository = {
      findMatchingCard: vi
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(existing),
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
    ).resolves.toBe(existing);
  });

  it("resolves manually entered category and set names", async () => {
    const created = { id: "card-2", playerOrCharacter: "Michael Jordan" };
    const repository = {
      resolveManualReferences: vi.fn().mockResolvedValue({
        categoryId: "10000000-0000-4000-8000-000000000001",
        cardSetId: "30000000-0000-4000-8000-000000000001",
      }),
      findMatchingCard: vi.fn().mockResolvedValue(null),
      createCard: vi.fn().mockResolvedValue(created),
    } as unknown as CatalogRepository;
    const service = new CatalogService(repository);
    await expect(
      service.createManualCard("user-1", {
        categoryName: "Basketball",
        setName: "Prizm",
        playerOrCharacter: "Michael Jordan",
        year: 2023,
        cardNumber: "23",
        isRookie: false,
      }),
    ).resolves.toBe(created);
    expect(repository.resolveManualReferences).toHaveBeenCalledWith(
      expect.objectContaining({ categoryName: "Basketball", setName: "Prizm" }),
    );
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
