import { useEffect, useRef } from 'react';
import { api } from '../api';
import { useAuth } from '../auth/AuthContext';
import { getSocket } from '../socket';
// @ts-ignore
import { mountElectronGame } from '../game/engine.js';

function makeCloud() {
  return {
    async listRecords() {
      try {
        const local = JSON.parse(localStorage.getItem('ec.history.v1') || '[]');
        if (Array.isArray(local) && local.length) {
          await api('/matches/import', { method: 'POST', json: { records: local } });
        }
      } catch { /* fine */ }
      const d = await api<{ records: any[] }>('/match-history/full');
      return d.records;
    },
    saveMatch(rec: any) { return api('/matches', { method: 'POST', json: rec }); },
    presence(status: 'online' | 'in_match') { getSocket()?.emit('presence:set', status); }
  };
}

export default function Play() {
  const { isGuest } = useAuth();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    // Mount the game immediately — this IS the home page
    const unmount = mountElectronGame(ref.current, {
      cloud: isGuest ? null : makeCloud(),
      historyCap: isGuest ? 10 : 0,
      // No onExit — the navbar buttons (Other Game, Private Room) handle navigation
    });
    return () => { unmount(); getSocket()?.emit('presence:set', 'online'); };
  }, []);

  return <div ref={ref} style={{ width: '100%', minHeight: '100vh' }} />;
}