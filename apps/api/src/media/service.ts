import { randomUUID } from "node:crypto";
import type { SignedUpload } from "@slabx/contracts";
import { CatalogError } from "../catalog/service.js";
import { CloudinaryProvider } from "./cloudinary.js";
import { MediaRepository } from "./repository.js";

const MAX_IMAGES = 12;
const MAX_BYTES = 12 * 1024 * 1024;
const ALLOWED_FORMATS = ["jpg", "jpeg", "png", "webp", "heic"];

export class MediaService {
  constructor(
    private readonly repository: MediaRepository,
    private readonly provider: CloudinaryProvider,
  ) {}

  async sign(userId: string, itemId: string): Promise<SignedUpload> {
    if (!(await this.repository.ownsItem(userId, itemId)))
      throw new CatalogError("NOT_FOUND", 404, "Collection item not found.");
    if ((await this.repository.count(itemId)) >= MAX_IMAGES)
      throw new CatalogError(
        "IMAGE_LIMIT",
        409,
        `A collection item can have up to ${MAX_IMAGES} images.`,
      );
    const timestamp = Math.floor(Date.now() / 1000);
    const folder = `slabx/users/${userId}/items/${itemId}`;
    const publicId = randomUUID();
    return {
      cloudName: this.provider.cloudName,
      apiKey: this.provider.apiKey,
      timestamp,
      folder,
      publicId,
      signature: this.provider.signature({
        folder,
        public_id: publicId,
        timestamp,
      }),
      maxBytes: MAX_BYTES,
      allowedFormats: ALLOWED_FORMATS,
    };
  }

  async confirm(userId: string, itemId: string, publicId: string) {
    if (!(await this.repository.ownsItem(userId, itemId)))
      throw new CatalogError("NOT_FOUND", 404, "Collection item not found.");
    const prefix = `slabx/users/${userId}/items/${itemId}/`;
    const resource = await this.provider.resource(publicId);
    if (!resource || !resource.public_id.startsWith(prefix))
      throw new CatalogError(
        "UPLOAD_INVALID",
        422,
        "The uploaded image could not be verified.",
      );
    if (
      resource.resource_type !== "image" ||
      resource.bytes > MAX_BYTES ||
      !ALLOWED_FORMATS.includes(resource.format.toLowerCase())
    ) {
      await this.provider.destroy(publicId);
      throw new CatalogError(
        "UPLOAD_UNSAFE",
        422,
        "Use a JPG, PNG, WebP, or HEIC image under 12 MB.",
      );
    }
    await this.repository.attach(userId, itemId, resource);
    return true;
  }

  reorder(userId: string, itemId: string, mediaIds: string[]) {
    return this.repository.reorder(userId, itemId, mediaIds);
  }
  async remove(userId: string, itemId: string, mediaId: string) {
    const publicId = await this.repository.remove(userId, itemId, mediaId);
    if (!publicId) return false;
    await this.provider.destroy(publicId);
    return true;
  }
}
