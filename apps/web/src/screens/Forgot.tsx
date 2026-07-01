import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';

export default function Forgot() {
  const [email, setEmail] = useState('');
  const [done, setDone] = useState(false);
  const [devLink, setDevLink] = useState('');
  const [err, setErr] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault(); setErr('');
    try {
      const d = await api<{ ok: boolean; devLink?: string }>('/forgot', { method: 'POST', json: { email: email.trim() } });
      setDone(true);
      if (d.devLink) setDevLink(d.devLink);
    } catch (e: any) { setErr(e.message); }
  }
  return (
    <div className="shell"><div className="auth-wrap">
      <form className="auth-card" onSubmit={submit}>
        <h1>Reset password</h1>
        <div className="sub">We'll send a reset link to your email</div>
        {done ? (
          <div className="muted-note" style={{ textAlign: 'center' }}>
            If that email is registered, a reset link is on its way.
            {devLink && <><br /><br /><b>Dev mode:</b> <Link to={devLink} style={{ color: 'var(--charge)' }}>open reset link</Link></>}
          </div>
        ) : <>
          <div className="field"><label>EMAIL</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} autoFocus /></div>
          <div className="form-error">{err}</div>
          <button className="btn btn-primary" style={{ width: '100%' }}>Send reset link</button>
        </>}
        <div className="auth-alt"><Link to="/login">Back to sign in</Link></div>
      </form>
    </div></div>
  );
}
