import { useEffect, useRef, useState } from 'react';
// @ts-ignore
import { mountPairLock } from '../pairlock/pairlock.js';
import '../pairlock/pairlock.css';

const HOW_TO_PLAY = [
  { text: 'You and the bot each start with', bold: '4 cards', after: 'in hand and a shared Draw Pile.' },
  { text: 'On your turn:', bold: 'draw 1 card', after: '(hand becomes 5), then throw 1 card to the Ground.' },
  { text: 'Before throwing, you may', bold: 'capture', after: 'a matching pile from the Ground.' },
  { text: 'Or', bold: 'steal', after: "the opponent's top collection pile if your card's rank matches." },
  { text: 'Collect', bold: 'all 4 of a rank', after: '→ that pile becomes 🔒 LOCKED — can never be stolen.' },
  { text: 'Game ends when the Draw Pile is empty and both hands are empty.' },
  { text: 'Highest', bold: 'total card value', after: 'wins. (2–10 = 10pts · J = 20 · Q = 30 · K = 40 · A = 50)' },
];

function PairLockCanvas({ onExit }: { onExit: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    // mountPairLock writes HTML into ref.current and returns a cleanup function
    const cleanup = mountPairLock(ref.current, { onExit });
    return () => { if (typeof cleanup === 'function') cleanup(); };
  }, []);
  return (
    <div
      ref={ref}
      style={{
        width: '100%',
        height: 'calc(100vh - 54px)', /* fill below the shell navbar */
        display: 'block',
        overflow: 'hidden',
      }}
    />
  );
}

export default function PairLock() {
  const [gameStarted, setGameStarted] = useState(false);
  const [showRules, setShowRules] = useState(false);

  if (gameStarted) {
    return <PairLockCanvas key="pl-canvas" onExit={() => setGameStarted(false)} />;
  }

  return (
    <div className="shell-main" style={{ maxWidth: 560 }}>
      <h1>
        Pair Lock{' '}
        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink-dim)', verticalAlign: 'middle' }}>
          beta
        </span>
      </h1>

      <button
        className="btn btn-primary"
        style={{ width: '100%', padding: '14px', fontSize: 16, marginBottom: 12 }}
        onClick={() => setGameStarted(true)}
      >
        ▶ Play Pair Lock
      </button>

      <button
        className="btn btn-ghost"
        style={{ width: '100%', padding: '12px', fontSize: 14, marginBottom: 8 }}
        onClick={() => setShowRules(r => !r)}
      >
        {showRules ? '▲ Hide rules' : '? How to play'}
      </button>

      {showRules && (
        <div className="panel-card" style={{ marginTop: 8 }}>
          <ul style={{ color: 'var(--ink-dim)', lineHeight: 1.85, paddingLeft: 20, margin: 0 }}>
            {HOW_TO_PLAY.map((item, i) => (
              <li key={i}>
                {item.text}{' '}
                {item.bold && <b style={{ color: 'var(--ink)' }}>{item.bold}</b>}
                {item.after && ' ' + item.after}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}