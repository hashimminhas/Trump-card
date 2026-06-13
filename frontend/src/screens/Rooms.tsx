import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, Room } from '../api';

export default function Rooms() {
  const nav = useNavigate();
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function create() {
    setBusy(true); setErr('');
    try { const d = await api<{room: Room}>('/room/create', { method:'POST' }); nav(`/room/${d.room.code}`); }
    catch (e:any) { setErr(e.message); } finally { setBusy(false); }
  }
  async function join(e: FormEvent) {
    e.preventDefault(); setBusy(true); setErr('');
    try { const d = await api<{room: Room}>('/room/join', { method:'POST', json:{ code } }); nav(`/room/${d.room.code}`); }
    catch (e:any) { setErr(e.message); } finally { setBusy(false); }
  }
  return (
    <div className="shell-main">
      <h1>Private rooms</h1>
      <div className="muted-note" style={{marginBottom:20}}>
        Gather four players with a 6-character code. Teams are A+C vs B+D - the host sits at A.
        Real-time gameplay arrives in Phase 3B; for now the lobby tracks seats and ready status.
      </div>
      <div className="nav-grid">
        <div className="nav-tile primary" style={{cursor:'default'}}>
          <span className="t">Create a room</span>
          <span className="d">You'll get a code to share with friends.</span>
          <button className="btn btn-primary btn-sm" style={{marginTop:8, alignSelf:'flex-start'}}
                  onClick={create} disabled={busy}>Create room</button>
        </div>
        <form className="nav-tile" style={{cursor:'default'}} onSubmit={join}>
          <span className="t">Join with a code</span>
          <div className="field" style={{marginBottom:8}}>
            <input placeholder="AB12CD" value={code} maxLength={6}
                   onChange={e=>setCode(e.target.value.toUpperCase())}
                   style={{fontFamily:'var(--mono)', letterSpacing:'.2em', textTransform:'uppercase'}} />
          </div>
          <button className="btn btn-ghost btn-sm" style={{alignSelf:'flex-start'}} disabled={busy || code.length!==6}>Join room</button>
        </form>
      </div>
      <div className="form-error">{err}</div>
    </div>
  );
}
