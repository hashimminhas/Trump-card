import { useEffect, useState } from 'react';

/* ---------- card face (same markup/classes as the game) ---------- */
export interface Card { suit: string; rank: number; }
export const GLYPH: Record<string, string> = { S: '♠', H: '♥', D: '♦', C: '♣' };
export const SUITNAME: Record<string, string> = { S: 'Spades', H: 'Hearts', D: 'Diamonds', C: 'Clubs' };
export const isRed = (s: string) => s === 'H' || s === 'D';
export const RLAB = (r: number) => ({ 11: 'J', 12: 'Q', 13: 'K', 14: 'A' } as any)[r] || String(r);
export const sameCard = (a: Card, b: Card) => a && b && a.suit === b.suit && a.rank === b.rank;

export function CardFace({ card, trump, className = '', onClick, style }: {
  card: Card; trump?: string | null; className?: string;
  onClick?: () => void; style?: React.CSSProperties;
}) {
  const cls = [
    'card', `su-${card.suit}`, isRed(card.suit) ? 'red' : 'blk',
    trump && card.suit === trump ? 'trumpc' : '', className
  ].filter(Boolean).join(' ');
  return (
    <div className={cls} onClick={onClick} style={style}>
      <div className="corner">{RLAB(card.rank)}<small>{GLYPH[card.suit]}</small></div>
      <div className="big">{GLYPH[card.suit]}</div>
      <div className="corner br">{RLAB(card.rank)}<small>{GLYPH[card.suit]}</small></div>
    </div>
  );
}

/* ---------- tiny toast bus ---------- */
type Toast = { id: number; text: string; kind?: 'info' | 'error' | 'gold' };
const listeners = new Set<(t: Toast) => void>();
let toastId = 0;
export function toast(text: string, kind: Toast['kind'] = 'info') {
  const t = { id: ++toastId, text, kind };
  listeners.forEach(l => l(t));
}
export function Toasts() {
  const [items, setItems] = useState<Toast[]>([]);
  useEffect(() => {
    const on = (t: Toast) => {
      setItems(x => [...x, t]);
      setTimeout(() => setItems(x => x.filter(i => i.id !== t.id)), 3800);
    };
    listeners.add(on);
    return () => { listeners.delete(on); };
  }, []);
  return (
    <div className="toasts">
      {items.map(t => <div key={t.id} className={`toast ${t.kind}`}>{t.text}</div>)}
    </div>
  );
}
