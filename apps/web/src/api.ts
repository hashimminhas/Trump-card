/* Minimal fetch wrapper. Token lives in localStorage('ec.token'). */

export function getToken(): string | null {
  try { return localStorage.getItem('ec.token'); } catch { return null; }
}
export function setToken(t: string | null) {
  try { t ? localStorage.setItem('ec.token', t) : localStorage.removeItem('ec.token'); } catch {}
}

export async function api<T = any>(path: string, opts: RequestInit & { json?: any } = {}): Promise<T> {
  const headers: Record<string, string> = { ...(opts.headers as any) };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  let body = opts.body;
  if (opts.json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.json);
  }
  const res = await fetch(`/api${path}`, { ...opts, headers, body });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data as T;
}

export interface User { id: number; username: string; email?: string; created_at: string; is_guest?: number; }
export interface Stats {
  matches: number; khoti: number; myWins: number; draws: number; winPct: number;
  favoriteTrump: string | null; largestCollection: number; totalCollections: number;
  avgDurationMs: number | null;
}
export interface RoomPlayer { userId: number; username: string; seat: string; ready: boolean; isHost: boolean; }
export interface Room { code: string; status: string; hostId: number; players: RoomPlayer[]; }
