import { FormEvent, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export default function Register() {
  const { register, user } = useAuth();
  const nav = useNavigate();
  const loc = useLocation() as any;
  const [username, setU] = useState('');
  const [email, setE] = useState('');
  const [pw, setP] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  if (user) { nav('/'); return null; }

  async function submit(e: FormEvent) {
    e.preventDefault(); setErr(''); setBusy(true);
    try { await register(username.trim(), email.trim(), pw); nav(loc.state?.from?.pathname || '/'); }
    catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  }
  return (
    <div className="shell"><div className="auth-wrap">
      <form className="auth-card" onSubmit={submit}>
        <h1>Create account</h1>
        <div className="sub">Your match history follows you to any device</div>
        <div className="field"><label>USERNAME</label>
          <input value={username} onChange={e=>setU(e.target.value)} autoFocus autoComplete="username" /></div>
        <div className="field"><label>EMAIL</label>
          <input type="email" value={email} onChange={e=>setE(e.target.value)} autoComplete="email" /></div>
        <div className="field"><label>PASSWORD (8+ CHARACTERS)</label>
          <input type="password" value={pw} onChange={e=>setP(e.target.value)} autoComplete="new-password" /></div>
        <div className="form-error">{err}</div>
        <button className="btn btn-primary" style={{width:'100%'}} disabled={busy}>{busy?'Creating…':'Create account'}</button>
        <div className="auth-alt">Already registered? <Link to="/login">Sign in</Link></div>
      </form>
    </div></div>
  );
}
