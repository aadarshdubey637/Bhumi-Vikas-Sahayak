import { request } from "../client";

export interface AccountUser {
  id: string;
  email: string;
  name: string;
  onboarding_done: boolean;
  created_at: string;
}
export interface AuthConfig {
  auth_mode: "none" | "api_key" | "accounts";
  registration_open: boolean;
  email_delivery: "smtp" | "console" | "none";
  password_min_length: number;
}

export const getAuthConfig = (signal?: AbortSignal) => request<AuthConfig>("GET", "/auth/config", { signal, auth: false, silent401: true });
/** 401 here only means "not signed in": it must not trigger the global session-expired redirect. */
export const getMe = (signal?: AbortSignal) => request<AccountUser>("GET", "/auth/me", { signal, auth: false, silent401: true });
export const register = (body: { name: string; email: string; password: string }) =>
  request<AccountUser>("POST", "/auth/register", { body, auth: false, silent401: true });
export const login = (body: { email: string; password: string }) =>
  request<AccountUser>("POST", "/auth/login", { body, auth: false, silent401: true });
export const logout = () => request<void>("POST", "/auth/logout", { auth: false, silent401: true });
export const forgotPassword = (body: { email: string }) =>
  request<{ status: "accepted"; email_delivery: AuthConfig["email_delivery"] }>("POST", "/auth/forgot-password", { body, auth: false, silent401: true });
export const resetPassword = (body: { token: string; password: string }) =>
  request<AccountUser>("POST", "/auth/reset-password", { body, auth: false, silent401: true });
export const updateMe = (body: { onboarding_done?: boolean; name?: string }) =>
  request<AccountUser>("PATCH", "/auth/me", { body, auth: false, silent401: true });
