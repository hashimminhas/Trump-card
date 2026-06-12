import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Link } from 'react-router-dom';
import { api, Stats, User } from '../api';
import { useAuth } from '../auth/AuthContext';

const GLYPH: Record<string,string> = { S:'♠', H:'♥', D:'♦', C:'♣' };

export default function Profile() {
  const { isGuest } = useAuth();
  const { username } = useParams();
  const [data, setData] = useState<{ user: User; stats: Stats } | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    setData(null); setErr('');
    api(username ? `/profile/${username}` : '/profile')
      .then(setData).catch(e => setErr(e.message));
  }, [username]);

  if (isGuest && !username) {
    return (
      <div className="shell-main">
        <h1>Profile</h1>
        <div className="upgrade-banner">
          <div><b>Guest statistics live inside the game.</b> Open <b>Play → Statistics</b> for your
            local dashboard. A free account adds a permanent cloud profile across devices.</div>
          <Link className="btn btn-upgrade btn-sm" to="/upgrade">Create account</Link>
        </div>
      </div>
    );
  }
  if (err) return <div className="shell-main"><h1>Profile</h1><div className="form-error">{err}</div></div>;
  if (!data) return <div className="shell-main"><div className="spin">loading…</div></div>;
  const { user, stats } = data;
  const fmtDur = (ms: number | null) => ms ? `${Math.floor(ms/60000)}:${String(Math.round(ms/1000)%60).padStart(2,'0')}` : '—';
  return (
    <div className="shell-main">
      <h1>{user.username}</h1>
      <div className="muted-note" style={{marginBottom:18}}>
        Joined {new Date(user.created_at + 'Z').toLocaleDateString()}
      </div>
      <div className="panel-card">
        <div className="stat-pair"><span>Matches played</span><b>{stats.matches}</b></div>
        <div className="stat-pair"><span>KHOTI wins (your team)</span><b>{stats.myWins}</b></div>
        <div className="stat-pair"><span>KHOTIs in matches</span><b>{stats.khoti}</b></div>
        <div className="stat-pair"><span>Draws</span><b>{stats.draws}</b></div>
        <div className="stat-pair"><span>Win percentage</span><b>{stats.winPct}%</b></div>
        <div className="stat-pair"><span>Favorite trump suit</span>
          <b>{stats.favoriteTrump ? GLYPH[stats.favoriteTrump] || stats.favoriteTrump : '—'}</b></div>
        <div className="stat-pair"><span>Largest collection</span><b>{stats.largestCollection}</b></div>
        <div className="stat-pair"><span>Total collections</span><b>{stats.totalCollections}</b></div>
        <div className="stat-pair"><span>Average match length</span><b>{fmtDur(stats.avgDurationMs)}</b></div>
      </div>
      {!username && <div className="muted-note" style={{marginTop:14}}>
        Detailed reports, charts, and replays live inside the game — open <b>Play → Match history</b>.
      </div>}
    </div>
  );
}
