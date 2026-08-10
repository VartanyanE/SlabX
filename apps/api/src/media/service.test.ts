import { describe, expect, it, vi } from "vitest";
import { CloudinaryProvider } from "./cloudinary.js";
import { MediaRepository } from "./repository.js";
import { MediaService } from "./service.js";

describe("MediaService", () => {
  it("only signs uploads for an item owned by the user", async () => {
    const repository = {
      ownsItem: vi.fn().mockResolvedValue(false),
    } as unknown as MediaRepository;
    const provider = new CloudinaryProvider("demo", "key", "secret");
    const service = new MediaService(repository, provider);
    await expect(service.sign("owner-a", "item-b")).rejects.toMatchObject({
      code: "NOT_FOUND",
      status: 404,
    });
  });

  it("scopes the signature folder to both user and item", async () => {
    const repository = {
      ownsItem: vi.fn().mockResolvedValue(true),
      count: vi.fn().mockResolvedValue(0),
    } as unknown as MediaRepository;
    const provider = new CloudinaryProvider("demo", "key", "secret");
    const signed = await new MediaService(repository, provider).sign(
      "owner-a",
      "item-b",
    );
    expect(signed.folder).toBe("slabx/users/owner-a/items/item-b");
    expect(signed.signature).toMatch(/^[a-f0-9]{40}$/);
    expect(signed.apiKey).toBe("key");
  });

  it("rejects an upload outside the owner's scoped folder", async () => {
    const repository = {
      ownsItem: vi.fn().mockResolvedValue(true),
    } as unknown as MediaRepository;
    const provider = {
      resource: vi.fn().mockResolvedValue({
        asset_id: "asset",
        public_id: "slabx/users/other/items/item-b/image",
        secure_url: "https://example.test/image.jpg",
        format: "jpg",
        width: 100,
        height: 100,
        bytes: 100,
        resource_type: "image",
      }),
    } as unknown as CloudinaryProvider;
    const service = new MediaService(repository, provider);
    await expect(
      service.confirm("owner-a", "item-b", "image"),
    ).rejects.toMatchObject({ code: "UPLOAD_INVALID", status: 422 });
  });
});
