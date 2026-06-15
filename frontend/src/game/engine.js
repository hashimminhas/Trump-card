import { TEMPLATE } from './template.js';

/**
 * Mounts the complete Electron Card game (Phase 2, untouched rules) into `root`.
 * opts.cloud  - optional { listRecords():Promise<rec[]>, saveMatch(rec):Promise, presence(status):void }
 * opts.onExit - optional callback; shows a "Back to account" button on the game hub
 * Returns an unmount() cleanup function.
 */
export function mountElectronGame(root, opts = {}) {
const { cloud = null, onExit = null, historyCap = 0 } = opts;
root.innerHTML = TEMPLATE;
/* =====================================================
   ELECTRON CARD - PHASE 2
   Layers: rules · ai · audio · fx · flow · replay · stats · screens
   All Phase 1 rules preserved.
===================================================== */

/* ---------- utilities ---------- */
const $=id=>document.getElementById(id);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;}}

/* ---------- safe storage ---------- */
const memStore={};
const store={
  get(k){try{const v=window.localStorage.getItem(k);return v?JSON.parse(v):(memStore[k]??null);}catch(e){return memStore[k]??null;}},
  set(k,v){memStore[k]=v;try{window.localStorage.setItem(k,JSON.stringify(v));}catch(e){}}
};

/* ---------- card model ---------- */
const SEATS=['A','B','C','D'];
const TEAM=s=>(s==='A'||s==='C')?'AC':'BD';
const SUITS=['S','H','D','C'];
const GLYPH={S:'♠',H:'♥',D:'♦',C:'♣'};
const SUITNAME={S:'Spades',H:'Hearts',D:'Diamonds',C:'Clubs'};
const isRed=s=>s==='H'||s==='D';
const RLAB=r=>({11:'J',12:'Q',13:'K',14:'A'})[r]||String(r);
function newDeck(){const d=[];for(const s of SUITS)for(let r=2;r<=14;r++)d.push({suit:s,rank:r});return d;}
function shuffleDeck(d,rng){for(let i=d.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[d[i],d[j]]=[d[j],d[i]];}return d;}
const sameCard=(a,b)=>a.suit===b.suit&&a.rank===b.rank;
const seatName=s=>s==='A'?'You':s;

/* ---------- settings ---------- */
const settings=Object.assign(
  {botDelay:3000,humanTimer:true,aceRule:true,sound:true,difficulty:'normal',rm:false,cb:false,lt:false},
  store.get('ec.settings.v1')||{});
function saveSettings(){store.set('ec.settings.v1',settings);}
function applyA11y(){
  document.body.classList.toggle('rm',settings.rm);
  document.body.classList.toggle('cb',settings.cb);
  document.body.classList.toggle('lt',settings.lt);
}

/* ---------- audio (synth, no assets) ---------- */
const Snd={
  ctx:null,
  ensure(){if(!settings.sound)return null;
    if(!this.ctx){try{this.ctx=new (window.AudioContext||window.webkitAudioContext)();}catch(e){return null;}}
    if(this.ctx.state==='suspended')this.ctx.resume();
    return this.ctx;},
  tone(f,t0,dur,type='sine',g=.08){const c=this.ensure();if(!c)return;
    const o=c.createOscillator(),gn=c.createGain();
    o.type=type;o.frequency.value=f;
    gn.gain.setValueAtTime(g,c.currentTime+t0);
    gn.gain.exponentialRampToValueAtTime(.0001,c.currentTime+t0+dur);
    o.connect(gn);gn.connect(c.destination);
    o.start(c.currentTime+t0);o.stop(c.currentTime+t0+dur+.05);},
  play(n){if(!settings.sound)return;
    switch(n){
      case 'card':this.tone(170+Math.random()*70,0,.06,'triangle',.055);break;
      case 'click':this.tone(880,0,.035,'square',.025);break;
      case 'trump':this.tone(150,0,.2,'sine',.12);this.tone(300,.03,.14,'sine',.05);break;
      case 'collect':[440,587,784].forEach((f,i)=>this.tone(f,i*.09,.2,'sine',.085));break;
      case 'win':[523,659,784,1047].forEach((f,i)=>this.tone(f,i*.14,.34,'sine',.1));break;
      case 'draw':this.tone(392,0,.26,'sine',.06);this.tone(311,.2,.4,'sine',.06);break;
    }}
};
const _clickSnd=e=>{if(e.target.closest('button'))Snd.play('click');};
document.addEventListener('click',_clickSnd,true);

/* ---------- fx particles ---------- */
function burst(x,y,colors,n=26,spread=130){
  if(settings.rm||matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  const layer=$('fx-layer');
  for(let i=0;i<n;i++){
    const p=document.createElement('div');p.className='pt';
    const a=Math.random()*Math.PI*2,d=spread*(.35+Math.random()*.85);
    p.style.left=x+'px';p.style.top=y+'px';
    const col=colors[i%colors.length];
    p.style.background=col;p.style.color=col;
    p.style.setProperty('--dx',(Math.cos(a)*d)+'px');
    p.style.setProperty('--dy',(Math.sin(a)*d-46)+'px');
    p.style.animationDuration=(0.7+Math.random()*0.6)+'s';
    layer.appendChild(p);setTimeout(()=>p.remove(),1500);
  }
}
function burstAt(el,colors,n,spread){const r=el.getBoundingClientRect();burst(r.left+r.width/2,r.top+r.height/2,colors,n,spread);}
function khotiBurst(){
  const w=innerWidth,h=innerHeight;
  [[.5,.4],[.25,.3],[.75,.3],[.35,.6],[.65,.6]].forEach((p,i)=>
    setTimeout(()=>burst(w*p[0],h*p[1],['#F2B33D','#FFD37A','#E9E4D8'],34,190),i*180));
}

/* =====================================================
   GAME STATE & RULES
===================================================== */
let G=null, token=0, humanResolve=null, humanTimerInt=null;

function freshState(){
  const lastDealer=store.get('ec.dealer')??-1;
  const dealerIdx=(lastDealer+1)%4;
  store.set('ec.dealer',dealerIdx);
  const seed=(Date.now()^(Math.random()*0xFFFFFFF))>>>0;
  return{
    seed,rng:mulberry32(seed),
    dealer:SEATS[dealerIdx],chooser:SEATS[(dealerIdx+1)%4],
    trump:null,hands:{A:[],B:[],C:[],D:[]},
    round:0,senior:null,seniorAtStart:null,
    leadSeat:null,leadSuit:null,trick:[],
    pile:[],banks:{AC:[],BD:[]},lastCollectRound:-10,
    aceLock:null,rounds:[],collections:[],misdeals:0,over:false,
    t0:Date.now(),
    mem:freshMemory()
  };
}
function freshMemory(){return{played:[],trumps:0,voids:{A:{},B:{},C:{},D:{}}};}

function legalMoves(seat){
  const hand=G.hands[seat];
  if(G.trick.length===0){
    if(settings.aceRule&&G.aceLock===seat&&G.round<11){
      const non=hand.filter(c=>c.rank!==14);
      if(non.length)return non;
    }
    return hand.slice();
  }
  const follow=hand.filter(c=>c.suit===G.leadSuit);
  return follow.length?follow:hand.slice();
}
function beats(a,b){
  if(a.suit===G.trump&&b.suit!==G.trump)return true;
  if(a.suit!==G.trump&&b.suit===G.trump)return false;
  if(a.suit===b.suit)return a.rank>b.rank;
  return false;
}
function trickWinner(trick){let best=trick[0];for(let i=1;i<trick.length;i++)if(beats(trick[i].card,best.card))best=trick[i];return best;}
const strength=c=>(c.suit===G.trump?100:0)+c.rank;

/* =====================================================
   AI - three brains over shared card memory
   Note: the leader of every round IS the potential collector
   (winner becomes Senior and Senior leads), so leading = defending.
===================================================== */
function memSeen(suit,rank,seat){
  return G.mem.played.some(c=>c.suit===suit&&c.rank===rank)||
         G.hands[seat].some(c=>c.suit===suit&&c.rank===rank);
}
function isBoss(card,seat){ // no higher card of this suit unaccounted for
  for(let r=card.rank+1;r<=14;r++)if(!memSeen(card.suit,r,seat))return false;
  return true;
}
function oppVoidIn(seat,suit){
  return SEATS.some(o=>TEAM(o)!==TEAM(seat)&&G.mem.voids[o][suit]);
}
function trumpsOutside(seat){
  const mine=G.hands[seat].filter(c=>c.suit===G.trump).length;
  return 13-G.mem.trumps-mine;
}
const lowestOf=arr=>[...arr].sort((a,b)=>strength(a)-strength(b))[0];
const highestOf=arr=>[...arr].sort((a,b)=>strength(b)-strength(a))[0];
function dumpCard(seat,legal){ // cheapest discard, prefer non-trump, prefer non-boss
  const nt=legal.filter(c=>c.suit!==G.trump);
  const pool=nt.length?nt:legal;
  const nonBoss=pool.filter(c=>!isBoss(c,seat));
  return lowestOf(nonBoss.length?nonBoss:pool);
}

function botPick(seat){
  const legal=legalMoves(seat);
  if(legal.length===1)return legal[0];
  if(settings.difficulty==='easy')return botEasy(seat,legal);
  if(settings.difficulty==='hard')return botHard(seat,legal);
  return botNormal(seat,legal);
}

function botEasy(seat,legal){
  if(Math.random()<.35)return legal[Math.floor(Math.random()*legal.length)];
  if(G.trick.length===0)return lowestOf(legal);
  const win=trickWinner(G.trick);
  if(TEAM(win.seat)===TEAM(seat))return lowestOf(legal);
  const winners=legal.filter(c=>beats(c,win.card));
  if(winners.length&&Math.random()<.55)return lowestOf(winners);
  return lowestOf(legal);
}

function botNormal(seat,legal){
  const asc=[...legal].sort((a,b)=>strength(a)-strength(b));
  if(G.trick.length===0){
    if(G.round>=3&&G.pile.length>=8)return highestOf(legal); // defending a fat pile
    const strongNT=legal.filter(c=>c.suit!==G.trump&&c.rank>=13);
    if(strongNT.length)return highestOf(strongNT);
    const nt=asc.filter(c=>c.suit!==G.trump);
    return nt.length?nt[0]:asc[0];
  }
  const win=trickWinner(G.trick);
  if(TEAM(win.seat)===TEAM(seat))return dumpCard(seat,legal);
  const winners=legal.filter(c=>beats(c,win.card)).sort((a,b)=>strength(a)-strength(b));
  return winners.length?winners[0]:dumpCard(seat,legal);
}

function botHard(seat,legal){
  const stage=G.round<=2?'early':(G.round<=9?'mid':'late');
  /* ---- LEADING (always the potential collector from R3) ---- */
  if(G.trick.length===0){
    const stake=G.pile.length+4;
    // prefer boss cards in suits opponents can't trump-steal
    const bosses=legal.filter(c=>isBoss(c,seat));
    const safeBosses=bosses.filter(c=>c.suit===G.trump||!oppVoidIn(seat,c.suit));
    if(G.round>=3){
      if(safeBosses.length){
        // with a big stake spend the strongest boss; small stake spend the cheapest boss
        return stake>=12?highestOf(safeBosses):lowestOf(safeBosses);
      }
      // pull trumps if I control them and opponents may still hold some
      const myTr=legal.filter(c=>c.suit===G.trump);
      if(myTr.length&&trumpsOutside(seat)>0&&isBoss(highestOf(myTr),seat)&&stake>=8)
        return highestOf(myTr);
      if(stake>=12)return highestOf(legal); // desperate defense
      // small stake: probe with a low card from a safe suit
      const safeLow=legal.filter(c=>c.suit!==G.trump&&!oppVoidIn(seat,c.suit));
      return safeLow.length?lowestOf(safeLow):dumpCard(seat,legal);
    }
    // early rounds: probe low, preserve bosses
    const nb=legal.filter(c=>!isBoss(c,seat)&&c.suit!==G.trump);
    return nb.length?lowestOf(nb):dumpCard(seat,legal);
  }
  /* ---- FOLLOWING ---- */
  const win=trickWinner(G.trick);
  const partnerWinning=TEAM(win.seat)===TEAM(seat);
  const last=G.trick.length===3;
  const lead=G.trick[0].seat;
  const oppCollecting=G.round>=3&&TEAM(lead)!==TEAM(seat); // opponent leads = their collection is live
  const stake=G.pile.length+4;
  if(partnerWinning){
    // never overtake the partner; if partner leads (our collection) protect by dumping low
    if(last||win.card.rank>=12||isBoss(win.card,seat))return dumpCard(seat,legal);
    // partner winning weakly and opponents still to play: reinforce only if cheap insurance exists
    const winners=legal.filter(c=>beats(c,win.card)&&c.suit===G.leadSuit);
    if(winners.length&&!oppCollecting&&stage!=='early'&&stake>=12&&TEAM(lead)!==TEAM(seat))
      return lowestOf(winners);
    return dumpCard(seat,legal);
  }
  // opponent currently winning
  const winners=legal.filter(c=>beats(c,win.card)).sort((a,b)=>strength(a)-strength(b));
  if(winners.length){
    // breaking a live opponent collection is top priority; pay more when the stake is fat
    if(oppCollecting)return winners[0];
    // otherwise take it minimally - but early on, don't burn bosses on a 4-card trick
    if(stage==='early'&&isBoss(winners[0],seat)&&winners[0].rank>=13&&stake<=8&&!last)
      return dumpCard(seat,legal);
    return winners[0];
  }
  return dumpCard(seat,legal);
}

function botTrumpChoice(seat){
  const five=G.hands[seat];let best=null,bs=-1;
  for(const s of SUITS){
    const cs=five.filter(c=>c.suit===s);
    const sc=cs.length*20+cs.reduce((a,c)=>a+c.rank,0);
    if(sc>bs){bs=sc;best=s;}
  }
  return best;
}

/* =====================================================
   DOM HELPERS
===================================================== */
function cardEl(card,mini=false,trump=(G&&G.trump)){
  const el=document.createElement('div');
  el.className='card su-'+card.suit+' '+(isRed(card.suit)?'red':'blk')+(mini?' mini':'');
  if(trump&&card.suit===trump)el.classList.add('trumpc');
  el.innerHTML=`<div class="corner">${RLAB(card.rank)}<small>${GLYPH[card.suit]}</small></div>
    <div class="big">${GLYPH[card.suit]}</div>
    <div class="corner br">${RLAB(card.rank)}<small>${GLYPH[card.suit]}</small></div>`;
  return el;
}
function show(id){document.querySelectorAll('.screen').forEach(s=>s.classList.remove('show'));$(id).classList.add('show');}
function goHome(){cloud&&cloud.presence&&cloud.presence('online');token++;stopReplay();clearHumanTimer();show('screen-home');renderHomeStats();}
function quitMatch(){if(confirm('Quit this match? It will not be saved.'))goHome();}
function showRules(){show('screen-game');$('rules-overlay').classList.add('show');$('rules-overlay').dataset.fromHome='1';}
function hideRules(){$('rules-overlay').classList.remove('show');if($('rules-overlay').dataset.fromHome==='1'){$('rules-overlay').dataset.fromHome='';goHome();}}
function renderHomeStats(){
  const h=store.get('ec.history.v1')||[];
  const k=h.filter(m=>m.result!=='DRAW').length;
  $('home-stats').textContent=h.length?`${h.length} match${h.length>1?'es':''} played · KHOTI achieved: ${k}`:'No matches yet - the pile awaits.';
}
let bannerT=null;
function banner(html,ms=1600,cls=''){
  const b=$('banner');b.className='banner show '+cls;b.innerHTML=html;
  clearTimeout(bannerT);
  if(ms>0)bannerT=setTimeout(()=>b.classList.remove('show'),ms);
}
function setStatus(t){$('pc-status').textContent=t||'';}
function setActive(seat){SEATS.forEach(s=>$('seat-'+s).classList.toggle('active',s===seat));}
function setThinking(seat,on){
  $('seat-'+seat).classList.toggle('thinking-on',on);
  if(on)setStatus(seat+' thinking…');else setStatus('');
}

/* ---------- HUD ---------- */
function renderHUD(){
  $('hud-trump-g').innerHTML=G.trump?`<span style="color:${isRed(G.trump)?'var(--suit-red)':'#D9DCE6'}">${GLYPH[G.trump]}</span>`:'-';
  $('hud-round').textContent=`R ${G.round}/13`;
  const rt=$('round-track');rt.innerHTML='';
  for(let i=1;i<=13;i++){
    const s=document.createElement('span');s.className='seg-r';
    const col=G.collections.find(c=>c.round===i);
    if(col)s.classList.add(col.team==='AC'?'col-ac':'col-bd');
    else if(i<G.round)s.classList.add('done');
    else if(i===G.round)s.classList.add('cur');
    rt.appendChild(s);
  }
  const ac=G.banks.AC.length,bd=G.banks.BD.length;
  $('cnt-ac').textContent=ac;$('cnt-bd').textContent=bd;
  $('bar-ac').style.width=(ac/52*100)+'%';
  $('bar-bd').style.width=(bd/52*100)+'%';
  const kc=$('khoti-chip');
  if(ac>0&&bd>0){kc.className='chip khoti-chip dead';kc.textContent='KHOTI OFF';}
  else{kc.className='chip khoti-chip live';kc.textContent='KHOTI LIVE';}
  renderPile();renderSeats();
}
function renderPile(){
  const pc=$('pile-core');
  if(G.trump){
    $('pc-trump-g').textContent=GLYPH[G.trump];
    $('pc-trump-g').style.color=isRed(G.trump)?'var(--suit-red)':'#D9DCE6';
    $('pc-trump-n').textContent=SUITNAME[G.trump];
  }else{$('pc-trump-g').textContent='-';$('pc-trump-g').style.color='';$('pc-trump-n').textContent='';}
  $('pc-round').textContent=G.round>0?`Round ${G.round} / 13`:'Round - / 13';
  $('pc-senior').textContent='Senior: '+(G.senior?seatName(G.senior):'-');
  $('pile-count').textContent=G.pile.length;
  $('pile-sub').textContent=G.round<3?'collection from R3':'Senior collects on win';
  const n=G.pile.length;
  pc.style.boxShadow=n?`0 0 ${10+n*2.2}px rgba(242,179,61,${Math.min(.12+n*.022,.65)})`:'none';
  pc.classList.toggle('live',G.round>=3&&!G.over);
}
function renderSeats(){
  for(const s of SEATS){
    const el=$('seat-'+s);
    el.classList.toggle('senior',G.senior===s);
    $('cl-'+s)&&($('cl-'+s).textContent=G.hands[s].length?G.hands[s].length+' cards':'');
    const tag=$('tag-'+s);
    if(tag){
      if(G.dealer===s&&G.chooser===s){tag.style.display='';tag.className='tag tc';tag.textContent='DEALER · TC';}
      else if(G.dealer===s){tag.style.display='';tag.className='tag';tag.textContent='DEALER';}
      else if(G.chooser===s){tag.style.display='';tag.className='tag tc';tag.textContent='TRUMP CHOOSER';}
      else tag.style.display='none';
    }
  }
}

/* ---------- hand + keyboard ---------- */
let kbCards=[],kbIdx=-1;
function renderHand(interactive=false,legal=[]){
  const h=$('hand');h.innerHTML='';kbCards=[];kbIdx=-1;
  const hand=[...G.hands.A].sort((a,b)=>SUITS.indexOf(a.suit)-SUITS.indexOf(b.suit)||b.rank-a.rank);
  hand.forEach((c,i)=>{
    const el=cardEl(c);
    el.classList.add('deal-in');el.style.animationDelay=(i*0.03)+'s';
    if(interactive){
      const ok=legal.some(l=>sameCard(l,c));
      el.classList.add(ok?'legal':'illegal');
      if(ok){
        el.classList.add('lifted');
        el.onclick=()=>{if(humanResolve){const r=humanResolve;humanResolve=null;r(c);}};
        kbCards.push({card:c,el});
      }
      if(settings.aceRule&&!ok&&c.rank===14&&G.trick.length===0&&G.aceLock==='A'){
        const lk=document.createElement('span');lk.className='ace-lock';lk.textContent='LOCK';
        el.appendChild(lk);
      }
    }
    h.appendChild(el);
  });
}
const _kbHandler=e=>{
  if(!humanResolve||!kbCards.length)return;
  if(e.key==='ArrowRight'||e.key==='ArrowLeft'){
    e.preventDefault();
    const d=e.key==='ArrowRight'?1:-1;
    kbIdx=kbIdx<0?(d>0?0:kbCards.length-1):(kbIdx+d+kbCards.length)%kbCards.length;
    kbCards.forEach((o,i)=>o.el.classList.toggle('kb-sel',i===kbIdx));
  }else if(e.key==='Enter'){
    e.preventDefault();
    (kbCards[kbIdx>=0?kbIdx:0]).el.click();
  }
};
document.addEventListener('keydown',_kbHandler);

/* ---------- human timer ---------- */
function clearHumanTimer(){clearInterval(humanTimerInt);humanTimerInt=null;$('seat-A').classList.remove('timed');$('timer-ring').style.background='';}
function startHumanTimer(onTimeout){
  if(!settings.humanTimer)return;
  const total=60000;let left=total;
  $('seat-A').classList.add('timed');
  humanTimerInt=setInterval(()=>{
    left-=100;
    const pct=Math.max(left/total,0)*360;
    const col=left<10000?'var(--danger)':'var(--charge)';
    $('timer-ring').style.background=`conic-gradient(${col} ${pct}deg, rgba(255,255,255,.07) 0deg)`;
    if(left<=0){clearHumanTimer();onTimeout();}
  },100);
}

/* =====================================================
   MATCH FLOW
===================================================== */
async function startMatch(){
  cloud&&cloud.presence&&cloud.presence('in_match');
  token++;const my=token;
  stopReplay();clearHumanTimer();
  G=freshState();
  show('screen-game');
  SEATS.forEach(s=>{$('slot-'+s).innerHTML='';});
  $('hand').innerHTML='';
  renderHUD();
  await runDeal(my);
}

async function runDeal(my){
  if(my!==token)return;
  const order=[];const di=SEATS.indexOf(G.dealer);
  for(let i=1;i<=4;i++)order.push(SEATS[(di+i)%4]);
  const deck=shuffleDeck(newDeck(),G.rng);
  G.hands={A:[],B:[],C:[],D:[]};
  G.mem=freshMemory();
  let ptr=0;
  banner(`<b>${G.dealer}</b> deals · <span class="accent">${G.chooser}</span> will choose trump`,2200);
  for(const s of order)for(let k=0;k<5;k++)G.hands[s].push(deck[ptr++]);
  renderHand(false,[]);renderHUD();
  await sleep(1500);if(my!==token)return;

  if(G.chooser==='A'){
    const suit=await humanTrumpSelect();
    if(my!==token)return;
    G.trump=suit;
  }else{
    banner(`<span class="accent">${G.chooser}</span> is choosing trump…`,0);
    setThinking(G.chooser,true);
    await sleep(settings.botDelay);
    setThinking(G.chooser,false);
    if(my!==token)return;
    G.trump=botTrumpChoice(G.chooser);
  }
  Snd.play('trump');
  banner(`Trump is <span class="accent" style="font-size:18px;">${GLYPH[G.trump]} ${SUITNAME[G.trump]}</span>`,1800);
  renderHUD();renderHand(false,[]);
  await sleep(1100);if(my!==token)return;

  for(let w=0;w<2;w++){for(const s of order)for(let k=0;k<4;k++)G.hands[s].push(deck[ptr++]);}
  renderHand(false,[]);renderHUD();
  await sleep(700);if(my!==token)return;

  const bad=SEATS.find(s=>!G.hands[s].some(c=>c.suit===G.trump));
  if(bad){
    G.misdeals++;
    banner(`<b style="color:var(--danger)">Misdeal</b> - ${bad==='A'?'you hold':bad+' holds'} no trumps. Reshuffling…<small>every player must hold at least one trump</small>`,2400);
    await sleep(2400);if(my!==token)return;
    G.trump=null;renderHUD();
    return runDeal(my);
  }

  G.senior=G.chooser;
  renderHUD();
  banner(`<span class="accent">⚡ ${G.senior==='A'?'You start':G.senior+' starts'} as Senior</span><small>winner of each round takes the Senior seat</small>`,2200);
  await sleep(1700);if(my!==token)return;
  await runRound(my);
}

function humanTrumpSelect(){
  return new Promise(res=>{
    const ov=$('trump-overlay');ov.classList.add('show');
    const tc=$('ts-cards');tc.innerHTML='';
    const five=[...G.hands.A].sort((a,b)=>SUITS.indexOf(a.suit)-SUITS.indexOf(b.suit)||b.rank-a.rank);
    const nodes=five.map(c=>{const e=cardEl(c,false,null);tc.appendChild(e);return{c,e};});
    const sr=$('suit-row');sr.innerHTML='';
    for(const s of SUITS){
      const n=five.filter(c=>c.suit===s).length;
      const b=document.createElement('button');
      b.className='suit-btn '+(isRed(s)?'red':'blk');
      b.innerHTML=`<span class="g">${GLYPH[s]}</span><span class="n">${n} in hand</span>`;
      b.onmouseenter=()=>nodes.forEach(o=>o.e.classList.toggle('hl',o.c.suit===s));
      b.onmouseleave=()=>nodes.forEach(o=>o.e.classList.remove('hl'));
      b.onclick=()=>{ov.classList.remove('show');res(s);};
      sr.appendChild(b);
    }
  });
}

async function runRound(my){
  if(my!==token)return;
  G.round++;
  G.seniorAtStart=G.senior;
  G.leadSeat=G.senior;
  G.leadSuit=null;G.trick=[];
  SEATS.forEach(s=>$('slot-'+s).innerHTML='');
  renderHUD();
  const order=[];const li=SEATS.indexOf(G.leadSeat);
  for(let i=0;i<4;i++)order.push(SEATS[(li+i)%4]);
  for(const seat of order){
    if(my!==token)return;
    setActive(seat);
    let card;
    if(seat==='A'){
      const legal=legalMoves('A');
      renderHand(true,legal);
      setStatus('Your turn');
      card=await new Promise(res=>{
        humanResolve=res;
        startHumanTimer(()=>{
          if(humanResolve){
            const lows=[...legal].sort((a,b)=>strength(a)-strength(b));
            const r=humanResolve;humanResolve=null;
            banner('Time! Auto-played your lowest legal card.',1500);
            r(lows[0]);
          }
        });
      });
      clearHumanTimer();setStatus('');
      if(my!==token)return;
    }else{
      setThinking(seat,true);
      await sleep(settings.botDelay);
      setThinking(seat,false);
      if(my!==token)return;
      card=botPick(seat);
    }
    playCard(seat,card);
  }
  setActive(null);
  await resolveRound(my);
}

function playCard(seat,card){
  const hand=G.hands[seat];
  hand.splice(hand.findIndex(c=>sameCard(c,card)),1);
  // memory updates
  if(G.trick.length>0&&card.suit!==G.leadSuit)G.mem.voids[seat][G.leadSuit]=true;
  G.mem.played.push(card);
  if(card.suit===G.trump)G.mem.trumps++;
  G.trick.push({seat,card});
  if(G.trick.length===1){
    G.leadSuit=card.suit;
    if(card.rank!==14)G.aceLock=null;
  }
  Snd.play('card');
  const slot=$('slot-'+seat);slot.innerHTML='';
  const el=cardEl(card);el.classList.add('fly-'+seat);
  slot.appendChild(el);
  if(seat==='A')renderHand(false,[]);
  renderSeats();
}

async function resolveRound(my){
  const win=trickWinner(G.trick);
  for(const p of G.trick){
    const el=$('slot-'+p.seat).firstChild;
    if(!el)continue;
    if(p.seat===win.seat)el.classList.add('win-glow');else el.classList.add('dimmed');
  }
  const why=win.card.suit===G.trump?'highest trump':'highest of lead suit';
  await sleep(950);if(my!==token)return;
  G.trick.forEach(p=>G.pile.push(p.card));

  let collected=false;
  const onCooldown=(G.round===G.lastCollectRound+1);
  if(G.round>=3 && win.seat===G.seniorAtStart && (!onCooldown||G.round===13)){
    collected=true;
    const team=TEAM(win.seat);
    const n=G.pile.length;
    G.banks[team].push(...G.pile);
    G.collections.push({round:G.round,seat:win.seat,team,cards:n});
    for(const p of G.trick){
      const el=$('slot-'+p.seat).firstChild;
      if(el){el.classList.remove('win-glow','dimmed');el.classList.add(team==='AC'?'sweep-ac':'sweep-bd');}
    }
    $('pile-core').classList.add('flash');
    setTimeout(()=>$('pile-core').classList.remove('flash'),950);
    Snd.play('collect');
    burstAt($('pile-core'),[team==='AC'?'#E0A93E':'#4FB6C9','#FFD37A'],28,150);
    banner(`<span class="accent" style="font-size:17px;">⚡ ${win.seat==='A'?'YOU COLLECT':win.seat+' COLLECTS'} ${n}</span><small>Team ${team} banks the entire pile</small>`,2300,'collect');
    G.pile=[];G.lastCollectRound=G.round;
  }else{
    for(const p of G.trick){
      const el=$('slot-'+p.seat).firstChild;
      if(el){el.classList.remove('win-glow','dimmed');el.classList.add('sink');}
    }
    const reason=G.round<3?'no collection before Round 3':`Senior seat broken - ${win.seat} wasn't Senior at round start`;
    banner(`<b>${win.seat==='A'?'You win':win.seat+' wins'} R${G.round}</b> (${why})<small>pile charges to ${G.pile.length} · ${reason}</small>`,2100);
  }

  G.rounds.push({
    n:G.round,lead:G.leadSeat,leadSuit:G.leadSuit,
    plays:G.trick.map(p=>({seat:p.seat,card:p.card})),
    winner:win.seat,winCard:win.card,collected,
    pileAfter:collected?0:G.pile.length,
    totals:{AC:G.banks.AC.length,BD:G.banks.BD.length}
  });

  if(settings.aceRule){
    if(win.card.rank===14&&G.round+1<11)G.aceLock=win.seat;
    else if(G.round+1>=11)G.aceLock=null;
  }
  G.senior=win.seat;
  renderHUD();
  await sleep(collected?1700:1200);if(my!==token)return;
  SEATS.forEach(s=>$('slot-'+s).innerHTML='');
  if(G.round>=13)endMatch();
  else runRound(my);
}

/* =====================================================
   MATCH END · INSIGHTS · SUMMARY
===================================================== */
let lastRec=null;

function analyze(rec){
  const out={};
  const cols=rec.collections;
  out.biggest=cols.length?cols.reduce((a,b)=>b.cards>a.cards?b:a):null;
  // round KHOTI died (both teams have banked)
  let ac=false,bd=false;out.khotiDead=null;
  for(const c of cols){if(c.team==='AC')ac=true;else bd=true;if(ac&&bd){out.khotiDead=c.round;break;}}
  // biggest slipped pile: lead (=Senior at start) failed to win with a fat stake
  out.slip=null;
  rec.rounds.forEach((r,i)=>{
    if(r.n<3||r.winner===r.lead)return;
    const stake=(i===0?0:rec.rounds[i-1].pileAfter)+4;
    if(!out.slip||stake>out.slip.stake){
      out.slip={round:r.n,lead:r.lead,winner:r.winner,stake,
        sameTeam:TEAM(r.winner)===TEAM(r.lead)};
    }
  });
  return out;
}
function insightText(rec){
  const a=analyze(rec);
  const P=[];
  if(rec.result==='DRAW'){
    P.push(`No team swept all 52 cards, so the match ends in a draw - final banks ${rec.score.AC}–${rec.score.BD}.`);
  }else{
    const t=rec.result==='KHOTI_AC'?'AC':'BD';
    P.push(`Team ${t} achieved KHOTI - every collection of the match went their way, banking all 52 cards.`);
  }
  if(a.khotiDead)P.push(`The sweep died at Round ${a.khotiDead}: once both teams had banked cards, a draw was mathematically locked in.`);
  if(a.biggest)P.push(`Biggest haul: ${seatName(a.biggest.seat)} held the Senior seat through Round ${a.biggest.round} and banked a ${a.biggest.cards}-card pile for Team ${a.biggest.team}.`);
  if(a.slip&&a.slip.stake>=12){
    P.push(a.slip.sameTeam
      ?`Biggest miss: at Round ${a.slip.round}, ${seatName(a.slip.lead)} was one trick from banking ${a.slip.stake}, but partner ${a.slip.winner} took the trick - same team, but the collection clock reset.`
      :`Biggest swing: at Round ${a.slip.round}, ${seatName(a.slip.lead)} was one trick from banking ${a.slip.stake} when ${seatName(a.slip.winner)} broke the Senior seat and stole the momentum.`);
  }
  if(rec.score.stranded)P.push(`${rec.score.stranded} cards were stranded in the pile at the end - banked by no one.`);
  if(!rec.collections.length)P.push(`Remarkably, no collection happened all match - the Senior seat changed hands every single round from Round 3 on.`);
  return P;
}

function endMatch(){
  G.over=true;clearHumanTimer();
  const ac=G.banks.AC.length,bd=G.banks.BD.length,stranded=G.pile.length;
  let result='DRAW';
  if(ac===52)result='KHOTI_AC';
  if(bd===52)result='KHOTI_BD';
  const rec={
    id:'m'+Date.now(),date:new Date().toISOString(),seed:G.seed,
    dealer:G.dealer,chooser:G.chooser,trump:G.trump,
    result,score:{AC:ac,BD:bd,stranded},
    collections:G.collections,rounds:G.rounds,misdeals:G.misdeals,
    aceRule:settings.aceRule,difficulty:settings.difficulty,
    durationMs:Date.now()-G.t0
  };
  const hist=store.get('ec.history.v1')||[];
  hist.unshift(rec);
  if(historyCap>0&&hist.length>historyCap)hist.length=historyCap;
  store.set('ec.history.v1',hist);
  lastRec=rec;
  cloud&&cloud.presence&&cloud.presence('online');
  cloud&&cloud.saveMatch&&cloud.saveMatch(rec).catch(()=>{});

  const r=$('sum-result');
  if(result==='DRAW'){
    r.className='sum-result';r.textContent='DRAW';
    $('sum-sub').textContent='Only a 52–0 sweep wins. The table resets.';
    Snd.play('draw');
  }else{
    r.className='sum-result khoti';r.textContent='KHOTI';
    $('sum-sub').textContent=`Team ${result==='KHOTI_AC'?'AC':'BD'} swept all 52 cards. A perfect run.`;
    Snd.play('win');setTimeout(khotiBurst,250);
  }
  $('sum-ac').textContent=ac;$('sum-bd').textContent=bd;
  $('sum-stranded').textContent=stranded?`${stranded} cards stranded in the pile - banked by no one`:'No cards stranded - every card was banked';
  const tl=$('sum-timeline');tl.innerHTML='';
  for(let i=1;i<=13;i++){
    const col=G.collections.find(c=>c.round===i);
    const t=document.createElement('div');t.className='tick'+(col?(' '+col.team.toLowerCase()):'');
    t.style.height=(col?Math.min(14+col.cards*2.6,64):12)+'px';
    if(col)t.title=`R${i}: ${col.seat} banked ${col.cards}`;
    t.innerHTML=`<span class="rn">${i}</span>`;
    tl.appendChild(t);
  }
  $('sum-insights').innerHTML='<h4>WHY THIS GAME ENDED THIS WAY</h4>'+insightText(rec).map(s=>`<p>${s}</p>`).join('');
  $('btn-view-report').onclick=()=>showReport(rec,'screen-summary');
  $('btn-sum-replay').onclick=()=>openReplay(rec,'screen-summary');
  show('screen-summary');
  renderHomeStats();
}

/* =====================================================
   HISTORY & REPORT
===================================================== */
function showHistory(){
  const list=$('history-list');list.innerHTML='';
  const hist=store.get('ec.history.v1')||[];
  if(!hist.length)list.innerHTML='<div class="empty-note">No matches yet. Play one - every game becomes a permanent record here.</div>';
  for(const m of hist){
    const b=document.createElement('button');
    b.className='match-card'+(m.result!=='DRAW'?' khoti-m':'');
    const d=new Date(m.date);
    const res=m.result==='DRAW'?`Draw · ${m.score.AC}–${m.score.BD}`:`⚡ KHOTI - Team ${m.result==='KHOTI_AC'?'AC':'BD'}`;
    const dots=Array.from({length:13},(_,i)=>{
      const c=m.collections.find(x=>x.round===i+1);
      return `<i class="${c?c.team.toLowerCase():''}"></i>`;
    }).join('');
    b.innerHTML=`
      <span class="mtrump" style="color:${isRed(m.trump)?'var(--suit-red)':'#D9DCE6'}">${GLYPH[m.trump]}</span>
      <span class="mmid">
        <span class="mdate">${d.toLocaleDateString()} ${d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})} · chooser ${m.chooser}${m.difficulty?' · '+m.difficulty:''}</span>
        <div class="mres">${res}</div>
        <div class="split-bar">
          <span class="s-ac" style="width:${m.score.AC/52*100}%"></span>
          <span class="s-x" style="width:${m.score.stranded/52*100}%"></span>
          <span class="s-bd" style="width:${m.score.BD/52*100}%"></span>
        </div>
        <div class="dotstrip">${dots}</div>
      </span>`;
    b.onclick=()=>showReport(m,'screen-history');
    list.appendChild(b);
  }
  show('screen-history');
}

function miniCard(c,trump,win=false){
  return `<span class="card mini su-${c.suit} ${isRed(c.suit)?'red':'blk'} ${c.suit===trump?'trumpc':''} ${win?'winr':''}" style="position:relative;">
    <span class="corner" style="position:absolute;">${RLAB(c.rank)}<small>${GLYPH[c.suit]}</small></span>
    <span class="big" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;">${GLYPH[c.suit]}</span></span>`;
}

function pileChartSVG(m){
  // pile level after each round; collections marked as drops with diamonds
  const W=700,H=150,pad=26;
  const maxStake=Math.max(8,...m.rounds.map((r,i)=>(i===0?0:m.rounds[i-1].pileAfter)+4));
  const x=i=>pad+(W-2*pad)*(i/13);
  const y=v=>H-18-(H-44)*(v/maxStake);
  let path=`M ${x(0)} ${y(0)}`;
  let marks='';
  m.rounds.forEach((r,i)=>{
    const before=(i===0?0:m.rounds[i-1].pileAfter);
    const peak=before+4;
    path+=` L ${x(i+1)} ${y(peak)}`;
    if(r.collected){
      const col=r.totals&&TEAM(r.winner)==='AC'?'var(--team-ac)':'var(--team-bd)';
      const cc=TEAM(r.winner)==='AC'?'#E0A93E':'#4FB6C9';
      marks+=`<path d="M ${x(i+1)} ${y(peak)-9} l 5 5 l -5 5 l -5 -5 z" fill="${cc}"/>
        <text x="${x(i+1)}" y="${y(peak)-13}" font-size="9" fill="${cc}" text-anchor="middle" font-family="JetBrains Mono">${peak}</text>`;
      path+=` L ${x(i+1)} ${y(0)}`;
    }
    marks+=`<text x="${x(i+1)}" y="${H-4}" font-size="8.5" fill="#8B8FA3" text-anchor="middle" font-family="JetBrains Mono">${i+1}</text>`;
  });
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block;">
    <line x1="${pad}" y1="${y(0)}" x2="${W-pad}" y2="${y(0)}" stroke="rgba(255,255,255,.12)"/>
    <path d="${path}" fill="none" stroke="#F2B33D" stroke-width="2" stroke-linejoin="round"/>
    ${marks}
  </svg>`;
}

function fmtDur(ms){if(!ms)return null;const s=Math.round(ms/1000);return Math.floor(s/60)+':'+String(s%60).padStart(2,'0');}

function showReport(m,backTo){
  $('btn-report-back').onclick=()=>backTo==='screen-summary'?show('screen-summary'):showHistory();
  $('btn-report-replay').onclick=()=>openReplay(m,'screen-report',backTo);
  const body=$('report-body');
  const d=new Date(m.date);
  const res=m.result==='DRAW'?`Draw ${m.score.AC}–${m.score.BD}`:`KHOTI - Team ${m.result==='KHOTI_AC'?'AC':'BD'}`;
  const a=analyze(m);
  let rows='';
  for(const r of m.rounds){
    const plays=r.plays.map(p=>`<span style="display:inline-flex;flex-direction:column;align-items:center;gap:2px;">
        ${miniCard(p.card,m.trump,p.seat===r.winner&&sameCard(p.card,r.winCard))}
        <span class="dim" style="font-size:9px;font-family:var(--mono);">${p.seat}</span></span>`).join('');
    const colPill=r.collected
      ?`<span class="pill ${TEAM(r.winner).toLowerCase()}">⚡ banked</span>`
      :`<span class="pill none">pile ${r.pileAfter}</span>`;
    rows+=`<tr class="${r.collected?'collected-row':''}">
      <td class="mono">${r.n}</td>
      <td>${r.lead} <span class="dim">(${GLYPH[r.leadSuit]})</span></td>
      <td><div class="cards-cell">${plays}</div></td>
      <td><b>${r.winner}</b></td>
      <td>${colPill}</td>
      <td class="mono dim">${r.totals.AC}–${r.totals.BD}</td>
    </tr>`;
  }
  const dur=fmtDur(m.durationMs);
  body.innerHTML=`
    <div class="report-meta">
      <span class="chip">${d.toLocaleDateString()} ${d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</span>
      <span class="chip">Trump <b style="color:${isRed(m.trump)?'var(--suit-red)':'#D9DCE6'};font-size:16px;">${GLYPH[m.trump]}</b></span>
      <span class="chip">Dealer ${m.dealer}</span>
      <span class="chip">Chooser ${m.chooser}</span>
      <span class="chip"><b>${res}</b></span>
      ${m.difficulty?`<span class="chip dim">${m.difficulty} bots</span>`:''}
      ${dur?`<span class="chip dim">⏱ ${dur}</span>`:''}
      ${m.score.stranded?`<span class="chip dim">${m.score.stranded} stranded</span>`:''}
      ${a.biggest?`<span class="chip">Largest bank <b class="mono">&nbsp;${a.biggest.cards}</b></span>`:''}
      ${a.khotiDead?`<span class="chip dim">KHOTI died R${a.khotiDead}</span>`:''}
      ${m.misdeals?`<span class="chip dim">${m.misdeals} misdeal(s)</span>`:''}
    </div>
    <div class="rsection"><h3>PILE PRESSURE - charge &amp; collections by round</h3>
      <div class="pile-chart">${pileChartSVG(m)}</div></div>
    <div class="rsection"><h3>MATCH ANALYSIS</h3>
      <div class="insights" style="max-width:none;">${insightText(m).map(s=>`<p>${s}</p>`).join('')}</div></div>
    <div class="rsection"><h3>ROUND BY ROUND</h3>
    <table class="rtable">
      <thead><tr><th>RD</th><th>LEAD</th><th>PLAYS (in order)</th><th>WINNER</th><th>COLLECTION</th><th>AC–BD</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`;
  show('screen-report');
}

/* =====================================================
   STATISTICS
===================================================== */
function showStats(){
  const hist=store.get('ec.history.v1')||[];
  const body=$('stats-body');
  if(!hist.length){body.innerHTML='<div class="empty-note">No data yet - statistics appear after your first match.</div>';show('screen-stats');return;}
  const n=hist.length;
  const khoti=hist.filter(m=>m.result!=='DRAW').length;
  const myWins=hist.filter(m=>m.result==='KHOTI_AC').length;
  const allCols=hist.flatMap(m=>m.collections);
  const largest=allCols.length?Math.max(...allCols.map(c=>c.cards)):0;
  const avgCol=allCols.length?(allCols.reduce((a,c)=>a+c.cards,0)/allCols.length).toFixed(1):'-';
  const longestPile=Math.max(0,...hist.flatMap(m=>m.rounds.map((r,i)=>(i===0?0:m.rounds[i-1].pileAfter)+4)));
  const durs=hist.map(m=>m.durationMs).filter(Boolean);
  const avgDur=durs.length?fmtDur(durs.reduce((a,b)=>a+b,0)/durs.length):'-';
  // suit frequency
  const suitCt={S:0,H:0,D:0,C:0};hist.forEach(m=>suitCt[m.trump]++);
  const favSuit=SUITS.reduce((a,b)=>suitCt[b]>suitCt[a]?b:a);
  // seat round-wins
  const seatW={A:0,B:0,C:0,D:0};
  hist.forEach(m=>m.rounds.forEach(r=>seatW[r.winner]++));
  const topBot=['B','C','D'].reduce((a,b)=>seatW[b]>seatW[a]?b:a);
  const maxW=Math.max(1,...Object.values(seatW));
  const maxS=Math.max(1,...Object.values(suitCt));
  const sc=(k,v)=>`<div class="stat-card"><div class="k">${k}</div><div class="v">${v}</div></div>`;
  body.innerHTML=`
    <div class="stat-grid">
      ${sc('MATCHES PLAYED',n)}
      ${sc('KHOTI WINS',khoti)}
      ${sc('DRAWS',n-khoti)}
      ${sc('YOUR TEAM WIN %',`${(myWins/n*100).toFixed(0)}<small>%</small>`)}
      ${sc('FAVORITE TRUMP',`<span style="color:${isRed(favSuit)?'var(--suit-red)':'#D9DCE6'}">${GLYPH[favSuit]}</span> <small>${suitCt[favSuit]}×</small>`)}
      ${sc('LARGEST COLLECTION',largest)}
      ${sc('AVG COLLECTION',avgCol)}
      ${sc('LONGEST PILE',longestPile)}
      ${sc('TOP BOT SEAT',`${topBot} <small>${seatW[topBot]} wins</small>`)}
      ${sc('AVG DURATION',avgDur)}
    </div>
    <div class="rsection"><h3>ROUND WINS BY SEAT</h3>
      ${SEATS.map(s=>`<div class="hbar-row"><span class="lbl">${s==='A'?'You':s}</span>
        <span class="bar"><span class="bf" style="width:${seatW[s]/maxW*100}%;background:${TEAM(s)==='AC'?'var(--team-ac)':'var(--team-bd)'}"></span></span>
        <span class="num">${seatW[s]}</span></div>`).join('')}
    </div>
    <div class="rsection"><h3>TRUMP SUITS CHOSEN</h3>
      ${SUITS.map(s=>`<div class="hbar-row"><span class="lbl">${GLYPH[s]} ${SUITNAME[s]}</span>
        <span class="bar"><span class="bf" style="width:${suitCt[s]/maxS*100}%"></span></span>
        <span class="num">${suitCt[s]}</span></div>`).join('')}
    </div>`;
  show('screen-stats');
}

/* =====================================================
   REPLAY - interprets stored records with the live visuals
===================================================== */
let R=null;
function stopReplay(){if(R){R.tok++;R.playing=false;}}
function rpPileBefore(i){return i===0?0:(R.m.rounds[i-1].pileAfter);}

function openReplay(m,from,reportBack){
  stopReplay();
  R={m,ri:0,playing:false,speed:1,tok:0,from,reportBack};
  $('rp-trump-g').textContent=GLYPH[m.trump];
  $('rp-trump-g').style.color=isRed(m.trump)?'var(--suit-red)':'#D9DCE6';
  $('rp-trump-n').textContent=SUITNAME[m.trump];
  $('rp-exit').onclick=()=>{stopReplay();
    if(from==='screen-summary')show('screen-summary');
    else if(from==='screen-report')showReport(m,R.reportBack||'screen-history');
    else showHistory();};
  $('rp-play').onclick=()=>R.playing?rpPause():rpPlay();
  $('rp-prev').onclick=()=>{rpPause();R.ri=Math.max(0,R.ri-1);rpStatic(R.ri);};
  $('rp-next').onclick=()=>{rpPause();R.ri=Math.min(m.rounds.length-1,R.ri+1);rpStatic(R.ri);};
  document.querySelectorAll('#rp-speed button').forEach(b=>{
    b.classList.toggle('on',+b.dataset.v===R.speed);
    b.onclick=()=>{R.speed=+b.dataset.v;
      document.querySelectorAll('#rp-speed button').forEach(x=>x.classList.toggle('on',x===b));};
  });
  show('screen-replay');
  rpStatic(0);
}
function rpUpdateUI(){
  $('rp-play').innerHTML=R.playing?'⏸ Pause':'▶ Play';
  $('rp-info').textContent=`R ${Math.min(R.ri+1,13)}/13`;
}
function rpClearSlots(){SEATS.forEach(s=>{const sl=$('rp-slot-'+s);[...sl.children].forEach(c=>{if(!c.classList.contains('who'))c.remove();});});}
function rpHeader(r,suffix){
  $('rp-round').textContent=`Round ${r.n} / 13`;
  $('rp-lead').textContent=`Lead: ${r.lead} ${GLYPH[r.leadSuit]||''}`;
  $('rp-banner').innerHTML=suffix;
}
function rpTotals(i){
  const t=i>=0?R.m.rounds[i].totals:{AC:0,BD:0};
  $('rp-ac').textContent=t.AC;$('rp-bd').textContent=t.BD;
}
function rpStatic(i){ // resolved end-state of round i
  const r=R.m.rounds[i];
  rpClearSlots();
  for(const p of r.plays){
    const el=cardEl(p.card,false,R.m.trump);
    if(p.seat===r.winner)el.classList.add('win-glow');else el.classList.add('dimmed');
    $('rp-slot-'+p.seat).appendChild(el);
  }
  $('rp-pile').textContent=r.pileAfter;
  rpHeader(r,r.collected
    ?`<b style="color:var(--charge)">⚡ ${r.winner} collected ${rpPileBefore(i)+4}</b><small>Team ${TEAM(r.winner)} banked the pile</small>`
    :`<b>${r.winner} wins Round ${r.n}</b><small>pile at ${r.pileAfter}</small>`);
  rpTotals(i);
  rpUpdateUI();
}
function rpPause(){R.playing=false;R.tok++;rpUpdateUI();}
async function rpPlay(){
  R.playing=true;const my=++R.tok;rpUpdateUI();
  const m=R.m;
  while(R.ri<m.rounds.length&&R.playing&&my===R.tok){
    const i=R.ri,r=m.rounds[i];
    rpClearSlots();
    $('rp-pile').textContent=rpPileBefore(i);
    rpHeader(r,`<b>Round ${r.n}</b><small>${r.lead} leads ${GLYPH[r.leadSuit]}</small>`);
    rpTotals(i-1);
    for(const p of r.plays){
      await sleep(850/R.speed);if(my!==R.tok)return;
      const el=cardEl(p.card,false,m.trump);
      el.classList.add('fly-'+p.seat);
      $('rp-slot-'+p.seat).appendChild(el);
      Snd.play('card');
    }
    await sleep(650/R.speed);if(my!==R.tok)return;
    // resolve
    for(const p of r.plays){
      const sl=$('rp-slot-'+p.seat);
      const el=[...sl.children].find(c=>!c.classList.contains('who'));
      if(!el)continue;
      if(p.seat===r.winner)el.classList.add('win-glow');else el.classList.add('dimmed');
    }
    if(r.collected){
      const got=rpPileBefore(i)+4;
      $('rp-pile').textContent=0;
      $('rp-core').classList.add('flash');
      setTimeout(()=>$('rp-core').classList.remove('flash'),900);
      Snd.play('collect');
      burstAt($('rp-core'),[TEAM(r.winner)==='AC'?'#E0A93E':'#4FB6C9','#FFD37A'],22,130);
      rpHeader(r,`<b style="color:var(--charge)">⚡ ${r.winner} collects ${got}</b><small>Team ${TEAM(r.winner)} banks the entire pile</small>`);
    }else{
      $('rp-pile').textContent=r.pileAfter;
      rpHeader(r,`<b>${r.winner} wins Round ${r.n}</b><small>${r.winCard.suit===m.trump?'highest trump':'highest of lead suit'} · pile charges to ${r.pileAfter}</small>`);
    }
    rpTotals(i);
    await sleep(1400/R.speed);if(my!==R.tok)return;
    R.ri++;
    rpUpdateUI();
  }
  if(R.ri>=m.rounds.length&&my===R.tok){
    R.playing=false;R.ri=m.rounds.length-1;
    const res=m.result==='DRAW'?`Draw ${m.score.AC}–${m.score.BD}`:`KHOTI - Team ${m.result==='KHOTI_AC'?'AC':'BD'}`;
    $('rp-banner').innerHTML=`<b style="color:var(--charge)">Match end</b><small>${res}${m.score.stranded?' · '+m.score.stranded+' stranded':''}</small>`;
    rpUpdateUI();
  }
}

/* =====================================================
   SETTINGS WIRING
===================================================== */
(function init(){
  applyA11y();
  const segWire=(id,key,parse=v=>v)=>{
    document.querySelectorAll('#'+id+' button').forEach(b=>{
      b.classList.toggle('on',parse(b.dataset.v)===settings[key]);
      b.onclick=()=>{settings[key]=parse(b.dataset.v);saveSettings();
        document.querySelectorAll('#'+id+' button').forEach(x=>x.classList.toggle('on',x===b));};
    });
  };
  segWire('speed-seg','botDelay',v=>+v);
  segWire('diff-seg','difficulty');
  const tglWire=(id,key,after)=>{
    const t=$(id);t.classList.toggle('on',settings[key]);
    t.onclick=()=>{settings[key]=!settings[key];saveSettings();t.classList.toggle('on',settings[key]);after&&after();};
  };
  tglWire('tgl-timer','humanTimer');
  tglWire('tgl-ace','aceRule');
  tglWire('tgl-sound','sound');
  tglWire('tgl-rm','rm',applyA11y);
  tglWire('tgl-cb','cb',applyA11y);
  tglWire('tgl-lt','lt',applyA11y);
  renderHomeStats();
})();
/* ---- module wiring (Phase 3A) ---- */
Object.assign(window, { startMatch, showHistory, showStats, showRules, hideRules, goHome, quitMatch });
const exitBtn = document.getElementById('btn-exit-account');
if (exitBtn) {
  if (onExit) {
    exitBtn.style.display = '';
    exitBtn.onclick = () => { token++; stopReplay(); clearHumanTimer(); cloud&&cloud.presence&&cloud.presence('online'); onExit(); };
  } else exitBtn.style.display = 'none';
}
if (cloud && cloud.listRecords) {
  cloud.listRecords().then(recs => {
    if (Array.isArray(recs)) { store.set('ec.history.v1', recs); renderHomeStats(); }
  }).catch(() => {});
}
return function unmount() {
  token++; stopReplay(); clearHumanTimer();
  document.removeEventListener('keydown', _kbHandler);
  document.removeEventListener('click', _clickSnd, true);
  root.innerHTML = '';
};
}
