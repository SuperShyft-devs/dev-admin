import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  authApi,
  usersApi,
  PERMISSIONS_STALE_EVENT,
  type UserProfile,
} from "../lib/api";
import { authStorage } from "../lib/authStorage";
import type { EmployeeRole } from "../auth/permissions";

interface AuthState {
  isAuthenticated: boolean;
  userId: number | null;
  userProfile: UserProfile | null;
  employeeId: number | null;
  employeeRole: EmployeeRole | null;
  isLoading: boolean;
}

interface AuthContextValue extends AuthState {
  login: (
    phone: string,
    otp: string
  ) => Promise<EmployeeRole | null>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  sendOtp: (phone: string) => Promise<{ session_id: number }>;
  error: string | null;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    isAuthenticated: authStorage.hasAccessToken(),
    userId: null,
    userProfile: null,
    employeeId: null,
    employeeRole: null,
    isLoading: true,
  });
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => setError(null), []);

  const sendOtp = useCallback(async (phone: string) => {
    setError(null);
    const res = await authApi.sendOtp(phone);
    return res.data.data;
  }, []);

  const login = useCallback(async (phone: string, otp: string) => {
    setError(null);
    const res = await authApi.verifyOtp(phone, otp);
    const { user_id, tokens } = res.data.data;
    authStorage.setTokens(tokens.access_token, tokens.refresh_token);
    const profileRes = await usersApi.me();
    const profile = profileRes.data.data;
    const employeeRole = profile.employee?.role ?? null;
    setState({
      isAuthenticated: true,
      userId: user_id,
      userProfile: profile,
      employeeId: profile.employee?.employee_id ?? null,
      employeeRole,
      isLoading: false,
    });
    return employeeRole;
  }, []);

  const logout = useCallback(async () => {
    const refresh = authStorage.getRefreshToken();
    if (refresh) {
      try {
        await authApi.logout(refresh);
      } catch {
        // ignore
      }
    }
    authStorage.clearTokens();
    setState({ isAuthenticated: false, userId: null, userProfile: null, employeeId: null, employeeRole: null, isLoading: false });
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!authStorage.hasAccessToken()) return;
    const profileRes = await usersApi.me();
    const profile = profileRes.data.data;
    setState((current) => ({
      ...current,
      isAuthenticated: true,
      userId: profile.user_id,
      userProfile: profile,
      employeeId: profile.employee?.employee_id ?? null,
      employeeRole: profile.employee?.role ?? null,
      isLoading: false,
    }));
  }, []);

  useEffect(() => {
    const token = authStorage.getAccessToken();
    if (!token) {
      setState((s) => ({
        ...s,
        isAuthenticated: false,
        userProfile: null,
        employeeId: null,
        employeeRole: null,
        isLoading: false,
      }));
      return;
    }

    const loadProfile = async () => {
      try {
        await refreshProfile();
      } catch {
        authStorage.clearTokens();
        setState((s) => ({
          ...s,
          isAuthenticated: false,
          userId: null,
          userProfile: null,
          employeeId: null,
          employeeRole: null,
          isLoading: false,
        }));
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
    login,
    logout,
    refreshProfile,
    sendOtp,
    error,
    clearError,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

