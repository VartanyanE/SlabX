import type {
  CatalogCard,
  CatalogCardInput,
  CollectionItem,
  CollectionItemInput,
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
  const payload = (await response.json()) as Envelope<T>;
  if (!response.ok)
    throw new Error(payload.error?.message ?? "Something went wrong.");
  return payload.data;
}
export const catalogApi = {
  categories: () =>
    api<{ id: string; slug: string; name: string }[]>("/categories"),
  graders: () =>
    api<{ id: string; code: string; name: string }[]>("/grading-companies"),
  sets: (categoryId: string) =>
    api<
      {
        id: string;
        categoryId: string;
        name: string;
        yearStart: number;
        manufacturer: string;
      }[]
    >(`/catalog/sets?categoryId=${encodeURIComponent(categoryId)}`),
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
  collection: () => api<CollectionItem[]>("/me/collection/items"),
  createItem: (input: CollectionItemInput) =>
    api<CollectionItem>("/collection/items", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  deleteItem: (id: string) =>
    api<void>(`/collection/items/${id}`, { method: "DELETE" }),
};
