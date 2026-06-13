import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export default function Hub() {
  const { user, isGuest } = useAuth();
  return (
    <div className="shell-main">
      <h1>Welcome{isGuest ? '' : ' back'}, {user?.username}</h1>
      {isGuest && (
        <div className="upgrade-banner">
          <div>
            <b>You're playing as a guest.</b> Bots, rooms, multiplayer, replays, reports, and
            statistics all work - your last 10 matches are kept on this device.
            Want permanent cloud history, friends, and cross-device sync?
          </div>
          <Link className="btn btn-upgrade btn-sm" to="/upgrade">Create account</Link>
        </div>
      )}
      <div className="nav-grid">
        <Link className="nav-tile primary" to="/play">
          <span className="t">▶ Play</span>
          <span className="d">The full single-player game - bots, replay, statistics. Matches save to your account.</span>
        </Link>
        {!isGuest && <Link className="nav-tile" to="/profile">
          <span className="t">Profile</span>
          <span className="d">Your lifetime record: KHOTIs, collections, favorite trump.</span>
        </Link>}
        {!isGuest && <Link className="nav-tile" to="/friends">
          <span className="t">Friends</span>
          <span className="d">Find players, send requests, see who's online or in a match.</span>
        </Link>}
        <Link className="nav-tile" to="/rooms">
          <span className="t">Private rooms</span>
          <span className="d">Create a room code and gather four players in a lobby. Online play arrives in Phase 3B.</span>
        </Link>
      </div>
      <h2>{isGuest ? 'How guest mode works' : "What's synced to your account"}</h2>
      <div className="panel-card muted-note">
        {isGuest
          ? <>Your matches, replays, reports, statistics, and settings are stored in this browser -
            the most recent 10 matches are kept. Match history, the last replay, and reports live
            inside <b>Play</b>. Creating an account later preserves all of it.</>
          : <>Every completed match - including full replays - is stored on the server and follows you across
            devices. Your pre-account local history is imported automatically the first time you open Play
            while signed in.</>}
      </div>
    </div>
  );
}
