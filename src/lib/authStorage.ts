const ACCESS_TOKEN_KEY = "access_token";
const REFRESH_TOKEN_KEY = "refresh_token";

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

  clearTokens(): void {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
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
  role: "admin" | "onboarding_assistant" | "organization_manager" | "expert" | null,
  redirect?: string | null
): string {
  if (redirect && redirect.startsWith("/") && !redirect.startsWith("/login")) {
    return redirect;
  }
  if (role === "expert") {
    return "/experts/portal";
  }
  if (role === "onboarding_assistant") {
    return "/engagements/console";
  }
  if (role === "organization_manager") {
    return "/organisations";
  }
  return "/";
}
