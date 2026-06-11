import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { api, getToken, setToken, User } from '../api';
import { dropSocket, getSocket } from '../socket';

interface AuthCtx {
  user: User | null;
  loading: boolean;
  login: (login: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<void>;
  logout: () => void;
}

const Ctx = createContext<AuthCtx>(null as any);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!getToken()) { setLoading(false); return; }
    api<{ user: User }>('/me')
      .then(d => { setUser(d.user); getSocket(); })
      .catch(() => setToken(null))
      .finally(() => setLoading(false));
  }, []);

  async function login(loginId: string, password: string) {
    const d = await api<{ token: string; user: User }>('/login', { method: 'POST', json: { login: loginId, password } });
    setToken(d.token); setUser(d.user); getSocket();
  }
  async function register(username: string, email: string, password: string) {
    const d = await api<{ token: string; user: User }>('/register', { method: 'POST', json: { username, email, password } });
    setToken(d.token); setUser(d.user); getSocket();
  }
  function logout() {
    setToken(null); setUser(null); dropSocket();
  }

  return <Ctx.Provider value={{ user, loading, login, register, logout }}>{children}</Ctx.Provider>;
}
