import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  employeesAuthApi,
  partnersAuthApi,
  staffAuthApi,
  PERMISSIONS_STALE_EVENT,
} from "../lib/api";
import {
  authStorage,
  type AuthKind,
  type AuthSessionProfile,
  type SessionRole,
} from "../lib/authStorage";
import type { EmployeeRole } from "../auth/permissions";

interface AuthState {
  isAuthenticated: boolean;
  authKind: AuthKind | null;
  displayName: string | null;
  employeeId: number | null;
  partnerId: number | null;
  employeeRole: SessionRole | null;
  /** Permissions envelope for inferior_admin (same shape as legacy users/me employee.permissions). */
  permissions: unknown;
  isLoading: boolean;
}

interface AuthContextValue extends AuthState {
  /** @deprecated Use displayName — kept for layout compatibility */
  userId: number | null;
  /** Synthetic profile for PermissionContext / layouts */
  userProfile: {
    first_name?: string | null;
    last_name?: string | null;
    employee?: {
      employee_id: number;
      role: EmployeeRole;
      permissions?: unknown;
    } | null;
  } | null;
  login: (
    phone: string,
    otp: string,
    authKind: AuthKind
  ) => Promise<SessionRole | null>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  sendOtp: (phone: string) => Promise<{ session_id: number; authKind: AuthKind }>;
  resendOtp: (
    phone: string,
    authKind: AuthKind
  ) => Promise<{ session_id: number }>;
  error: string | null;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function profileToState(profile: AuthSessionProfile): Pick<
  AuthState,
  "authKind" | "displayName" | "employeeId" | "partnerId" | "employeeRole" | "permissions"
> {
  return {
    authKind: profile.authKind,
    displayName: profile.name || null,
    employeeId: profile.employeeId ?? null,
    partnerId: profile.partnerId ?? null,
    employeeRole: profile.role,
    permissions: profile.permissions ?? null,
  };
}

function buildUserProfile(
  state: Pick<AuthState, "authKind" | "displayName" | "employeeId" | "employeeRole" | "permissions">
): AuthContextValue["userProfile"] {
  const name = state.displayName ?? "";
  const parts = name.trim().split(/\s+/);
  const first_name = parts[0] || null;
  const last_name = parts.length > 1 ? parts.slice(1).join(" ") : null;
  if (state.authKind !== "employee" || !state.employeeId) {
    return { first_name, last_name, employee: null };
  }
  return {
    first_name,
    last_name,
    employee: {
      employee_id: state.employeeId,
      role: state.employeeRole as EmployeeRole,
      permissions: state.permissions,
    },
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(() => {
    const hasAccessToken = authStorage.hasAccessToken();
    const stored = authStorage.getProfile();
    if (hasAccessToken && stored) {
      return {
        isAuthenticated: true,
        ...profileToState(stored),
        isLoading: true,
      };
    }
    return {
      isAuthenticated: hasAccessToken,
      authKind: authStorage.getAuthKind(),
      displayName: null,
      employeeId: null,
      partnerId: null,
      employeeRole: null,
      permissions: null,
      isLoading: hasAccessToken,
    };
  });
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => setError(null), []);

  const sendOtp = useCallback(async (phone: string) => {
    setError(null);
    return staffAuthApi.sendOtp(phone);
  }, []);

  const resendOtp = useCallback(async (phone: string, authKind: AuthKind) => {
    setError(null);
    return staffAuthApi.resendOtp(phone, authKind);
  }, []);

  const login = useCallback(async (phone: string, otp: string, authKind: AuthKind) => {
    setError(null);
    const result = await staffAuthApi.verifyOtp(phone, otp, authKind);
    const tokens = result.data.tokens;
    authStorage.setTokens(tokens.access_token, tokens.refresh_token);

    let profile: AuthSessionProfile;
    if (result.authKind === "employee") {
      profile = {
        authKind: "employee",
        name: result.data.name,
        role: result.data.role,
        employeeId: result.data.employee_id,
        partnerId: null,
        permissions: result.data.permissions,
      };
    } else {
      profile = {
        authKind: "partner",
        name: result.data.name,
        role: result.data.role,
        employeeId: null,
        partnerId: result.data.partner_id,
        permissions: null,
      };
    }
    authStorage.setProfile(profile);

    const next = profileToState(profile);
    setState({
      isAuthenticated: true,
      ...next,
      isLoading: false,
    });
    return profile.role;
  }, []);

  const logout = useCallback(async () => {
    const refresh = authStorage.getRefreshToken();
    const kind = authStorage.getAuthKind();
    if (refresh) {
      try {
        await staffAuthApi.logout(refresh, kind);
      } catch {
        // ignore
      }
    }
    authStorage.clearTokens();
    setState({
      isAuthenticated: false,
      authKind: null,
      displayName: null,
      employeeId: null,
      partnerId: null,
      employeeRole: null,
      permissions: null,
      isLoading: false,
    });
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!authStorage.hasAccessToken()) return;
    const kind = authStorage.getAuthKind() ?? authStorage.getProfile()?.authKind;
    if (kind === "partner") {
      const res = await partnersAuthApi.me();
      const data = res.data.data;
      const profile: AuthSessionProfile = {
        authKind: "partner",
        name: data.name,
        role: data.role,
        employeeId: null,
        partnerId: data.partner_id,
        permissions: null,
      };
      authStorage.setProfile(profile);
      setState({
        isAuthenticated: true,
        ...profileToState(profile),
        isLoading: false,
      });
      return;
    }
    if (kind === "employee") {
      const res = await employeesAuthApi.me();
      const data = res.data.data;
      const profile: AuthSessionProfile = {
        authKind: "employee",
        name: data.name,
        role: data.role,
        employeeId: data.employee_id,
        partnerId: null,
        permissions: data.permissions,
      };
      authStorage.setProfile(profile);
      setState({
        isAuthenticated: true,
        ...profileToState(profile),
        isLoading: false,
      });
      return;
    }
    // Unknown auth kind — clear session
    authStorage.clearTokens();
    setState({
      isAuthenticated: false,
      authKind: null,
      displayName: null,
      employeeId: null,
      partnerId: null,
      employeeRole: null,
      permissions: null,
      isLoading: false,
    });
  }, []);

  useEffect(() => {
    const token = authStorage.getAccessToken();
    if (!token) {
      return;
    }

    const loadProfile = async () => {
      try {
        await refreshProfile();
      } catch {
        authStorage.clearTokens();
        setState({
          isAuthenticated: false,
          authKind: null,
          displayName: null,
          employeeId: null,
          partnerId: null,
          employeeRole: null,
          permissions: null,
          isLoading: false,
        });
      }
    };

    loadProfile();
  }, [refreshProfile]);

  useEffect(() => {
    let refreshing = false;
    const handlePermissionsStale = () => {
      if (refreshing) return;
      refreshing = true;
      void refreshProfile().finally(() => {
        refreshing = false;
      });
    };
    window.addEventListener(PERMISSIONS_STALE_EVENT, handlePermissionsStale);
    return () => window.removeEventListener(PERMISSIONS_STALE_EVENT, handlePermissionsStale);
  }, [refreshProfile]);

  const value: AuthContextValue = {
    ...state,
    userId: state.employeeId ?? state.partnerId,
    userProfile: buildUserProfile(state),
    login,
    logout,
    refreshProfile,
    sendOtp,
    resendOtp,
    error,
    clearError,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

// This module intentionally co-locates the provider and its matching hook.
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
