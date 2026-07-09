import { useNavigate } from 'react-router-dom';

export default function OtherGames() {
  const nav = useNavigate();
  return (
    <div className="shell-main">
      <h1>Other Games</h1>
      <p style={{ color: 'var(--ink-dim)', marginBottom: 28 }}>
        More games coming soon. Click one to play.
      </p>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <button
          onClick={() => nav('/other-games/pair-lock')}
          style={{
            width: 160, height: 160,
            background: 'rgba(255,255,255,.05)',
            border: '1px solid rgba(255,255,255,.12)',
            borderRadius: 16,
            cursor: 'pointer',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            color: 'var(--ink)',
            fontFamily: 'var(--body)',
          }}
        >
          <span style={{ fontSize: 36 }}>🎴</span>
          <span style={{ fontWeight: 700, fontSize: 15 }}>Pair Lock</span>
          <span style={{ fontSize: 11, color: 'var(--ink-dim)' }}>beta</span>
        </button>
      </div>
    </div>
  );
}