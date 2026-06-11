import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSocket } from '../socket';
import { Card, CardFace, GLYPH, SUITNAME, isRed, sameCard, toast } from '../components/ui';

/* Server snapshot shape (personalized). */
interface Snap {
  seq: number; code: string; phase: string; round: number;
  trump: string | null; dealer: string; chooser: string;
  senior: string | null; seniorAtStart: string | null;
  turn: string | null; turnDeadline: number | null; leadSuit: string | null;
  trick: { seat: string; card: Card }[];
  pile: number; banks: { AC: number; BD: number };
  handCounts: Record<string, number>;
  aceLock: string | null;
  collections: { round: number; seat: string; team: string; cards: number }[];
  roundsDone: number;
  players: Record<string, { username: string; bot: string | null; connected: boolean }>;
  mySeat: string | null;
  myHand?: Card[]; legal?: Card[]; amChooser?: boolean; chooserCards?: Card[];
}

const SEATS = ['A', 'B', 'C', 'D'];
const TEAM = (s: string) => (s === 'A' || s === 'C') ? 'AC' : 'BD';
const SUIT_ORDER = ['S', 'H', 'D', 'C'];

export default function OnlineMatch({ code, spectator, onExit }: {
  code: string; spectator: boolean; onExit: () => void;
}) {
  const nav = useNavigate();
  const [st, setSt] = useState<Snap | null>(null);
  const [banner, setBanner] = useState<{ html: JSX.Element; gold?: boolean } | null>(null);
  const [resolved, setResolved] = useState<{ winner: string; winCard: Card } | null>(null);
  const [finished, setFinished] = useState<any>(null);
  const [offline, setOffline] = useState(false);
  const [now, setNow] = useState(Date.now());
  const pending = useRef(false);
  const bannerT = useRef<any>(null);

  const flash = useCallback((html: JSX.Element, ms = 2200, gold = false) => {
    setBanner({ html, gold });
    clearTimeout(bannerT.current);
    bannerT.current = setTimeout(() => setBanner(null), ms);
  }, []);

  useEffect(() => {
    const s = getSocket();
    if (!s) return;
    const join = () => {
      setOffline(false);
      if (spectator) s.emit('spect:watch', code);
      else { s.emit('room:watch', code); s.emit('match:state', { code }); }
    };
    join();

    const onState = (snap: Snap) => {
      if (snap.code !== code) return;
      pending.current = false;
      setSt(prev => {
        if (prev && snap.round !== prev.round) setResolved(null);
        return snap;
      });
    };
    const onEvent = (e: any) => {
      if (e.type === 'dealing') flash(<><b>{e.dealer}</b> deals · <span className="accent">{e.chooser}</span> chooses trump{e.misdeals ? ` (redeal ${e.misdeals})` : ''}</>);
      if (e.type === 'trump_chosen') flash(<>Trump is <span className="accent" style={{ fontSize: 17 }}>{GLYPH[e.suit]} {SUITNAME[e.suit]}</span>{e.auto ? <small> auto-chosen on timeout</small> : null}</>);
      if (e.type === 'misdeal') flash(<><b style={{ color: 'var(--danger)' }}>Misdeal</b> — seat {e.seat} holds no trumps. Reshuffling…</>);
      if (e.type === 'player_disconnected') toast(`${e.seat} disconnected — seat reserved, the match continues`, 'error');
      if (e.type === 'player_reconnected') toast(`${e.seat} reconnected`);
      if (e.type === 'aborted') { toast('Match aborted: ' + e.reason, 'error'); onExit(); }
    };
    const onRound = (e: any) => {
      setResolved({ winner: e.winner, winCard: e.winCard });
      if (e.collected) {
        flash(<><span className="accent" style={{ fontSize: 17 }}>⚡ {e.winner} COLLECTS {e.gained}</span><small>Team {TEAM(e.winner)} banks the entire pile</small></>, 2400, true);
      } else {
        flash(<><b>{e.winner} wins R{e.round}</b> ({e.why})<small>pile charges to {e.pileAfter}</small></>, 2000);
      }
    };
    const onFinish = ({ record }: any) => setFinished(record);
    const onErr = (e: any) => { pending.current = false; toast(e.error, 'error'); };

    s.on('match_state', onState);
    s.on('match_event', onEvent);
    s.on('round_finished', onRound);
    s.on('match_finished', onFinish);
    s.on('match_error', onErr);
    s.on('connect', join);
    s.on('disconnect', () => setOffline(true));
    const tick = setInterval(() => setNow(Date.now()), 250);
    return () => {
      s.off('match_state', onState); s.off('match_event', onEvent);
      s.off('round_finished', onRound); s.off('match_finished', onFinish);
      s.off('match_error', onErr); s.off('connect', join);
      s.emit('room:unwatch', code); s.emit('spect:unwatch', code);
      clearInterval(tick); clearTimeout(bannerT.current);
    };
  }, [code, spectator, flash, onExit]);

  if (!st) return <div className="screen show" style={{ alignItems: 'center', justifyContent: 'center' }}><div className="spin">syncing with table…</div></div>;

  /* seat rotation: my seat (or A for spectators) sits at the bottom */
  const anchor = st.mySeat || 'A';
  const posOf = (seat: string) => SEATS[(SEATS.indexOf(seat) - SEATS.indexOf(anchor) + 4) % 4]; // A=bottom B=left C=top D=right (positional classes)
  const seatAt = (pos: string) => SEATS[(SEATS.indexOf(pos) + SEATS.indexOf(anchor)) % 4];

  const play = (c: Card) => {
    if (pending.current || spectator) return;
    if (!st.legal?.some(l => sameCard(l, c))) return;
    pending.current = true;
    getSocket()?.emit('match:play', { code, card: c });
  };
  const chooseTrump = (suit: string) => {
    if (pending.current) return;
    pending.current = true;
    getSocket()?.emit('match:trump', { code, suit });
  };

  const hand = (st.myHand || []).slice().sort((a, b) =>
    SUIT_ORDER.indexOf(a.suit) - SUIT_ORDER.indexOf(b.suit) || b.rank - a.rank);
  const myTurn = !spectator && st.phase === 'play' && st.turn === st.mySeat;
  const secsLeft = st.turnDeadline ? Math.max(0, Math.ceil((st.turnDeadline - now) / 1000)) : null;

  const seatChip = (pos: 'A' | 'B' | 'C' | 'D') => {
    const seat = seatAt(pos);
    const p = st.players[seat];
    const isMe = seat === st.mySeat;
    return (
      <div className={`seat seat-${pos} team-${TEAM(seat).toLowerCase()} ${st.senior === seat ? 'senior' : ''} ${st.turn === seat ? 'active' : ''}`} key={pos}>
        <div className="avatar" style={{ opacity: p.connected ? 1 : .45 }}>
          {seat}<div className="senior-badge">⚡</div>
        </div>
        <div className="label">
          {isMe ? 'You' : p.username}{p.bot ? ' 🤖' : ''}
          {st.dealer === seat && <span className="tag">DEALER</span>}
          {st.chooser === seat && <span className="tag tc">TC</span>}
          {!p.connected && !p.bot && <span className="tag" style={{ color: 'var(--danger)' }}>OFFLINE</span>}
        </div>
        <div className="cards-left">{st.handCounts[seat] ? st.handCounts[seat] + ' cards' : ''}</div>
      </div>
    );
  };

  const trickCardAt = (pos: string) => {
    const seat = seatAt(pos);
    const t = st.trick.find(x => x.seat === seat);
    if (!t) return null;
    const isWin = resolved && resolved.winner === seat && sameCard(resolved.winCard, t.card);
    const dim = resolved && !isWin;
    return <CardFace card={t.card} trump={st.trump}
      className={`fly-${pos} ${isWin ? 'win-glow' : ''} ${dim ? 'dimmed' : ''}`} />;
  };

  return (
    <div className="screen show" id="screen-game">
      <div className="hud">
        <span className="chip hud-trump"><span className="dim" style={{ fontSize: 10, letterSpacing: '.1em' }}>TRUMP </span>
          <span className="glyph" style={{ color: st.trump ? (isRed(st.trump) ? 'var(--suit-red)' : '#D9DCE6') : undefined }}>
            {st.trump ? GLYPH[st.trump] : '—'}</span></span>
        <span className="chip mono" style={{ fontSize: 12 }}>R {st.round}/13</span>
        <span className="chip mono" style={{ fontSize: 11 }}>{code}</span>
        {spectator && <span className="chip" style={{ color: 'var(--charge)' }}>👁 SPECTATING</span>}
        <div className="hud-spacer" />
        <span className={`chip khoti-chip ${st.banks.AC > 0 && st.banks.BD > 0 ? 'dead' : 'live'}`}>
          {st.banks.AC > 0 && st.banks.BD > 0 ? 'KHOTI OFF' : 'KHOTI LIVE'}</span>
        <span className="meter ac"><span className="shape">▲</span>AC <span className="bar">
          <span className="fill" style={{ width: `${st.banks.AC / 52 * 100}%` }} /></span>
          <span className="mono">{st.banks.AC}</span></span>
        <span className="meter bd"><span className="shape">●</span>BD <span className="bar">
          <span className="fill" style={{ width: `${st.banks.BD / 52 * 100}%` }} /></span>
          <span className="mono">{st.banks.BD}</span></span>
        <button className="btn btn-ghost btn-sm" onClick={onExit}>{spectator ? 'Stop watching' : 'Leave table'}</button>
      </div>

      <div className="table-wrap">
        <div className="table-oval" />
        {(['A', 'B', 'C', 'D'] as const).map(seatChip)}

        <div className={`pile-core ${st.round >= 3 && st.phase === 'play' ? 'live' : ''}`}
          style={{ boxShadow: st.pile ? `0 0 ${10 + st.pile * 2.2}px rgba(242,179,61,${Math.min(.12 + st.pile * .022, .65)})` : 'none' }}>
          <div className="pc-trump">
            <span className="g" style={{ color: st.trump ? (isRed(st.trump) ? 'var(--suit-red)' : '#D9DCE6') : undefined }}>
              {st.trump ? GLYPH[st.trump] : '—'}</span>
            <span>{st.trump ? SUITNAME[st.trump] : ''}</span>
          </div>
          <div className="pc-round">{st.round > 0 ? `Round ${st.round} / 13` : 'Round — / 13'}</div>
          <div className="pc-senior">Senior: {st.senior ? (st.senior === st.mySeat ? 'You' : st.senior) : '—'}</div>
          <div className="pc-pile"><span className="count">{st.pile}</span><span className="plabel">PILE</span></div>
          <div className="pc-status">
            {st.phase === 'trump' ? `${st.chooser === st.mySeat ? 'You choose' : st.chooser + ' chooses'} trump…`
              : myTurn ? `Your turn${secsLeft !== null ? ` · ${secsLeft}s` : ''}`
              : st.turn ? `${st.turn === st.mySeat ? 'You' : st.players[st.turn].bot ? st.turn + ' (bot)' : st.turn} to play${st.turnDeadline && secsLeft !== null ? ` · ${secsLeft}s` : ''}`
              : ''}
          </div>
        </div>

        {(['A', 'B', 'C', 'D'] as const).map(pos =>
          <div className={`trick-slot slot-${pos}`} key={'slot' + pos}>{trickCardAt(pos)}</div>)}

        {banner && <div className={`banner show ${banner.gold ? 'collect' : ''}`}>{banner.html}</div>}

        {!spectator && (
          <div className="hand">
            {hand.map((c, i) => {
              const ok = myTurn && st.legal?.some(l => sameCard(l, c));
              const locked = st.aceLock === st.mySeat && c.rank === 14 && st.trick.length === 0 && st.round < 11;
              return (
                <div key={c.suit + c.rank} style={{ position: 'relative' }}>
                  <CardFace card={c} trump={st.trump}
                    className={`deal-in ${myTurn ? (ok ? 'legal lifted' : 'illegal') : ''}`}
                    style={{ animationDelay: `${i * 0.02}s`, margin: '0 -16px' }}
                    onClick={() => ok && play(c)} />
                  {myTurn && !ok && locked && <span className="ace-lock">LOCK</span>}
                </div>
              );
            })}
          </div>
        )}

        {st.amChooser && st.phase === 'trump' && (
          <div className="overlay show">
            <div className="panel">
              <h2>Choose the trump suit</h2>
              <div className="sub">Decide from your first five cards · {secsLeft !== null ? `${secsLeft}s` : ''}</div>
              <div className="ts-cards">
                {(st.chooserCards || []).map(c => <CardFace key={c.suit + c.rank} card={c} style={{ margin: '0 -10px' }} />)}
              </div>
              <div className="suit-row">
                {SUIT_ORDER.map(s => (
                  <button key={s} className={`suit-btn ${isRed(s) ? 'red' : 'blk'}`} onClick={() => chooseTrump(s)}>
                    <span className="g">{GLYPH[s]}</span>
                    <span className="n">{(st.chooserCards || []).filter(c => c.suit === s).length} in hand</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {offline && (
          <div className="overlay show">
            <div className="panel">
              <h2>Connection lost</h2>
              <div className="sub">Reconnecting… your seat is reserved and the match continues.<br />
                If you miss your turn, the table plays your lowest legal card.</div>
              <div className="spin">⟳</div>
            </div>
          </div>
        )}

        {finished && (
          <div className="overlay show">
            <div className="panel">
              <h2 className={finished.result !== 'DRAW' ? 'mp-khoti' : ''}>
                {finished.result === 'DRAW' ? 'DRAW' : `KHOTI — TEAM ${finished.result === 'KHOTI_AC' ? 'AC' : 'BD'}`}
              </h2>
              <div className="sub">AC {finished.score.AC} – {finished.score.BD} BD
                {finished.score.stranded ? ` · ${finished.score.stranded} stranded` : ''}</div>
              <div className="muted-note" style={{ marginBottom: 18 }}>
                {st.mySeat ? <>Saved to your match history — watch the full replay from <b>Play → Match history</b>.</>
                  : 'Spectated match complete.'}
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                <button className="btn btn-primary" onClick={onExit}>Back to lobby</button>
                <button className="btn btn-ghost" onClick={() => nav('/')}>Home</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
