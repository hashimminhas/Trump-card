import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { getSocket } from '../socket';
import { useAuth } from '../auth/AuthContext';
import { toast } from '../components/ui';
import OnlineMatch from './OnlineMatch';

const SEATS = ['A', 'C', 'B', 'D'];
const SEAT_TEAM: Record<string, 'AC' | 'BD'> = { A: 'AC', C: 'AC', B: 'BD', D: 'BD' };

interface RoomT {
  code: string; status: string; locked: boolean; hostId: number;
  players: { userId: number; username: string; seat: string; ready: boolean; isHost: boolean }[];
  bots: Record<string, string>;
  inMatch: boolean;
}

export default function Lobby() {
  const { code = '' } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const [room, setRoom] = useState<RoomT | null>(null);
  const [err, setErr] = useState('');
  const [inMatch, setInMatch] = useState(false);
  const [spectating, setSpectating] = useState(false);
  const [friends, setFriends] = useState<{ username: string; status?: string }[]>([]);
  const [ping, setPing] = useState<number | null>(null);
  const [botMenu, setBotMenu] = useState<string | null>(null);
  const pingT = useRef<any>(null);

  const refresh = useCallback(() => {
    api<{ room: RoomT }>(`/room/${code}`).then(d => {
      setRoom(d.room);
      if (d.room.status === 'playing' && d.room.players.some(p => p.userId === user?.id)) setInMatch(true);
    }).catch(e => setErr(e.message));
  }, [code, user?.id]);

  useEffect(() => {
    refresh();
    api('/friends').then((d: any) => setFriends(d.friends)).catch(() => {});
    const s = getSocket();
    if (!s) return;
    s.emit('room:watch', code);
    const onState = (state: RoomT) => setRoom(state);
    const onStart = (e: any) => { if (!e || e.code === code) setInMatch(true); };
    const onKicked = (e: any) => { if (e.code === code) { toast('You were removed from the room.', 'error'); nav('/rooms'); } };
    const onClosed = () => { toast('The host closed the room.'); nav('/rooms'); };
    s.on('room_state', onState);
    s.on('match_started', onStart);
    s.on('kicked', onKicked);
    s.on('room_closed', onClosed);
    s.on('connect', refresh);
    pingT.current = setInterval(() => {
      const t0 = Date.now();
      s.timeout(3000).emit('ping:rtt', t0, (err: any) => { if (!err) setPing(Date.now() - t0); });
    }, 4000);
    return () => {
      s.off('room_state', onState); s.off('match_started', onStart);
      s.off('kicked', onKicked); s.off('room_closed', onClosed); s.off('connect', refresh);
      s.emit('room:unwatch', code);
      clearInterval(pingT.current);
    };
  }, [code, nav, refresh]);

  if (inMatch || spectating) {
    return <OnlineMatch code={code.toUpperCase()} spectator={spectating && !inMatch}
      onExit={() => { setInMatch(false); setSpectating(false); refresh(); }} />;
  }

  if (err) return <div className="shell-main"><h1>Lobby</h1><div className="form-error">{err}</div></div>;
  if (!room) return <div className="shell-main"><div className="spin">loading…</div></div>;

  const me = room.players.find(p => p.userId === user?.id);
  const isHost = room.hostId === user?.id;
  const covered = SEATS.every(s => room.players.some(p => p.seat === s) || room.bots[s]);
  const humansReady = room.players.filter(p => !p.isHost).every(p => p.ready);
  const canStart = isHost && covered && humansReady && room.status === 'open';
  const act = (path: string, json: any = {}) =>
    api(path, { method: 'POST', json }).catch((e: any) => toast(e.message, 'error')).then(refresh);

  const seatTile = (seat: string) => {
    const p = room.players.find(x => x.seat === seat);
    const bot = room.bots[seat];
    return (
      <div className={`seat-slot ${p || bot ? 'filled' : ''}`} key={seat}>
        <span className="seat-letter" style={{ color: SEAT_TEAM[seat] === 'AC' ? 'var(--team-ac)' : 'var(--team-bd)' }}>{seat}</span>
        {p ? <>
          <span style={{ fontWeight: 600 }}>{p.username}{p.isHost && ' 👑'}{p.userId === user?.id && ' (you)'}</span>
          <span style={{ flex: 1 }} />
          <span className={`ready-pill ${p.ready ? 'yes' : 'no'}`}>{p.ready ? 'READY' : 'WAITING'}</span>
          {isHost && p.userId !== user?.id && <>
            <button className="btn btn-ghost btn-sm" title="Transfer host" onClick={() => act('/room/transfer', { userId: p.userId })}>👑</button>
            <button className="btn btn-ghost btn-sm" title="Kick" onClick={() => act('/room/kick', { userId: p.userId })}>✕</button>
          </>}
        </> : bot ? <>
          <span style={{ fontWeight: 600 }}>🤖 Bot <span className="presence-label">({bot})</span></span>
          <span style={{ flex: 1 }} />
          <span className="ready-pill yes">READY</span>
          {isHost && <button className="btn btn-ghost btn-sm" title="Remove bot" onClick={() => act('/room/bot/remove', { seat })}>✕</button>}
        </> : <>
          <span className="presence-label">empty</span>
          <span style={{ flex: 1 }} />
          {me && me.seat !== seat && (!room.locked || isHost) &&
            <button className="btn btn-ghost btn-sm" onClick={() => act('/room/seat', { seat })}>Sit here</button>}
          {isHost && (botMenu === seat
            ? ['easy', 'normal', 'hard'].map(d =>
                <button key={d} className="btn btn-ghost btn-sm" onClick={() => { setBotMenu(null); act('/room/bot/add', { seat, difficulty: d }); }}>{d[0].toUpperCase()}</button>)
            : <button className="btn btn-ghost btn-sm" onClick={() => setBotMenu(seat)}>+ Bot</button>)}
        </>}
      </div>
    );
  };

  return (
    <div className="shell-main">
      <h1 style={{ textAlign: 'center' }}>Lobby</h1>
      <div className="lobby-code">{room.code}</div>
      <div className="muted-note" style={{ textAlign: 'center' }}>
        {room.players.length + Object.keys(room.bots).length}/4 seats filled
        {room.locked && ' · 🔒 seats locked'}
        {ping !== null && <> · <span className="mono" style={{ color: ping < 80 ? '#5CC97A' : ping < 200 ? 'var(--charge)' : 'var(--danger)' }}>{ping}ms</span></>}
        {room.status === 'playing' && <> · <b style={{ color: 'var(--charge)' }}>match in progress</b></>}
      </div>

      <div className="lobby-teams">
        <div className="team-col ac"><h3>▲ TEAM AC</h3>{seatTile('A')}{seatTile('C')}</div>
        <div className="team-col bd"><h3>● TEAM BD</h3>{seatTile('B')}{seatTile('D')}</div>
      </div>

      <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 24, flexWrap: 'wrap' }}>
        {me && room.status === 'open' && !me.isHost &&
          <button className="btn btn-primary" onClick={() => act('/room/ready', { ready: !me.ready })}>
            {me.ready ? 'Not ready' : 'Ready'}</button>}
        {isHost && room.status === 'open' &&
          <button className="btn btn-primary" disabled={!canStart} onClick={() => act('/room/start')}
            title={canStart ? '' : 'Fill all four seats (players or bots); everyone ready'}>
            ▶ Start match</button>}
        {room.status === 'playing' && !me &&
          <button className="btn btn-primary" onClick={() => setSpectating(true)}>👁 Spectate</button>}
        {room.status === 'playing' && me &&
          <button className="btn btn-primary" onClick={() => setInMatch(true)}>↩ Rejoin match</button>}
        {me && room.status === 'open' &&
          <button className="btn btn-ghost" onClick={() => api('/room/leave', { method: 'POST' }).then(() => nav('/rooms'))}>Leave room</button>}
        {!me && room.status === 'open' &&
          <button className="btn btn-primary" onClick={() => act('/room/join', { code })}>Take a seat</button>}
      </div>

      {isHost && room.status === 'open' && (
        <div className="panel-card" style={{ marginTop: 26 }}>
          <h3 style={{ fontSize: 11, letterSpacing: '.14em', color: 'var(--ink-dim)', marginBottom: 12 }}>HOST CONTROLS</h3>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <button className="btn btn-ghost btn-sm" onClick={() => act('/room/lock', { locked: !room.locked })}>
              {room.locked ? '🔓 Unlock seats' : '🔒 Lock seats'}</button>
            <button className="btn btn-ghost btn-sm" onClick={() => act('/room/close').then(() => nav('/rooms'))}>Close room</button>
            <span style={{ flex: 1 }} />
            {friends.length > 0 && <>
              <span className="presence-label">Invite:</span>
              {friends.slice(0, 6).map(f =>
                <button key={f.username} className="btn btn-ghost btn-sm"
                  onClick={() => api('/room/invite', { method: 'POST', json: { username: f.username } })
                    .then(() => toast(`Invite sent to ${f.username}`)).catch((e: any) => toast(e.message, 'error'))}>
                  {f.username}{f.status === 'online' ? ' •' : ''}</button>)}
            </>}
          </div>
        </div>
      )}
    </div>
  );
}
