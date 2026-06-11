import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { getSocket } from '../socket';

interface FriendRow { friendship_id: number; user_id: number; username: string; status?: string; }

export default function Friends() {
  const [friends, setFriends] = useState<FriendRow[]>([]);
  const [incoming, setIncoming] = useState<FriendRow[]>([]);
  const [outgoing, setOutgoing] = useState<FriendRow[]>([]);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<{id:number; username:string}[]>([]);
  const [msg, setMsg] = useState('');

  const refresh = useCallback(() => {
    api('/friends').then((d:any) => { setFriends(d.friends); setIncoming(d.incoming); setOutgoing(d.outgoing); });
  }, []);

  useEffect(() => {
    refresh();
    const s = getSocket();
    if (!s) return;
    const onPresence = (p: {userId:number; status:string}) =>
      setFriends(fs => fs.map(f => f.user_id === p.userId ? { ...f, status: p.status } : f));
    s.on('presence', onPresence);
    s.on('friends_changed', refresh);
    return () => { s.off('presence', onPresence); s.off('friends_changed', refresh); };
  }, [refresh]);

  useEffect(() => {
    if (q.trim().length < 2) { setResults([]); return; }
    const t = setTimeout(() => api(`/users/search?q=${encodeURIComponent(q.trim())}`)
      .then((d:any)=>setResults(d.users)), 250);
    return () => clearTimeout(t);
  }, [q]);

  async function request(username: string) {
    setMsg('');
    try { await api('/friends/request', { method:'POST', json:{ username } }); setMsg(`Request sent to ${username}.`); setQ(''); refresh(); }
    catch (e:any) { setMsg(e.message); }
  }
  const accept = (id:number) => api('/friends/accept', { method:'POST', json:{ id } }).then(refresh);
  const remove = (id:number) => api(`/friends/${id}`, { method:'DELETE' }).then(refresh);

  const dot = (st?: string) => <span className={`presence-dot ${st || 'offline'}`} title={st} />;
  const label = (st?: string) => st === 'in_match' ? 'in match' : (st || 'offline');

  return (
    <div className="shell-main">
      <h1>Friends</h1>

      <h2>Find players</h2>
      <div className="field" style={{maxWidth:340}}>
        <input placeholder="Search by username…" value={q} onChange={e=>setQ(e.target.value)} />
      </div>
      {results.map(u => (
        <div className="row-item" key={u.id}>
          <span className="grow"><b>{u.username}</b></span>
          <button className="btn btn-ghost btn-sm" onClick={()=>request(u.username)}>Add friend</button>
        </div>
      ))}
      <div className="form-error" style={{color: msg.startsWith('Request') ? 'var(--charge)' : undefined}}>{msg}</div>

      {incoming.length > 0 && <>
        <h2>Incoming requests</h2>
        {incoming.map(f => (
          <div className="row-item" key={f.friendship_id}>
            <span className="grow"><b>{f.username}</b> wants to be friends</span>
            <button className="btn btn-primary btn-sm" onClick={()=>accept(f.friendship_id)}>Accept</button>
            <button className="btn btn-ghost btn-sm" onClick={()=>remove(f.friendship_id)}>Decline</button>
          </div>
        ))}
      </>}

      <h2>Your friends</h2>
      {friends.length === 0 && <div className="muted-note">No friends yet — search above to send a request.</div>}
      {friends.map(f => (
        <div className="row-item" key={f.friendship_id}>
          {dot(f.status)}
          <span className="grow">
            <Link to={`/profile/${f.username}`} style={{color:'var(--ink)', textDecoration:'none', fontWeight:600}}>{f.username}</Link>
            {' '}<span className="presence-label">{label(f.status)}</span>
          </span>
          <button className="btn btn-ghost btn-sm" onClick={()=>remove(f.friendship_id)}>Remove</button>
        </div>
      ))}

      {outgoing.length > 0 && <>
        <h2>Sent requests</h2>
        {outgoing.map(f => (
          <div className="row-item" key={f.friendship_id}>
            <span className="grow">{f.username} <span className="presence-label">pending</span></span>
            <button className="btn btn-ghost btn-sm" onClick={()=>remove(f.friendship_id)}>Cancel</button>
          </div>
        ))}
      </>}
    </div>
  );
}
