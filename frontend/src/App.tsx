import { Routes, Route, Navigate, NavLink, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext';
import Login from './screens/Login';
import Register from './screens/Register';
import Hub from './screens/Hub';
import Profile from './screens/Profile';
import Friends from './screens/Friends';
import Rooms from './screens/Rooms';
import Lobby from './screens/Lobby';
import Play from './screens/Play';
import PairLock from './screens/PairLock';
import Upgrade from './screens/Upgrade';
import Forgot from './screens/Forgot';
import Reset from './screens/Reset';
import NotificationBell from './components/NotificationBell';
import { Toasts } from './components/ui';

function RequireAuth({ children }: { children: JSX.Element }) {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <div className="shell"><div className="spin">loading…</div></div>;
  if (!user) return <Navigate to="/login" state={{ from: loc }} replace />;
  return children;
}

function Shell({ children }: { children: JSX.Element }) {
  const { user, isGuest, logout } = useAuth();
  return (
    <div className="shell">
      <div className="shell-top">
        <span className="shell-logo">ELECTR<span className="dot" />N CARD</span>
        <nav className="shell-nav">
          <NavLink to="/" end>Home</NavLink>
          <NavLink to="/play">Play</NavLink>
          <NavLink to="/pair-lock-beta">Pair Lock beta</NavLink>
          {!isGuest && <NavLink to="/profile">Profile</NavLink>}
          {!isGuest && <NavLink to="/friends">Friends</NavLink>}
          <NavLink to="/rooms">Rooms</NavLink>
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

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot" element={<Forgot />} />
        <Route path="/reset/:token" element={<Reset />} />
        <Route path="/play" element={<RequireAuth><Play /></RequireAuth>} />
        <Route path="/pair-lock-beta" element={<RequireAuth><Shell><PairLock /></Shell></RequireAuth>} />
        <Route path="/" element={<RequireAuth><Shell><Hub /></Shell></RequireAuth>} />
        <Route path="/upgrade" element={<RequireAuth><Shell><Upgrade /></Shell></RequireAuth>} />
        <Route path="/profile" element={<RequireAuth><Shell><Profile /></Shell></RequireAuth>} />
        <Route path="/profile/:username" element={<RequireAuth><Shell><Profile /></Shell></RequireAuth>} />
        <Route path="/friends" element={<RequireAuth><Shell><Friends /></Shell></RequireAuth>} />
        <Route path="/rooms" element={<RequireAuth><Shell><Rooms /></Shell></RequireAuth>} />
        <Route path="/room/:code" element={<RequireAuth><Shell><Lobby /></Shell></RequireAuth>} />
        <Route path="/lobby/:code" element={<RequireAuth><Shell><Lobby /></Shell></RequireAuth>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toasts />
    </AuthProvider>
  );
}
