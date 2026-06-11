import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export default function Hub() {
  const { user } = useAuth();
  return (
    <div className="shell-main">
      <h1>Welcome back, {user?.username}</h1>
      <div className="nav-grid">
        <Link className="nav-tile primary" to="/play">
          <span className="t">▶ Play</span>
          <span className="d">The full single-player game — bots, replay, statistics. Matches save to your account.</span>
        </Link>
        <Link className="nav-tile" to="/profile">
          <span className="t">Profile</span>
          <span className="d">Your lifetime record: KHOTIs, collections, favorite trump.</span>
        </Link>
        <Link className="nav-tile" to="/friends">
          <span className="t">Friends</span>
          <span className="d">Find players, send requests, see who's online or in a match.</span>
        </Link>
        <Link className="nav-tile" to="/rooms">
          <span className="t">Private rooms</span>
          <span className="d">Create a room code and gather four players in a lobby. Online play arrives in Phase 3B.</span>
        </Link>
      </div>
      <h2>What's synced to your account</h2>
      <div className="panel-card muted-note">
        Every completed match — including full replays — is stored on the server and follows you across
        devices. Your pre-account local history is imported automatically the first time you open Play
        while signed in.
      </div>
    </div>
  );
}
