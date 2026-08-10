import type { Listing, ListingInput, ListingUpdate } from "@slabx/contracts";

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
export const listingApi = {
  search: (filters: Record<string, string>) =>
    api<Listing[]>(`/listings?${new URLSearchParams(filters)}`),
  get: (id: string) => api<Listing>(`/listings/${id}`),
  mine: () => api<Listing[]>("/me/listings"),
  watchlist: () => api<Listing[]>("/me/watchlist"),
  create: (input: ListingInput) =>
    api<Listing>("/listings", { method: "POST", body: JSON.stringify(input) }),
  update: (id: string, input: ListingUpdate) =>
    api<Listing>(`/listings/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  action: (id: string, action: "publish" | "pause" | "resume") =>
    api<void>(`/listings/${id}/${action}`, { method: "POST" }),
  close: (id: string) => api<void>(`/listings/${id}`, { method: "DELETE" }),
  watch: (id: string) => api<void>(`/me/watchlist/${id}`, { method: "PUT" }),
  unwatch: (id: string) =>
    api<void>(`/me/watchlist/${id}`, { method: "DELETE" }),
};
