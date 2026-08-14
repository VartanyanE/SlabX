import type {
  CatalogCard,
  CatalogCardInput,
  CollectionItem,
  CollectionItemInput,
  ManualCatalogCardInput,
  SignedUpload,
} from "@slabx/contracts";

type Envelope<T> = { data: T; error?: { message?: string } };
async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const token = document.cookie
    .split("; ")
    .find((entry) => entry.startsWith("slabx_csrf="))
    ?.split("=")[1];
  const response = await fetch(`/api/v1${path}`, {
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { "x-csrf-token": token } : {}),
    },
    ...init,
  });
  if (response.status === 204) return undefined as T;
  const body = await response.text();
  if (!body) {
    throw new Error(
      response.ok
        ? "The server returned an empty response. Please try again."
        : "The SlabX API is unavailable. Please try again shortly.",
    );
  }
  let payload: Envelope<T>;
  try {
    payload = JSON.parse(body) as Envelope<T>;
  } catch {
    throw new Error("The SlabX API returned an invalid response.");
  }
  if (!response.ok)
    throw new Error(payload.error?.message ?? "Something went wrong.");
  return payload.data;
}
export const catalogApi = {
  categories: () =>
    api<{ id: string; slug: string; name: string }[]>("/categories"),
  graders: () =>
    api<{ id: string; code: string; name: string }[]>("/grading-companies"),
  sets: (categoryId?: string) =>
    api<
      {
        id: string;
        categoryId: string;
        name: string;
        yearStart: number;
        manufacturer: string;
      }[]
    >(
      categoryId
        ? `/catalog/sets?categoryId=${encodeURIComponent(categoryId)}`
        : "/catalog/sets",
    ),
  search: (input: { q?: string; category?: string }) => {
    const query = new URLSearchParams();
    if (input.q) query.set("q", input.q);
    if (input.category) query.set("category", input.category);
    return api<CatalogCard[]>(`/catalog/cards?${query}`);
  },
  card: (id: string) => api<CatalogCard>(`/catalog/cards/${id}`),
  createCard: (input: CatalogCardInput) =>
    api<CatalogCard>("/catalog/cards", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  createManualCard: (input: ManualCatalogCardInput) =>
    api<CatalogCard>("/catalog/cards/manual", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  collection: () => api<CollectionItem[]>("/me/collection/items"),
  createItem: (input: CollectionItemInput) =>
    api<CollectionItem>("/collection/items", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  deleteItem: (id: string) =>
    api<void>(`/collection/items/${id}`, { method: "DELETE" }),
  signUpload: (itemId: string) =>
    api<SignedUpload>(`/collection/items/${itemId}/media/sign`, {
      method: "POST",
    }),
  confirmUpload: (itemId: string, publicId: string) =>
    api<CollectionItem>(`/collection/items/${itemId}/media/confirm`, {
      method: "POST",
      body: JSON.stringify({ publicId }),
    }),
  reorderMedia: (itemId: string, mediaIds: string[]) =>
    api<CollectionItem>(`/collection/items/${itemId}/media/order`, {
      method: "PUT",
      body: JSON.stringify({ mediaIds }),
    }),
  deleteMedia: (itemId: string, mediaId: string) =>
    api<void>(`/collection/items/${itemId}/media/${mediaId}`, {
      method: "DELETE",
    }),
};

export function uploadToCloudinary(
  signed: SignedUpload,
  file: File,
  onProgress: (value: number) => void,
): Promise<{ public_id: string }> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open(
      "POST",
      `https://api.cloudinary.com/v1_1/${signed.cloudName}/image/upload`,
    );
    request.upload.onprogress = (event) => {
      if (event.lengthComputable)
        onProgress(Math.round((event.loaded / event.total) * 100));
    };
    request.onerror = () =>
      reject(new Error("Upload interrupted. Check your connection and retry."));
    request.onload = () => {
      if (request.status < 200 || request.status >= 300)
        return reject(new Error("Cloudinary rejected this image."));
      resolve(JSON.parse(request.responseText) as { public_id: string });
    };
    const body = new FormData();
    body.append("file", file);
    body.append("api_key", signed.apiKey);
    body.append("timestamp", String(signed.timestamp));
    body.append("folder", signed.folder);
    body.append("public_id", signed.publicId);
    body.append("signature", signed.signature);
    request.send(body);
  });
}
