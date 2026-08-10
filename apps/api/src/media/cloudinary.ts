import { createHash } from "node:crypto";

export type CloudinaryResource = {
  asset_id: string;
  public_id: string;
  secure_url: string;
  format: string;
  width: number;
  height: number;
  bytes: number;
  resource_type: string;
};

export class CloudinaryProvider {
  constructor(
    readonly cloudName: string,
    readonly apiKey: string,
    private readonly apiSecret: string,
  ) {}

  signature(parameters: Record<string, string | number>) {
    const source = Object.entries(parameters)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join("&");
    return createHash("sha1")
      .update(`${source}${this.apiSecret}`)
      .digest("hex");
  }

  async resource(publicId: string): Promise<CloudinaryResource | null> {
    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${encodeURIComponent(this.cloudName)}/resources/image/upload/${encodeURIComponent(publicId)}`,
      {
        headers: {
          Authorization: `Basic ${Buffer.from(`${this.apiKey}:${this.apiSecret}`).toString("base64")}`,
        },
      },
    );
    if (response.status === 404) return null;
    if (!response.ok)
      throw new Error(`Cloudinary resource lookup failed (${response.status})`);
    return (await response.json()) as CloudinaryResource;
  }

  async destroy(publicId: string) {
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = this.signature({ public_id: publicId, timestamp });
    const body = new URLSearchParams({
      public_id: publicId,
      timestamp: String(timestamp),
      api_key: this.apiKey,
      signature,
      invalidate: "true",
    });
    await fetch(
      `https://api.cloudinary.com/v1_1/${encodeURIComponent(this.cloudName)}/image/destroy`,
      { method: "POST", body },
    );
  }
}
