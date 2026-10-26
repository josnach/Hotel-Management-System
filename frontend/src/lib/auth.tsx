import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, tokenStore } from './api';

export interface User { id: string; username: string; email: string; role: string; fullName?: string | null; twoFactorEnabled?: boolean; mustSetUpTwoFactor?: boolean }
export type LoginResult = { twoFactorRequired: true; challengeToken: string } | { twoFactorRequired?: false };
interface Ctx {
  user: User | null; loading: boolean;
  login: (id: string, pw: string) => Promise<LoginResult>;
  verifyTwoFactor: (challengeToken: string, input: { code?: string; recoveryCode?: string }) => Promise<void>;
  refresh: () => Promise<void>;
  logout: () => void;
}
const AuthCtx = createContext<Ctx>(null!);
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(!!tokenStore.get());
  const refresh = async () => { setUser(await api.get<User>('/auth/me')); };
  useEffect(() => {
    if (!tokenStore.get()) return;
    api.get<User>('/auth/me').then(setUser).catch(() => tokenStore.clear()).finally(() => setLoading(false));
  }, []);
  const login = async (identifier: string, password: string): Promise<LoginResult> => {
    const r = await api.post<any>('/auth/login', { identifier, password });
    if (r.twoFactorRequired) return { twoFactorRequired: true, challengeToken: r.challengeToken };
    tokenStore.set(r.token); setUser({ ...r.user, mustSetUpTwoFactor: r.mustSetUpTwoFactor });
    return {};
  };
  const verifyTwoFactor = async (challengeToken: string, input: { code?: string; recoveryCode?: string }) => {
    const r = await api.post<{ token: string; user: User }>('/auth/2fa/verify', { challengeToken, ...input });
    tokenStore.set(r.token); setUser({ ...r.user, twoFactorEnabled: true });
  };
  // Revoke this device's session on the server first, then clear locally (even if offline).
  const logout = () => {
    api.post('/auth/logout').catch(() => undefined).finally(() => { tokenStore.clear(); setUser(null); window.location.href = '/login'; });
  };
  return <AuthCtx.Provider value={{ user, loading, login, verifyTwoFactor, refresh, logout }}>{children}</AuthCtx.Provider>;
}