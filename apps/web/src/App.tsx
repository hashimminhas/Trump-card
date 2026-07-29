import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext';
import Login from './screens/Login';
import Register from './screens/Register';
import Profile from './screens/Profile';
import Friends from './screens/Friends';
import Rooms from './screens/Rooms';
import Lobby from './screens/Lobby';
import Play from './screens/Play';
import PairLock from './screens/PairLock';
import OtherGames from './screens/OtherGames';
import Upgrade from './screens/Upgrade';
import Forgot from './screens/Forgot';
import Reset from './screens/Reset';
import { Toasts } from './components/ui';
import { Shell } from './components/Shell';
import { trackPageView } from './analytics';
import React, { useEffect } from 'react';

// Hub removed — Play is now the home page

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading && !user) return <div className="shell" style={{ minHeight: '100vh' }}><div className="spin">loading…</div></div>;
  if (!user) return <Navigate to="/login" state={{ from: loc }} replace />;
  return children;
}

function AnalyticsPageViews() {
  const location = useLocation();

  useEffect(() => {
    trackPageView(location.pathname + location.search);
  }, [location.pathname, location.search]);

  return null;
}

export default function App() {
  return (
    <AuthProvider>
      <AnalyticsPageViews />
      <Routes>
        {/* Auth pages — no shell */}
        <Route path="/login"          element={<Login />} />
        <Route path="/register"       element={<Register />} />
        <Route path="/forgot"         element={<Forgot />} />
        <Route path="/reset/:token"   element={<Reset />} />

        {/* Home = Play (the main Trump Card game) — has its own shell built-in */}
        <Route path="/" element={<RequireAuth><Play /></RequireAuth>} />

        {/* Pair Lock — landing page first, then game */}
        <Route path="/other-games" element={<RequireAuth><Shell><OtherGames /></Shell></RequireAuth>} />
        <Route path="/other-games/pair-lock" element={<RequireAuth><Shell><PairLock /></Shell></RequireAuth>} />

        {/* Other pages */}
        <Route path="/upgrade"            element={<RequireAuth><Shell><Upgrade /></Shell></RequireAuth>} />
        <Route path="/profile"            element={<RequireAuth><Shell><Profile /></Shell></RequireAuth>} />
        <Route path="/profile/:username"  element={<RequireAuth><Shell><Profile /></Shell></RequireAuth>} />
        <Route path="/friends"            element={<RequireAuth><Shell><Friends /></Shell></RequireAuth>} />
        <Route path="/rooms"              element={<RequireAuth><Shell><Rooms /></Shell></RequireAuth>} />
        {/* Room lobby has its own shell built-in (hidden once a match is in progress, like Play) */}
        <Route path="/room/:code"         element={<RequireAuth><Lobby /></RequireAuth>} />
        <Route path="/lobby/:code"        element={<RequireAuth><Lobby /></RequireAuth>} />
        <Route path="*"                   element={<Navigate to="/" replace />} />
      </Routes>
      <Toasts />
    </AuthProvider>
  );
}
