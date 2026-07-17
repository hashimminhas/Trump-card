import { useEffect, useRef, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth/AuthContext';
import { getSocket } from '../socket';
import NotificationBell from '../components/NotificationBell';
// @ts-ignore
import { mountElectronGame } from '../game/engine.js';

function makeCloud() {
  return {
    async listRecords() {
      try {
        const local = JSON.parse(localStorage.getItem('ec.history.v1') || '[]');
        if (Array.isArray(local) && local.length)
          await api('/matches/import', { method: 'POST', json: { records: local } });
      } catch { /* fine */ }
      const d = await api<{ records: any[] }>('/match-history/full');
      return d.records;
    },
    saveMatch(rec: any) { return api('/matches', { method: 'POST', json: rec }); },
    presence(s: 'online' | 'in_match') { getSocket()?.emit('presence:set', s); }
  };
}

export default function Play() {
  const { user, isGuest, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [inGame, setInGame] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const isGuestRef = useRef(isGuest);
  isGuestRef.current = isGuest;

  useEffect(() => {
    if (!ref.current) return;
    const unmount = mountElectronGame(ref.current, {
      cloud: isGuestRef.current ? null : makeCloud(),
      historyCap: isGuestRef.current ? 10 : 0,
      onGameStart: () => setInGame(true),
      onGameEnd:   () => setInGame(false),
    });
    return () => { unmount(); getSocket()?.emit('presence:set', 'online'); };
  }, []);

  return (
    <div className="shell" style={{ minHeight: '100vh' }}>
      {!inGame && (
        <div className="shell-top">
          <span className="shell-logo"> <span style={{color:'var(--charge)'}}>TRUMP</span> CARD</span>
          <button
            className={`hamburger${menuOpen ? ' open' : ''}`}
            aria-label="Toggle menu"
            onClick={() => setMenuOpen(o => !o)}
          >
            <span /><span /><span />
          </button>
          <nav className={`shell-nav${menuOpen ? ' open' : ''}`} onClick={() => setMenuOpen(false)}>
            <NavLink to="/" end onClick={() => (window as any).goHome?.()}>Home</NavLink>
            <NavLink to="/other-games">Other Games</NavLink>
            {!isGuest && <NavLink to="/profile">Profile</NavLink>}
            {!isGuest && <NavLink to="/friends">Friends</NavLink>}
            <NavLink to="/rooms">Private Room</NavLink>
          </nav>
          <span className="shell-spacer" />
          {isGuest
            ? <NavLink to="/upgrade" className="btn btn-sm btn-upgrade">Create account</NavLink>
            : <NotificationBell />}
          <span className="shell-user">{user?.username}{isGuest ? ' (guest)' : ''}</span>
          <button className="btn btn-ghost btn-sm" onClick={logout}>
            {isGuest ? 'Exit guest' : 'Log out'}
          </button>
        </div>
      )}

      <div
        ref={ref}
        className="ec-game-root"
        style={{
          width: '100%',
          minHeight: 'calc(100vh - 54px)',
          display: 'block',
          ...(inGame ? {
            position: 'fixed' as const,
            inset: 0,
            zIndex: 100,
            width: '100vw',
            height: '100vh'
          } : {})
        }}
      />
    </div>
  );
}
