import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { authApi } from "../lib/api";

interface AuthState {
  isAuthenticated: boolean;
  userId: number | null;
  isLoading: boolean;
}

interface AuthContextValue extends AuthState {
  login: (phone: string, otp: string) => Promise<void>;
  logout: () => Promise<void>;
  sendOtp: (phone: string) => Promise<{ session_id: number }>;
  error: string | null;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    isAuthenticated: !!localStorage.getItem("access_token"),
    userId: null,
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
    localStorage.setItem("access_token", tokens.access_token);
    localStorage.setItem("refresh_token", tokens.refresh_token);
    setState({
      isAuthenticated: true,
      userId: user_id,
      isLoading: false,
    });
  }, []);

  const logout = useCallback(async () => {
    const refresh = localStorage.getItem("refresh_token");
    if (refresh) {
      try {
        await authApi.logout(refresh);
      } catch {
        // ignore
      }
    }
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    setState({ isAuthenticated: false, userId: null, isLoading: false });
  }, []);

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    setState((s) => ({
      ...s,
      isAuthenticated: !!token,
      isLoading: false,
    }));
  }, []);

  const value: AuthContextValue = {
    ...state,
    login,
    logout,
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

