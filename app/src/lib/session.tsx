import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import { api, getBaseUrl, loadConfig, setBaseUrl, setToken, type Me } from './api';

type Session = {
  ready: boolean;
  me: Me | null;
  baseUrl: string;
  login: (email: string, role?: Me['role']) => Promise<void>;
  /** 간편 로그인·휴대폰 인증으로 받은 토큰으로 로그인 */
  loginWithToken: (token: string) => Promise<Me | null>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<void>;
  changeBaseUrl: (url: string) => Promise<void>;
};

const Ctx = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [me, setMe] = useState<Me | null>(null);
  const [baseUrl, setBase] = useState('');

  const refreshMe = useCallback(async () => {
    try {
      setMe(await api.get<Me>('/me'));
    } catch {
      setMe(null);
      await setToken(null);
    }
  }, []);

  useEffect(() => {
    (async () => {
      const cfg = await loadConfig();
      setBase(cfg.baseUrl);
      if (cfg.token) await refreshMe();
      setReady(true);
    })();
  }, [refreshMe]);

  const login = useCallback(
    async (email: string, role: Me['role'] = 'READER') => {
      const r = await api.post<{ access_token: string }>('/auth/dev-login', { email, role });
      await setToken(r.access_token);
      const user = await api.get<Me>('/me');
      if (!user.kyc_verified) await api.post('/auth/kyc/mock'); // 시연용: 본인인증은 모의로 바로 완료
      await refreshMe();
    },
    [refreshMe],
  );

  const loginWithToken = useCallback(async (token: string) => {
    await setToken(token);
    try {
      const user = await api.get<Me>('/me');
      setMe(user);
      return user;
    } catch {
      await setToken(null);
      setMe(null);
      return null;
    }
  }, []);

  const logout = useCallback(async () => {
    await setToken(null);
    setMe(null);
  }, []);

  const changeBaseUrl = useCallback(async (url: string) => {
    await setBaseUrl(url);
    setBase(getBaseUrl());
  }, []);

  return <Ctx.Provider value={{ ready, me, baseUrl, login, loginWithToken, logout, refreshMe, changeBaseUrl }}>{children}</Ctx.Provider>;
}

export function useSession() {
  const s = useContext(Ctx);
  if (!s) throw new Error('SessionProvider 밖에서 useSession 을 쓸 수 없어요');
  return s;
}
