import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
// @ts-ignore - Pair Lock beta is intentionally plain JS and isolated from Electron Card.
import { mountPairLock } from '../pairlock/pairlock.js';
import '../pairlock/pairlock.css';

export default function PairLock() {
  const ref = useRef<HTMLDivElement>(null);
  const nav = useNavigate();

  useEffect(() => {
    if (!ref.current) return;
    return mountPairLock(ref.current, { onExit: () => nav('/') });
  }, [nav]);

  return <div ref={ref} className="pairlock-root" />;
}
