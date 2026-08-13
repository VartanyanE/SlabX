import type {
  FinancialOverview,
  RefundRecord,
  SellerFinancialSummary,
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
  const payload = (await response.json().catch(() => ({}))) as Envelope<T>;
  if (!response.ok)
    throw new Error(payload.error?.message ?? "Something went wrong.");
  return payload.data;
}
export const financialApi = {
  refunds: () => api<RefundRecord[]>("/financial/refunds"),
  overview: () => api<FinancialOverview>("/financial/overview"),
  sellerSummary: () => api<SellerFinancialSummary>("/seller/financial-summary"),
  request: (input: {
    orderId: string;
    amountMinor: number;
    reasonCode: string;
    details: string;
  }) =>
    api<RefundRecord>("/refunds", {
      method: "POST",
      body: JSON.stringify({ ...input, idempotencyKey: crypto.randomUUID() }),
    }),
  decide: (id: string, decision: "APPROVE" | "REJECT") =>
    api<void>(`/refunds/${id}/decision`, {
      method: "POST",
      body: JSON.stringify({
        decision,
        note:
          decision === "APPROVE"
            ? "Approved after policy review."
            : "Request does not meet the refund policy.",
      }),
    }),
};
