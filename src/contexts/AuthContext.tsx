import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { authApi, usersApi, type UserProfile } from "../lib/api";

interface AuthState {
  isAuthenticated: boolean;
  userId: number | null;
  userProfile: UserProfile | null;
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
    userProfile: null,
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
    const profileRes = await usersApi.me();
    setState({
      isAuthenticated: true,
      userId: user_id,
      userProfile: profileRes.data.data,
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
    setState({ isAuthenticated: false, userId: null, userProfile: null, isLoading: false });
  }, []);

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (!token) {
      setState((s) => ({
        ...s,
        isAuthenticated: false,
        userProfile: null,
        isLoading: false,
      }));
      return;
    }

    const loadProfile = async () => {
      try {
        const profileRes = await usersApi.me();
        setState((s) => ({
          ...s,
          isAuthenticated: true,
          userId: profileRes.data.data.user_id,
          userProfile: profileRes.data.data,
          isLoading: false,
        }));
      } catch {
        localStorage.removeItem("access_token");
        localStorage.removeItem("refresh_token");
        setState((s) => ({
          ...s,
          isAuthenticated: false,
          userId: null,
          userProfile: null,
          isLoading: false,
        }));
      }
    };

    loadProfile();
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

