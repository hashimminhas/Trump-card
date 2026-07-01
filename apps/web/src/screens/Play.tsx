import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth/AuthContext';
import { getSocket } from '../socket';
// @ts-ignore - the game is a self-contained JS module (Phase 2 build, rules untouched)
import { mountElectronGame } from '../game/engine.js';

/** Cloud adapter the game uses for save/sync. */
function makeCloud() {
  return {
    /** Seed: import any pre-account local history once, then return the server's full records. */
    async listRecords() {
      try {
        const local = JSON.parse(localStorage.getItem('ec.history.v1') || '[]');
        if (Array.isArray(local) && local.length) {
          await api('/matches/import', { method: 'POST', json: { records: local } });
        }
      } catch { /* local cache unreadable - fine */ }
      const d = await api<{ records: any[] }>('/match-history/full');
      return d.records;
    },
    saveMatch(rec: any) {
      return api('/matches', { method: 'POST', json: rec });
    },
    presence(status: 'online' | 'in_match') {
      getSocket()?.emit('presence:set', status);
    }
  };
}

export default function Play() {
  const ref = useRef<HTMLDivElement>(null);
  const nav = useNavigate();
  const { isGuest } = useAuth();
  useEffect(() => {
    if (!ref.current) return;
    const unmount = mountElectronGame(ref.current, {
      // Guests: pure localStorage, capped at the 10 most recent matches.
      cloud: isGuest ? null : makeCloud(),
      historyCap: isGuest ? 10 : 0,
      onExit: () => nav('/')
    });
    return () => { unmount(); getSocket()?.emit('presence:set', 'online'); };
  }, [nav, isGuest]);
  return <div ref={ref} className="ec-game-root" />;
}
