import type { EmployeeRole } from "../auth/permissions";
import type { PartnerRoleValue } from "./api";

const ACCESS_TOKEN_KEY = "access_token";
const REFRESH_TOKEN_KEY = "refresh_token";
const AUTH_KIND_KEY = "auth_kind";
const AUTH_PROFILE_KEY = "auth_profile";

export type AuthKind = "employee" | "partner";

export type SessionRole = EmployeeRole | PartnerRoleValue | string;

export interface AuthSessionProfile {
  authKind: AuthKind;
  name: string;
  role: SessionRole;
  employeeId?: number | null;
  partnerId?: number | null;
  permissions?: unknown;
}

/** Migrate one-time from sessionStorage so existing sessions keep working. */
function migrateFromSessionStorage(): void {
  const sessionAccess = sessionStorage.getItem(ACCESS_TOKEN_KEY);
  if (!sessionAccess || localStorage.getItem(ACCESS_TOKEN_KEY)) {
    return;
  }
  localStorage.setItem(ACCESS_TOKEN_KEY, sessionAccess);
  const sessionRefresh = sessionStorage.getItem(REFRESH_TOKEN_KEY);
  if (sessionRefresh) {
    localStorage.setItem(REFRESH_TOKEN_KEY, sessionRefresh);
  }
  sessionStorage.removeItem(ACCESS_TOKEN_KEY);
  sessionStorage.removeItem(REFRESH_TOKEN_KEY);
}

export const authStorage = {
  getAccessToken(): string | null {
    migrateFromSessionStorage();
    return localStorage.getItem(ACCESS_TOKEN_KEY);
  },

  getRefreshToken(): string | null {
    migrateFromSessionStorage();
    return localStorage.getItem(REFRESH_TOKEN_KEY);
  },

  setTokens(accessToken: string, refreshToken: string): void {
    localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
    localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
    sessionStorage.removeItem(ACCESS_TOKEN_KEY);
    sessionStorage.removeItem(REFRESH_TOKEN_KEY);
  },

  getAuthKind(): AuthKind | null {
    const raw = localStorage.getItem(AUTH_KIND_KEY);
    if (raw === "employee" || raw === "partner") return raw;
    return null;
  },

  setAuthKind(kind: AuthKind): void {
    localStorage.setItem(AUTH_KIND_KEY, kind);
  },

  getProfile(): AuthSessionProfile | null {
    const raw = localStorage.getItem(AUTH_PROFILE_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as AuthSessionProfile;
    } catch {
      return null;
    }
  },

  setProfile(profile: AuthSessionProfile): void {
    localStorage.setItem(AUTH_PROFILE_KEY, JSON.stringify(profile));
    localStorage.setItem(AUTH_KIND_KEY, profile.authKind);
  },

  clearTokens(): void {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(AUTH_KIND_KEY);
    localStorage.removeItem(AUTH_PROFILE_KEY);
    sessionStorage.removeItem(ACCESS_TOKEN_KEY);
    sessionStorage.removeItem(REFRESH_TOKEN_KEY);
  },

  hasAccessToken(): boolean {
    return !!this.getAccessToken();
  },
};

export function loginPathWithRedirect(pathname: string, search = ""): string {
  const target = `${pathname}${search}`;
  if (!target || target === "/login" || target.startsWith("/login?")) {
    return "/login";
  }
  return `/login?redirect=${encodeURIComponent(target)}`;
}

export function resolvePostLoginPath(
  role: SessionRole | null,
  redirect?: string | null,
  authKind?: AuthKind | null
): string {
  if (redirect && redirect.startsWith("/") && !redirect.startsWith("/login")) {
    return redirect;
  }
  if (role === "organization_manager") {
    return "/organisations";
  }
  if (authKind === "partner" || role === "phlebo" || role === "expert") {
    if (role === "phlebo") return "/engagements/console";
    if (role === "expert") return "/experts/portal";
  }
  if (role === "expert") {
    return "/experts/portal";
  }
  if (role === "onboarding_assistant" || role === "phlebo") {
    return "/engagements/console";
  }
  return "/";
}
