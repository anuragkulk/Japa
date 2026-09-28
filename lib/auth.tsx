import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  apiLogin,
  apiLogout,
  apiMe,
  apiSignup,
  getSessionToken,
  setSessionToken,
  type User,
} from "./api";

type Status = "loading" | "authed" | "guest";

type AuthValue = {
  status: Status;
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  signup: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>("loading");
  const [user, setUser] = useState<User | null>(null);

  // On boot, validate any stored session so a refresh never logs the user out
  // and never shows a blank screen.
  useEffect(() => {
    let cancelled = false;
    const token = getSessionToken();
    if (!token) {
      setStatus("guest");
      return;
    }
    apiMe()
      .then((r) => {
        if (cancelled) return;
        setUser(r.user);
        setStatus("authed");
      })
      .catch(() => {
        if (cancelled) return;
        setSessionToken(null);
        setUser(null);
        setStatus("guest");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const r = await apiLogin(email, password);
    setSessionToken(r.token);
    setUser(r.user);
    setStatus("authed");
  }, []);

  const signup = useCallback(async (name: string, email: string, password: string) => {
    const r = await apiSignup(name, email, password);
    setSessionToken(r.token);
    setUser(r.user);
    setStatus("authed");
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiLogout();
    } catch {
      /* clear locally regardless */
    }
    setSessionToken(null);
    setUser(null);
    setStatus("guest");
  }, []);

  const value = useMemo(
    () => ({ status, user, login, signup, logout }),
    [status, user, login, signup, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
