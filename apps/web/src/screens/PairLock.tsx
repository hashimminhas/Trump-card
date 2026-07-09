import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
// @ts-ignore
import { mountPairLock } from '../pairlock/pairlock.js';
import '../pairlock/pairlock.css';

export default function PairLock() {
  const ref = useRef<HTMLDivElement>(null);
  const nav = useNavigate();
  const [gameStarted, setGameStarted] = useState(false);

  useEffect(() => {
    if (!gameStarted || !ref.current) return;
    return mountPairLock(ref.current, {
      onExit: () => setGameStarted(false),
    });
  }, [gameStarted]);

  // Before game: show a simple landing with Play button
  // Navbar is visible (Shell wraps this component in App.tsx)
  if (!gameStarted) {
    return (
      <div className="shell-main" style={{ maxWidth: 520 }}>
        <h1>
          Pair Lock{' '}
          <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink-dim)', verticalAlign: 'middle' }}>
            beta
          </span>
        </h1>
        <button
          className="btn btn-primary"
          style={{ width: '100%', padding: '14px', fontSize: 16 }}
          onClick={() => setGameStarted(true)}
        >
          ▶ Play Pair Lock
        </button>
      </div>
    );
  }

  // During game: full screen, navbar hidden (position:fixed over everything)
  return (
    <div
      ref={ref}
      className="pairlock-root"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        width: '100vw',
        height: '100vh',
      }}
    />
  );
}