import type { ModerationReport, TrustProfile } from "@slabx/contracts";

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

export const trustApi = {
  profile: (userId: string) => api<TrustProfile>(`/profiles/${userId}/trust`),
  report: (input: {
    targetType: "USER" | "REVIEW" | "LISTING";
    targetId: string;
    reasonCode: string;
    details: string;
  }) =>
    api<unknown>("/reports", { method: "POST", body: JSON.stringify(input) }),
  reports: () => api<ModerationReport[]>("/moderation/reports"),
  moderate: (reportId: string, decision: string, note: string) =>
    api<void>(`/moderation/reports/${reportId}/actions`, {
      method: "POST",
      body: JSON.stringify({ decision, note: note || null }),
    }),
};
