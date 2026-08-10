import type {
  AddressInput,
  AuthenticatedUser,
  LoginRequest,
  ProfileUpdate,
  RegisterRequest,
} from "@slabx/contracts";

type Envelope<T> = { data: T };

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/v1${path}`, {
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(csrfToken() ? { "x-csrf-token": csrfToken()! } : {}),
      ...init?.headers,
    },
    ...init,
  });
  if (response.status === 204) return undefined as T;
  const payload = (await response.json()) as Envelope<T> & {
    error?: { message?: string };
  };
  if (!response.ok)
    throw new Error(payload.error?.message ?? "Something went wrong.");
  return payload.data;
}

export const authApi = {
  register: (input: RegisterRequest) =>
    api<{ userId: string; verificationRequired: boolean }>("/auth/register", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  login: (input: LoginRequest) =>
    api<{ user: AuthenticatedUser; csrfToken: string }>("/auth/login", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  logout: () => api<void>("/auth/logout", { method: "POST" }),
  logoutAll: () => api<void>("/auth/logout-all", { method: "POST" }),
  forgotPassword: (email: string) =>
    api<{ accepted: boolean }>("/auth/password/forgot", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),
  resetPassword: (token: string, password: string) =>
    api<void>("/auth/password/reset", {
      method: "POST",
      body: JSON.stringify({ token, password }),
    }),
  verifyEmail: (token: string) =>
    api<void>("/auth/email/verify", {
      method: "POST",
      body: JSON.stringify({ token }),
    }),
  me: () => api<AuthenticatedUser>("/me"),
  sessions: () =>
    api<
      { id: string; createdAt: string; expiresAt: string; current: boolean }[]
    >("/me/sessions"),
  updateProfile: (input: ProfileUpdate) =>
    api<AuthenticatedUser>("/me/profile", {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  addresses: () => api<(AddressInput & { id: string })[]>("/me/addresses"),
  createAddress: (input: AddressInput) =>
    api<AddressInput & { id: string }>("/me/addresses", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  deleteAddress: (addressId: string) =>
    api<void>(`/me/addresses/${addressId}`, { method: "DELETE" }),
};

function csrfToken(): string | undefined {
  return document.cookie
    .split("; ")
    .find((entry) => entry.startsWith("slabx_csrf="))
    ?.split("=")[1];
}
