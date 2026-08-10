import type { OfferThread } from "@slabx/contracts";
type Envelope<T> = { data: T; error?: { message?: string } };
async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const token = document.cookie
    .split("; ")
    .find((e) => e.startsWith("slabx_csrf="))
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
export const offerApi = {
  list: () => api<OfferThread[]>("/me/offers"),
  get: (id: string) => api<OfferThread>(`/offers/${id}`),
  create: (listingId: string, amountMinor: number, message: string) =>
    api<OfferThread>(`/listings/${listingId}/offers`, {
      method: "POST",
      body: JSON.stringify({
        amountMinor,
        message: message || null,
        idempotencyKey: crypto.randomUUID(),
      }),
    }),
  counter: (
    threadId: string,
    amountMinor: number,
    message: string,
    version: number,
  ) =>
    api<OfferThread>(`/offers/${threadId}/counter`, {
      method: "POST",
      body: JSON.stringify({
        amountMinor,
        message: message || null,
        version,
        idempotencyKey: crypto.randomUUID(),
      }),
    }),
  act: (
    threadId: string,
    action: "accept" | "decline" | "cancel",
    version: number,
  ) =>
    api<void>(`/offers/${threadId}/${action}`, {
      method: "POST",
      body: JSON.stringify({ version }),
    }),
};
