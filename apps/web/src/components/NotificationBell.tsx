import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { getSocket } from '../socket';
import { toast } from './ui';

interface Notif { id: number; type: string; payload: any; read: number; created_at: string; }

function describe(n: Notif): string {
  if (n.type === 'friend_request') return `${n.payload.from} sent you a friend request`;
  if (n.type === 'friend_accepted') return `${n.payload.from} accepted your friend request`;
  if (n.type === 'room_invite') return `${n.payload.from} invited you to room ${n.payload.code}`;
  return n.type;
}

export default function NotificationBell() {
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notif[]>([]);
  const [unread, setUnread] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  const refresh = () => api('/notifications').then((d: any) => { setItems(d.notifications); setUnread(d.unread); }).catch(() => {});

  useEffect(() => {
    refresh();
    const s = getSocket();
    if (!s) return;
    const onNotify = (n: Notif) => {
      setItems(x => [n, ...x]);
      setUnread(u => u + 1);
      toast(describe(n), n.type === 'room_invite' ? 'gold' : 'info');
    };
    const onFriendOn = (e: any) => toast(`${e.username} is online`);
    const onFriendOff = () => {};
    s.on('notify', onNotify);
    s.on('user_connected', onFriendOn);
    s.on('user_disconnected', onFriendOff);
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => {
      s.off('notify', onNotify); s.off('user_connected', onFriendOn); s.off('user_disconnected', onFriendOff);
      document.removeEventListener('mousedown', close);
    };
  }, []);

  function openPanel() {
    setOpen(o => !o);
    if (!open && unread) {
      api('/notifications/read', { method: 'POST', json: {} }).then(() => setUnread(0));
    }
  }
  function click(n: Notif) {
    setOpen(false);
    if (n.type === 'room_invite') {
      api('/room/join', { method: 'POST', json: { code: n.payload.code } })
        .then(() => nav(`/room/${n.payload.code}`))
        .catch((e: any) => toast(e.message, 'error'));
    } else nav('/friends');
  }

  return (
    <div className="bell-wrap" ref={ref}>
      <button className="btn btn-ghost btn-sm bell-btn" onClick={openPanel}>
        🔔{unread > 0 && <span className="bell-badge">{unread}</span>}
      </button>
      {open && (
        <div className="bell-panel">
          <div className="bell-head">Notifications</div>
          {items.length === 0 && <div className="muted-note" style={{ padding: '14px 16px' }}>Nothing yet.</div>}
          {items.map(n => (
            <button key={n.id} className={`bell-item ${n.read ? '' : 'fresh'}`} onClick={() => click(n)}>
              <span>{describe(n)}</span>
              <span className="bell-time">{new Date(n.created_at + (n.created_at.includes('Z') ? '' : 'Z')).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
