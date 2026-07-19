import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import NotificationBell from './NotificationBell';

export function Shell({ children }: { children: React.ReactNode }) {
  const { user, isGuest, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div className="shell" style={{ minHeight: '100vh' }}>
      <div className="shell-top">
        <span className="shell-logo">TRUMP<span className="dojjt" />CARD</span>
        <button
          className={`hamburger${menuOpen ? ' open' : ''}`}
          aria-label="Toggle menu"
          onClick={() => setMenuOpen(o => !o)}
        >
          <span /><span /><span />
        </button>
        <nav className={`shell-nav${menuOpen ? ' open' : ''}`} onClick={() => setMenuOpen(false)}>
          {/* Home = Play page */}
          <NavLink to="/" end>Home</NavLink>
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
        <button className="btn btn-ghost btn-sm" onClick={logout}>{isGuest ? 'Exit guest' : 'Log out'}</button>
      </div>
      {children}
    </div>
  );
}