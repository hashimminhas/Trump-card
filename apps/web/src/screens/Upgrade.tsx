import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { toast } from '../components/ui';

export default function Upgrade() {
  const { isGuest, user, upgrade } = useAuth();
  const nav = useNavigate();
  const [username, setU] = useState('');
  const [email, setE] = useState('');
  const [pw, setP] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  if (!isGuest) {
    return <div className="shell-main"><h1>Account</h1>
      <div className="muted-note">You already have a full account - nothing to upgrade.</div></div>;
  }

  async function submit(e: FormEvent) {
    e.preventDefault(); setErr(''); setBusy(true);
    try {
      await upgrade(username.trim(), email.trim(), pw);
      toast('Account created - your match history came with you ⚡', 'gold');
      nav('/');
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="shell-main" style={{ maxWidth: 480 }}>
      <h1>Keep everything, forever</h1>
      <div className="muted-note" style={{ marginBottom: 18 }}>
        You're playing as <b>{user?.username}</b>. Create a free account and this identity becomes
        permanent: your local match history, replays, and statistics are synced to the cloud, and you
        unlock friends, invites, and cross-device play. Nothing is lost.
      </div>
      <form className="panel-card" onSubmit={submit}>
        <div className="field"><label>USERNAME</label>
          <input value={username} onChange={e => setU(e.target.value)} autoFocus autoComplete="username" /></div>
        <div className="field"><label>EMAIL</label>
          <input type="email" value={email} onChange={e => setE(e.target.value)} autoComplete="email" /></div>
        <div className="field"><label>PASSWORD (8+ CHARACTERS)</label>
          <input type="password" value={pw} onChange={e => setP(e.target.value)} autoComplete="new-password" /></div>
        <div className="form-error">{err}</div>
        <button className="btn btn-primary" style={{ width: '100%' }} disabled={busy}>
          {busy ? 'Upgrading…' : 'Create my account'}</button>
      </form>
      <div className="muted-note" style={{ marginTop: 12 }}>
        Guests keep their last 10 matches on this device only - accounts keep everything, everywhere.
      </div>
    </div>
  );
}
