'use client';
import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import {
  setAccessToken,
  registerSessionExpiredHandler,
  apiFetch,
  setSessionCredentials,
  clearSessionCredentials,
  getSessionId,
  tryRefresh,
} from '@lib/utils/api-client';

interface AdminUser { id: string; employeeId: string; firstName: string; lastName: string; email: string; role: string; requiresPasswordChange?: boolean; }

interface AuthContextValue {
  user: AdminUser | null;
  loading: boolean;
  sessionExpired: boolean;
  login: (email: string, password: string) => Promise<{ requiresPasswordChange: boolean }>;
  logout: () => Promise<void>;
  clearExpired: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// AuthService returns { accessToken, refreshToken, sessionId, employee: {...} }
interface LoginResponse {
  success: boolean;
  data?: {
    accessToken: string;
    refreshToken: string;
    sessionId: string;
    employee: AdminUser & { requiresPasswordChange: boolean };
  };
  error?: { code: string; message: string };
}
interface MeResponse { success: boolean; data?: AdminUser }

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionExpired, setSessionExpired] = useState(false);

  const clearExpired = useCallback(() => setSessionExpired(false), []);

  useEffect(() => {
    registerSessionExpiredHandler(() => {
      setUser(null);
      clearSessionCredentials();
      setSessionExpired(true);
    });
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const json = await apiFetch<MeResponse>('/api/v1/auth/me');
      if (json.success && json.data) setUser(json.data);
      else setUser(null);
    } catch { setUser(null); }
  }, []);

  useEffect(() => {
    const init = async () => {
      try {
        const ok = await tryRefresh();
        if (ok) await refreshUser();
      } catch { /* no session */ }
      finally { setLoading(false); }
    };
    void init();
  }, [refreshUser]);

  const login = useCallback(async (email: string, password: string) => {
    const json = await apiFetch<LoginResponse>('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    if (!json.success || !json.data) {
      const code = json.error?.code ?? 'UNKNOWN';
      const message = json.error?.message ?? 'Login failed';
      throw Object.assign(new Error(message), { code });
    }
    setAccessToken(json.data.accessToken);
    setSessionCredentials(json.data.refreshToken, json.data.sessionId);
    setUser(json.data.employee);
    setSessionExpired(false);
    return { requiresPasswordChange: json.data.employee.requiresPasswordChange ?? false };
  }, []);

  const logout = useCallback(async () => {
    const sid = getSessionId();
    try {
      await apiFetch('/api/v1/auth/logout', {
        method: 'POST',
        body: JSON.stringify({ sessionId: sid ?? '' }),
      });
    } catch { /* ignore */ }
    setAccessToken(null);
    clearSessionCredentials();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, sessionExpired, login, logout, clearExpired, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
}
