export function mountPairLock(container, config = {}) {
  container.innerHTML = `
<div class="wrap">
  <div class="table">
    <div class="topbar">
      <div class="title">PAIR<span class="lk"> LOCK</span></div>
      <span id="turnTag" class="turn-tag you">Your Turn</span>
      <div class="scores">
        <div class="score-pill"><span class="who">Bot</span><b id="botScore">0</b></div>
        <div class="score-pill you"><span class="who">You</span><b id="youScore">0</b></div>
        <button id="btnExit" class="btn ghost" style="padding:6px 12px;font-size:12px;margin-left:8px;">Exit</button>
      </div>
    </div>

    <div class="zone">
      <div class="zone-label">Bot — <span id="botCount">4</span> in hand</div>
      <div class="opp-hand" id="oppHand"></div>
    </div>
    <div class="zone">
      <div class="zone-label">Bot collection <span class="tip">(only the top card of each rank can be taken)</span></div>
      <div class="collection-row" id="botCollection"></div>
    </div>

    <div class="center-row">
      <div class="ground-area">
        <div class="zone-label">Ground</div>
        <div class="row" id="ground" style="max-width:360px;"></div>
      </div>
      <div class="pile-area">
        <div class="zone-label">Draw Pile</div>
        <div class="pile-stack" id="pileStack"><div class="card-back"></div><div class="card-back"></div><div class="card-back"></div></div>
        <div class="pile-count"><span id="pileCount">40</span><small>CARDS</small></div>
      </div>
    </div>

    <div class="zone">
      <div class="zone-label">Your collection</div>
      <div class="collection-row" id="youCollection"></div>
    </div>
    <div class="zone">
      <div class="zone-label">Your hand — <span id="youCount">4</span> cards</div>
      <div class="row" id="hand"></div>
    </div>

    <div class="controls" id="controls">
      <button class="btn" id="btnDraw">Draw Card</button>
      <button class="btn" id="btnCapture" disabled>Capture</button>
      <button class="btn" id="btnDiscard" disabled>Throw Card</button>
      <button class="btn ghost" id="btnCancel" disabled>Cancel Selection</button>
      <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--ink-dim);cursor:pointer;margin-left:10px;">
        <input type="checkbox" id="chkAutoDraw" checked> Auto Draw
      </label>
    </div>
    <div class="status-panel" id="status"></div>
  </div>

  <div class="log-col">
    <div class="log-head"><span class="dot"></span> GAME LOG</div>
    <div class="log" id="log"></div>
  </div>
</div>

<div class="overlay" id="overlay">
  <div class="modal">
    <h2 id="winTitle">Game Over</h2>
    <div class="res" id="winRes"></div>
    <div class="final">
      <div class="final-box" id="finalYou"><div class="fl">You</div><div class="fv" id="finalYouScore">0</div></div>
      <div class="final-box" id="finalBot"><div class="fl">Bot</div><div class="fv" id="finalBotScore">0</div></div>
    </div>
    <div class="locks">Locked sets: <b id="finalLocks">0</b></div>
    <button class="btn" id="btnPlayAgain">Play Again</button>
    <button class="btn ghost" id="btnExitModal" style="margin-top:10px;">Exit to Lobby</button>
  </div>
</div>
  `;

  const SUITS=['H','D','C','S'];
  const SUIT_GLYPH={H:'♥',D:'♦',C:'♣',S:'♠'};
  const RANKS=[2,3,4,5,6,7,8,9,10,11,12,13,14];
  const RANK_LABEL=r=>({11:'J',12:'Q',13:'K',14:'A'}[r]||String(r));
  const isRed=s=>s==='H'||s==='D';
  function cardPoints(r){return r===14?50:r===13?40:r===12?30:r===11?20:10;}

  let deck, ground, hands, collections, lockedRanks, turn, busy, gameOver, startTime, drewThisTurn, discardArmed=false;
  let selHandId=null;

  function buildDeck(){const d=[];for(const s of SUITS)for(const r of RANKS)d.push({rank:r,suit:s,id:s+r});return d;}
  function shuffle(a){for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}

  function newGame(){
    deck=shuffle(buildDeck());
    ground=[]; hands={you:[],bot:[]}; collections={you:[],bot:[]};
    lockedRanks=new Set();
    turn='you'; busy=false; gameOver=false; startTime=Date.now();
    selHandId=null; drewThisTurn=false; discardArmed=false;
    document.getElementById('log').innerHTML='';
    document.getElementById('overlay').classList.remove('show');
    for(let i=0;i<4;i++){hands.you.push(deck.pop());hands.bot.push(deck.pop());ground.push(deck.pop());}
    log('sys','New game — 4 to you, 4 to bot, 4 on the ground.');
    render(true);
    beginTurn();
  }

  function log(type,msg){
    const el=document.getElementById('log');
    const t=((Date.now()-startTime)/1000).toFixed(0);
    const row=document.createElement('div');
    row.className='log-entry '+type;
    row.innerHTML=`<span class="t">${t}s</span>${msg}`;
    el.insertBefore(row, el.firstChild);
  }
  const cardText=c=>RANK_LABEL(c.rank)+SUIT_GLYPH[c.suit];
  const cardListText=a=>a.map(cardText).join(' ');

  function pilesOf(arr){
    const m={};
    for(const c of arr){ (m[c.rank]=m[c.rank]||[]).push(c); }
    return m;
  }
  function rankOrder(arr){
    const seen=[]; const set=new Set();
    for(const c of arr){ if(!set.has(c.rank)){ set.add(c.rank); seen.push(c.rank); } }
    return seen;
  }
  function groundRanks(){ return rankOrder(ground); }
  function cardsOfRank(arr,rank){ return arr.filter(c=>c.rank===rank); }

  function pileSequence(arr){
    const seq=[];
    for(const c of arr){
      const top=seq[seq.length-1];
      if(top && top.rank===c.rank) top.cards.push(c);
      else seq.push({rank:c.rank, cards:[c]});
    }
    return seq;
  }
  function topPile(who){
    const seq=pileSequence(collections[who]);
    return seq.length ? seq[seq.length-1] : null;
  }

  function refreshLocks(){
    for(const who of ['you','bot']){
      const top=topPile(who);
      if(top && top.cards.length===4 && !lockedRanks.has(top.rank)){
        lockedRanks.add(top.rank);
        log('lock',`🔒 ${who==='you'?'You':'Bot'} LOCKED all four ${RANK_LABEL(top.rank)}s on the top pile — it can never be taken.`);
      }
    }
  }
  function scoreOf(who){ return collections[who].reduce((s,c)=>s+cardPoints(c.rank),0); }

  function stealableRanks(oppWho){
    return rankOrder(collections[oppWho]).filter(r=>!lockedRanks.has(r));
  }

  function doCapture(actor, handCard, opts){
    const opp = actor==='you'?'bot':'you';
    const rank = handCard.rank;
    const taken=[];

    hands[actor]=hands[actor].filter(c=>c.id!==handCard.id);

    if(opts.ground){
      const g=cardsOfRank(ground,rank);
      ground=ground.filter(c=>c.rank!==rank);
      taken.push(...g);
    }
    if(opts.opp){
      const o=cardsOfRank(collections[opp],rank);
      collections[opp]=collections[opp].filter(c=>c.rank!==rank);
      taken.push(...o);
    }
    collections[actor].push(handCard, ...taken);
    refreshLocks();

    const all=[handCard,...taken];
    const stole=opts.opp;
    log(stole?'steal':'cap', `${actor==='you'?'You':'Bot'} ${stole?'captured & stole':'captured'} ${cardListText(all)}  (+${all.reduce((s,c)=>s+cardPoints(c.rank),0)})`);
    return all.length;
  }

  function addToOwnPile(actor, handCard){
    hands[actor]=hands[actor].filter(c=>c.id!==handCard.id);
    collections[actor].push(handCard);
    refreshLocks();
    log('cap',`${actor==='you'?'You':'Bot'} added ${cardText(handCard)} to their ${RANK_LABEL(handCard.rank)} pile  (+${cardPoints(handCard.rank)})`);
  }

  function beginTurn(){
    if(gameOver) return;
    if(endIfDone()) return;
    updateTurnTag();
    if(turn==='you'){
      clearSelection(); drewThisTurn=false;
      setTurnStatus();
      refreshButtons();
      const autoDraw = document.getElementById('chkAutoDraw');
      if(autoDraw && autoDraw.checked && deck.length>0 && hands.you.length<5) {
        setTimeout(playerDraw, 400);
      }
    }else{
      setStatus('Bot Turn');
      setButtons({draw:false,capture:false,discard:false,cancel:false});
      setTimeout(botTurn, 800);
    }
  }

  function playerDraw(){
    if(busy||turn!=='you'||gameOver||discardArmed) return;
    if(deck.length===0){ setStatus('Draw pile is empty'); refreshButtons(); return; }
    if(hands.you.length>=5) return;
    busy=true;
    const card=deck.pop(); hands.you.push(card); drewThisTurn=true;
    log('you',`You drew ${cardText(card)}`);
    render(); highlightDrawn('hand',card.id);
    setTimeout(()=>{ busy=false; setTurnStatus(); refreshButtons(); }, 300);
  }

  function clickHand(id){
    if(turn!=='you'||gameOver||busy||discardArmed) return;
    selHandId=(selHandId===id)?null:id;
    render();
    if(selHandId) setStatus('Press Capture to take all matching cards on the board, or add to your own pile'); else setTurnStatus();
    refreshButtons();
  }

  function attemptCapture(){
    if(turn!=='you'||gameOver||busy) return;
    if(!selHandId){ setTurnStatus(); return; }
    const handCard=hands.you.find(c=>c.id===selHandId);
    const rank=handCard.rank;

    const takeGround = cardsOfRank(ground, rank).length > 0;
    const oppTop = topPile('bot');
    const takeOpp = oppTop && oppTop.rank === rank && !lockedRanks.has(rank);
    const selfTop = topPile('you');
    const takeSelf = selfTop && selfTop.rank === rank && !lockedRanks.has(rank);

    if(!takeGround && !takeOpp && !takeSelf){
      log('sys','Invalid capture.'); 
      setStatus('No matching cards to capture or add to.'); 
      clearSelection(); render(); refreshButtons(); 
      return; 
    }

    busy=true;
    if(!takeGround && !takeOpp && takeSelf){
      addToOwnPile('you', handCard);
    }else{
      doCapture('you', handCard, {ground:takeGround, opp:takeOpp});
    }
    clearSelection(); render(); flashCapture('you');
    setTimeout(()=>{
      refillTo4('you', ()=>{
        busy=false;
        if(endIfDone()) return;
        setTurnStatus();
        refreshButtons();
      });
    }, 460);
  }

  function armDiscard(){
    if(turn!=='you'||gameOver||busy||hands.you.length===0) return;
    clearSelection();
    discardArmed=true;
    setStatus('Select a card to throw onto the Ground');
    setButtons({draw:false,capture:false,discard:false,cancel:true});
    render();
  }
  function clickHandForDiscard(id){
    if(!discardArmed) return;
    const card=hands.you.find(c=>c.id===id); if(!card) return;
    discardArmed=false;
    ground.push(card); hands.you=hands.you.filter(c=>c.id!==card.id);
    log('you',`You threw ${cardText(card)} onto the Ground — turn ends.`);
    render(); highlightDrawn('ground',card.id,'draw-pop');
    endHumanTurn();
  }
  function endHumanTurn(){
    clearSelection(); drewThisTurn=false;
    refillTo4('you', ()=>{ turn='bot'; setTimeout(beginTurn,420); });
  }

  function refillTo4(who, done){
    (function step(){
      if(deck.length>0 && hands[who].length<4){ hands[who].push(deck.pop()); render(); setTimeout(step,150); }
      else { render(); done&&done(); }
    })();
  }

  function refreshButtons(){
    if(turn!=='you'||gameOver){ setButtons({draw:false,capture:false,discard:false,cancel:false}); return; }
    const mustThrow = hands.you.length>=5 || (deck.length===0 && hands.you.length>0);
    
    let canCapture = false;
    if(selHandId){
      const handCard = hands.you.find(c=>c.id===selHandId);
      if(handCard){
        const rank = handCard.rank;
        const takeGround = cardsOfRank(ground, rank).length > 0;
        const oppTop = topPile('bot');
        const takeOpp = oppTop && oppTop.rank === rank && !lockedRanks.has(rank);
        const selfTop = topPile('you');
        const takeSelf = selfTop && selfTop.rank === rank && !lockedRanks.has(rank);
        canCapture = takeGround || takeOpp || takeSelf;
      }
    }

    setButtons({
      draw: deck.length>0 && hands.you.length<5 && !busy && !discardArmed,
      capture: canCapture && !busy && !discardArmed,
      discard: mustThrow && !busy && !discardArmed,
      cancel: (!!selHandId || discardArmed) && !busy
    });
  }
  function setButtons({draw,capture,discard,cancel}){
    document.getElementById('btnDraw').disabled=!draw;
    document.getElementById('btnCapture').disabled=!capture;
    document.getElementById('btnDiscard').disabled=!discard;
    document.getElementById('btnCancel').disabled=!cancel;
  }
  function clearSelection(){ selHandId=null; discardArmed=false; }
  function cancelSelection(){ clearSelection(); render(); setTurnStatus(); refreshButtons(); }

  function botTurn(){
    if(gameOver||turn!=='bot') return;
    busy=true; botStart();
  }
  function botStart(){
    if(deck.length>0 && hands.bot.length<4){ hands.bot.push(deck.pop()); render(); setTimeout(botStart,140); return; }
    if(deck.length>0 && hands.bot.length<5){ const c=deck.pop(); hands.bot.push(c); log('bot','Bot drew a card'); render(); }
    setTimeout(botActLoop, 380);
  }
  function botActLoop(){
    if(gameOver) return;
    let best=null, bestVal=-1;
    for(const hc of hands.bot){
      const r=hc.rank;
      const g=cardsOfRank(ground,r);
      const oppTop = topPile('you');
      const o=(oppTop && oppTop.rank === r && !lockedRanks.has(r)) ? cardsOfRank(collections.you,r) : [];
      if(g.length+o.length>0){
        const val=(g.length+o.length)*cardPoints(r) + (o.length?5:0);
        if(val>bestVal){ bestVal=val; best={hc,ground:g.length>0,opp:o.length>0}; }
      }
    }
    if(best){
      doCapture('bot', best.hc, {ground:best.ground, opp:best.opp});
      render(); flashCapture('bot');
      if(endIfDone()) return;
      setTimeout(()=>{ (function ref(){ if(deck.length>0&&hands.bot.length<4){hands.bot.push(deck.pop());render();setTimeout(ref,150);} else { render(); setTimeout(botActLoop,250);} })(); }, 500);
      return;
    }
    const selfTop = topPile('bot');
    const dup = selfTop && !lockedRanks.has(selfTop.rank) ? hands.bot.find(hc => hc.rank === selfTop.rank) : null;
    if(dup && hands.bot.length>1){
      addToOwnPile('bot', dup); render(); flashCapture('bot');
      if(endIfDone()) return;
      setTimeout(()=>{ (function ref(){ if(deck.length>0&&hands.bot.length<4){hands.bot.push(deck.pop());render();setTimeout(ref,150);} else { render(); setTimeout(botActLoop,250);} })(); }, 460);
      return;
    }
    botDiscard();
  }
  function botDiscard(){
    if(hands.bot.length===0){ busy=false; turn='you'; setTimeout(beginTurn,300); return; }
    const card=hands.bot.reduce((lo,c)=>cardPoints(c.rank)<cardPoints(lo.rank)||(cardPoints(c.rank)===cardPoints(lo.rank)&&c.rank<lo.rank)?c:lo, hands.bot[0]);
    ground.push(card); hands.bot=hands.bot.filter(c=>c.id!==card.id);
    log('bot',`Bot threw ${cardText(card)} onto the Ground — turn ends.`); render();
    (function ref(){ if(deck.length>0&&hands.bot.length<4){hands.bot.push(deck.pop());render();setTimeout(ref,150);} else { render(); busy=false; turn='you'; setTimeout(beginTurn,360);} })();
  }

  function endIfDone(){
    if(deck.length===0 && hands.you.length===0 && hands.bot.length===0){ endGame(); return true; }
    return false;
  }
  function endGame(){
    gameOver=true;
    setButtons({draw:false,capture:false,discard:false,cancel:false});
    updateTurnTag(); setStatus('Game Over');
    const you=scoreOf('you'), bot=scoreOf('bot');
    let title,res;
    if(you>bot){title='You Win! 🏆';res=`You finished ${you} to ${bot}.`;}
    else if(bot>you){title='Bot Wins';res=`Bot finished ${bot} to ${you}.`;}
    else{title="It's a Tie";res=`Both finished on ${you}.`;}
    log('sys',`Game over — You ${you}, Bot ${bot}. Locked sets: ${lockedRanks.size}.`);
    document.getElementById('winTitle').textContent=title;
    document.getElementById('winRes').textContent=res;
    document.getElementById('finalYouScore').textContent=you;
    document.getElementById('finalBotScore').textContent=bot;
    document.getElementById('finalLocks').textContent=lockedRanks.size;
    document.getElementById('finalYou').classList.toggle('win',you>=bot);
    document.getElementById('finalBot').classList.toggle('win',bot>=you);
    document.getElementById('overlay').classList.add('show');
  }

  function cardHTML(c,size=''){
    const colorCls=isRed(c.suit)?'red':'blk';
    const sz=size?(' '+size):'';
    return `<div class="card ${colorCls}${sz}" data-id="${c.id}">
      <div class="tl"><span class="rk">${RANK_LABEL(c.rank)}</span><span class="st">${SUIT_GLYPH[c.suit]}</span></div>
      <div class="mid">${SUIT_GLYPH[c.suit]}</div>
      <div class="br"><span class="rk">${RANK_LABEL(c.rank)}</span><span class="st">${SUIT_GLYPH[c.suit]}</span></div>
    </div>`;
  }

  function render(initial){
    document.getElementById('youScore').textContent=scoreOf('you');
    document.getElementById('botScore').textContent=scoreOf('bot');
    document.getElementById('pileCount').textContent=deck.length;
    document.getElementById('youCount').textContent=hands.you.length;
    document.getElementById('botCount').textContent=hands.bot.length;
    document.getElementById('pileStack').style.opacity=deck.length>0?'1':'.25';

    const g=document.getElementById('ground');
    if(ground.length===0){ g.innerHTML='<div class="empty-note">— empty —</div>'; g.classList.add('empty-row'); }
    else{
      g.classList.remove('empty-row');
      const ranks=groundRanks();
      const handRank = selHandId ? hands.you.find(c=>c.id===selHandId)?.rank : null;
      g.innerHTML=ranks.map(r=>{
        const cards=cardsOfRank(ground,r);
        const picked = (handRank === r);
        return `<div class="pile ${picked?'pick-pile':''}" data-zone="ground" data-rank="${r}">`+
          cards.map(c=>cardHTML(c,'sm')).join('')+`</div>`;
      }).join('');
      if(initial)[...g.children].forEach((el,i)=>{el.classList.add('deal');el.style.animationDelay=(i*0.05)+'s';});
    }

    const h=document.getElementById('hand');
    h.innerHTML=hands.you.length?hands.you.map(c=>cardHTML(c)).join(''):'<div class="empty-note">— empty —</div>';
    h.classList.toggle('empty-row',hands.you.length===0);
    if(initial)[...h.children].forEach((el,i)=>{el.classList.add('deal');el.style.animationDelay=(0.2+i*0.05)+'s';});
    [...h.children].forEach(el=>{ const id=el.getAttribute&&el.getAttribute('data-id'); if(!id)return;
      if(id===selHandId) el.classList.add('pick-hand');
      el.onclick=()=> discardArmed ? clickHandForDiscard(id) : clickHand(id);});

    document.getElementById('oppHand').innerHTML=Array(hands.bot.length).fill('<div class="card-back"></div>').join('');

    renderCollection('you', document.getElementById('youCollection'), false);
    renderCollection('bot', document.getElementById('botCollection'), true);
  }

  function renderCollection(who, el, clickable){
    const col=collections[who];
    if(col.length===0){ el.innerHTML='<div class="empty-note">no cards collected yet</div>'; return; }
    const seq=pileSequence(col);
    const topIdx=seq.length-1;
    const handRank = selHandId ? hands.you.find(c=>c.id===selHandId)?.rank : null;
    el.innerHTML=seq.map((p,idx)=>{
      const isTop = idx===topIdx;
      const locked=lockedRanks.has(p.rank) && isTop ? true : (lockedRanks.has(p.rank) && p.cards.length===4);
      const picked = (clickable && handRank === p.rank && !locked);
      return `<div class="pile ${locked?'locked':''} ${isTop?'toppile':''} ${picked?'pick-pile':''}" data-zone="opp" data-rank="${p.rank}" data-top="${isTop?1:0}">`+
        p.cards.map(c=>cardHTML(c,'sm')).join('')+`</div>`;
    }).join('');
  }

  function highlightDrawn(containerId,cardId,cls='draw-pop'){
    const el=document.querySelector(`#${containerId} .card[data-id="${cardId}"]`); if(el) el.classList.add(cls);
  }
  function flashCapture(who){
    const el = who==='you'?document.getElementById('youCollection'):document.getElementById('botCollection');
    requestAnimationFrame(()=>{ el.querySelectorAll('.card').forEach(c=>c.classList.add('cap-flash')); });
  }

  function setStatus(msg){ document.getElementById('status').innerHTML=msg; }
  function setTurnStatus(){
    if(turn!=='you'||gameOver){ return; }
    if(discardArmed){ setStatus('Select a card to throw onto the Ground'); return; }
    if(hands.you.length>=5){ setStatus('Throw a Card to end your turn — or capture first'); }
    else if(deck.length===0 && hands.you.length>0){ setStatus('Throw a Card to end your turn — or capture first'); }
    else if(deck.length===0){ setStatus('Your Turn'); }
    else { setStatus('Draw a Card'); }
  }
  function updateTurnTag(){
    const tag=document.getElementById('turnTag');
    if(gameOver){tag.className='turn-tag bot';tag.textContent='Game Over';return;}
    if(turn==='you'){tag.className='turn-tag you';tag.textContent='Your Turn';}
    else{tag.className='turn-tag bot';tag.textContent='Bot Turn';}
  }

  document.getElementById('btnDraw').onclick=playerDraw;
  document.getElementById('btnCapture').onclick=attemptCapture;
  document.getElementById('btnDiscard').onclick=armDiscard;
  document.getElementById('btnCancel').onclick=cancelSelection;
  
  document.getElementById('btnPlayAgain').onclick=newGame;
  
  document.getElementById('btnExit').onclick = () => { if(config.onExit) config.onExit(); };
  document.getElementById('btnExitModal').onclick = () => { if(config.onExit) config.onExit(); };

  newGame();

  return () => {
    container.innerHTML = '';
  };
}
