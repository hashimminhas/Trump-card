import { FormEvent, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export default function Login() {
  const { login, user } = useAuth();
  const nav = useNavigate();
  const loc = useLocation() as any;
  const [id, setId] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  if (user) { nav('/'); return null; }

  async function submit(e: FormEvent) {
    e.preventDefault(); setErr(''); setBusy(true);
    try { await login(id.trim(), pw); nav(loc.state?.from?.pathname || '/'); }
    catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  }
  return (
    <div className="shell"><div className="auth-wrap">
      <form className="auth-card" onSubmit={submit}>
        <h1>ELECTR<span style={{color:'var(--charge)'}}>O</span>N CARD</h1>
        <div className="sub">Sign in to sync matches, friends, and rooms</div>
        <div className="field"><label>USERNAME OR EMAIL</label>
          <input value={id} onChange={e=>setId(e.target.value)} autoFocus autoComplete="username" /></div>
        <div className="field"><label>PASSWORD</label>
          <input type="password" value={pw} onChange={e=>setPw(e.target.value)} autoComplete="current-password" /></div>
        <div className="form-error">{err}</div>
        <button className="btn btn-primary" style={{width:'100%'}} disabled={busy}>{busy?'Signing in…':'Sign in'}</button>
        <div className="auth-alt">New here? <Link to="/register">Create an account</Link></div>
        <div className="auth-alt"><Link to="/forgot">Forgot password?</Link></div>
      </form>
    </div></div>
  );
}
