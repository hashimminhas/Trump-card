import { useEffect, useRef, useState } from 'react';
// @ts-ignore
import { mountPairLock } from '../pairlock/pairlock.js';
import '../pairlock/pairlock.css';

export default function PairLock() {
  const ref = useRef<HTMLDivElement>(null);
  const [gameStarted, setGameStarted] = useState(false);
  const cleanupRef = useRef<(() => void) | null>(null);

  const startGame = () => {
    setGameStarted(true);
  };

  useEffect(() => {
    if (!gameStarted || !ref.current) return;
    const cleanup = mountPairLock(ref.current, {
      onExit: () => { setGameStarted(false); }
    });
    cleanupRef.current = cleanup || null;
    return () => {
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
    };
  }, [gameStarted]);

  return (
    <div style={{ minHeight: 'calc(100vh - 54px)', position: 'relative' }}>
      {!gameStarted && (
        <div className="shell-main" style={{ maxWidth: 520 }}>
          <h1>Pair Lock <span style={{
            fontSize: 13,
            fontWeight: 500,
            color: 'var(--ink-dim)',
            verticalAlign: 'middle'
          }}>beta</span></h1>
          <button
            className="btn btn-primary"
            style={{ width: '100%', padding: '14px', fontSize: 16 }}
            onClick={startGame}
          >▶ Play Pair Lock</button>
        </div>
      )}
      {gameStarted && (
        <div
          ref={ref}
          className="pairlock-root"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 200,
            width: '100vw',
            height: '100vh'
          }}
        />
      )}
    </div>
  );
}
