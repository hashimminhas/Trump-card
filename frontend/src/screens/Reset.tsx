import { FormEvent, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';

export default function Reset() {
  const { token = '' } = useParams();
  const nav = useNavigate();
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [err, setErr] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault(); setErr('');
    if (pw !== pw2) { setErr('Passwords do not match.'); return; }
    try {
      await api('/reset', { method: 'POST', json: { token, password: pw } });
      nav('/login');
    } catch (e: any) { setErr(e.message); }
  }
  return (
    <div className="shell"><div className="auth-wrap">
      <form className="auth-card" onSubmit={submit}>
        <h1>New password</h1>
        <div className="sub">Choose a new password for your account</div>
        <div className="field"><label>NEW PASSWORD (8+ CHARACTERS)</label>
          <input type="password" value={pw} onChange={e => setPw(e.target.value)} autoFocus /></div>
        <div className="field"><label>REPEAT PASSWORD</label>
          <input type="password" value={pw2} onChange={e => setPw2(e.target.value)} /></div>
        <div className="form-error">{err}</div>
        <button className="btn btn-primary" style={{ width: '100%' }}>Set password</button>
        <div className="auth-alt"><Link to="/login">Back to sign in</Link></div>
      </form>
    </div></div>
  );
}
