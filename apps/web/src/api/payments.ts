import type {
  AddressInput,
  CheckoutSession,
  ConnectedAccount,
  Order,
  ParcelInput,
  Shipment,
  ShippingRate,
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
  const payload = (await response.json()) as Envelope<T>;
  if (!response.ok)
    throw new Error(payload.error?.message ?? "Something went wrong.");
  return payload.data;
}
export const paymentApi = {
  account: () => api<ConnectedAccount>("/seller/payment-account"),
  onboard: () =>
    api<{ url: string; account: ConnectedAccount }>(
      "/seller/payment-account/onboarding",
      { method: "POST" },
    ),
  refresh: () =>
    api<ConnectedAccount>("/seller/payment-account/refresh", {
      method: "POST",
    }),
  addresses: () => api<(AddressInput & { id: string })[]>("/me/addresses"),
  checkout: (input: {
    listingId?: string;
    offerThreadId?: string;
    shippingAddressId: string;
  }) =>
    api<CheckoutSession>("/checkout", {
      method: "POST",
      body: JSON.stringify({ ...input, idempotencyKey: crypto.randomUUID() }),
    }),
  orders: () => api<Order[]>("/me/orders"),
  order: (id: string) => api<Order>(`/orders/${id}`),
  shipment: (id: string) => api<Shipment>(`/orders/${id}/shipment`),
  shippingRates: (orderId: string, parcel: ParcelInput) =>
    api<ShippingRate[]>("/shipping/rates", {
      method: "POST",
      body: JSON.stringify({ orderId, parcel }),
    }),
  buyLabel: (orderId: string, rateId: string) =>
    api<Shipment>(`/orders/${orderId}/shipping-label`, {
      method: "POST",
      body: JSON.stringify({ rateId, idempotencyKey: crypto.randomUUID() }),
    }),
  review: (orderId: string, rating: number, comment: string) =>
    api<unknown>("/reviews", {
      method: "POST",
      body: JSON.stringify({ orderId, rating, comment: comment || null }),
    }),
};
