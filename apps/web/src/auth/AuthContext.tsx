import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { api, getToken, setToken, User } from '../api';
import { dropSocket, getSocket } from '../socket';

interface AuthCtx {
  user: User | null;
  loading: boolean;
  isGuest: boolean;
  login: (login: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<void>;
  guest: () => Promise<void>;
  upgrade: (username: string, email: string, password: string) => Promise<void>;
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
  /** Guest mode: resume the locally stored guest identity if it's still valid, else mint a new one. */
  async function guest() {
    try {
      const saved = JSON.parse(localStorage.getItem('ec.guest') || 'null');
      if (saved?.token) {
        setToken(saved.token);
        const d = await api<{ user: User }>('/me');
        if (d.user?.is_guest) { setUser(d.user); getSocket(); return; }
        setToken(null);
      }
    } catch { setToken(null); }
    const d = await api<{ token: string; user: User }>('/guest', { method: 'POST' });
    try {
      localStorage.setItem('ec.guest', JSON.stringify({
        guestId: d.user.username, createdAt: new Date().toISOString(), type: 'guest', token: d.token
      }));
    } catch {}
    setToken(d.token); setUser(d.user); getSocket();
  }
  /** Convert this guest into a real account, then sync local history to the cloud. */
  async function upgrade(username: string, email: string, password: string) {
    const d = await api<{ token: string; user: User }>('/guest/upgrade', { method: 'POST', json: { username, email, password } });
    setToken(d.token); setUser(d.user);
    try { localStorage.removeItem('ec.guest'); } catch {}
    dropSocket(); getSocket(); // reconnect with the upgraded token
    try {
      const local = JSON.parse(localStorage.getItem('ec.history.v1') || '[]');
      if (Array.isArray(local) && local.length) await api('/matches/import', { method: 'POST', json: { records: local } });
    } catch {}
  }
  function logout() {
    setToken(null); setUser(null); dropSocket();
  }

  return <Ctx.Provider value={{
    user, loading, isGuest: !!user?.is_guest, login, register, guest, upgrade, logout
  }}>{children}</Ctx.Provider>;
}
