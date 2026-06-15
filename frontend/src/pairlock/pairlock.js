const SUITS = ['S', 'H', 'D', 'C'];
const RANKS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
const RANK_LABEL = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
const SUIT_LABEL = { S: 'S', H: 'H', D: 'D', C: 'C' };

function labelRank(rank) {
  return RANK_LABEL[rank] || String(rank);
}

function cardValue(rank) {
  if (rank === 14) return 50;
  if (rank === 13) return 40;
  if (rank === 12) return 30;
  if (rank === 11) return 20;
  return 10;
}

function cardKey(card) {
  return `${card.rank}-${card.suit}`;
}

function deck52() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) deck.push({ suit, rank });
  }
  return deck;
}

function shuffle(cards) {
  const deck = cards.slice();
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function createState() {
  return {
    deck: [],
    hands: { player: [], bot: [] },
    ground: [],
    collections: { player: [], bot: [] },
    turn: 'player',
    selected: null,
    busy: false,
    over: false,
    message: 'Start a beta match.',
    feed: []
  };
}

function topPile(collection) {
  return collection.length ? collection[collection.length - 1] : null;
}

function scoreOf(collection) {
  return collection.reduce((sum, pile) =>
    sum + pile.cards.reduce((s, card) => s + cardValue(card.rank), 0), 0);
}

function lowestValueCard(hand) {
  return hand.slice().sort((a, b) => cardValue(a.rank) - cardValue(b.rank) || a.rank - b.rank)[0];
}

function drawCard(state, side) {
  const card = state.deck.shift();
  if (card) state.hands[side].push(card);
  return card;
}

function refillForTurn(state, side) {
  if (!state.deck.length) return 0;
  let drawn = 0;
  while (state.hands[side].length < 4 && state.deck.length) {
    drawCard(state, side);
    drawn++;
  }
  if (state.deck.length) {
    drawCard(state, side);
    drawn++;
  }
  sortHand(state.hands[side]);
  return drawn;
}

function sortHand(hand) {
  hand.sort((a, b) => a.rank - b.rank || SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit));
}

function findGroundPile(state, rank) {
  return state.ground.find((pile) => pile.rank === rank) || null;
}

function addToGround(state, card) {
  let pile = findGroundPile(state, card.rank);
  if (!pile) {
    pile = { rank: card.rank, cards: [] };
    state.ground.push(pile);
    state.ground.sort((a, b) => a.rank - b.rank);
  }
  pile.cards.push(card);
}

function removeFromHand(state, side, card) {
  const idx = state.hands[side].findIndex((c) => cardKey(c) === cardKey(card));
  if (idx === -1) return null;
  return state.hands[side].splice(idx, 1)[0];
}

function lockIfComplete(pile) {
  if (pile && pile.cards.length === 4) pile.locked = true;
}

function pushNewTopPile(state, side, cards) {
  const rank = cards[0].rank;
  const pile = { rank, cards: cards.slice(), locked: false };
  lockIfComplete(pile);
  state.collections[side].push(pile);
  return pile;
}

function captureGround(state, side, card) {
  const groundIdx = state.ground.findIndex((pile) => pile.rank === card.rank);
  if (groundIdx === -1) return false;
  const played = removeFromHand(state, side, card);
  if (!played) return false;
  const [groundPile] = state.ground.splice(groundIdx, 1);
  const pile = pushNewTopPile(state, side, [played, ...groundPile.cards]);
  writeFeed(state, `${nameOf(side)} captured ${labelRank(card.rank)} from ground${pile.locked ? ' and locked it' : ''}.`);
  return true;
}

function stealTop(state, side, card) {
  const opponent = otherSide(side);
  const target = topPile(state.collections[opponent]);
  if (!target || target.locked || target.rank !== card.rank) return false;
  const played = removeFromHand(state, side, card);
  if (!played) return false;
  const stolen = state.collections[opponent].pop();
  const pile = pushNewTopPile(state, side, [played, ...stolen.cards]);
  writeFeed(state, `${nameOf(side)} stole top ${labelRank(card.rank)} pile${pile.locked ? ' and locked it' : ''}.`);
  return true;
}

function addToOwnTop(state, side, card) {
  const ownTop = topPile(state.collections[side]);
  if (!ownTop || ownTop.locked || ownTop.rank !== card.rank) return false;
  const played = removeFromHand(state, side, card);
  if (!played) return false;
  ownTop.cards.push(played);
  lockIfComplete(ownTop);
  writeFeed(state, `${nameOf(side)} added ${labelRank(card.rank)} to top pile${ownTop.locked ? ' and locked it' : ''}.`);
  return true;
}

function throwToGround(state, side, card) {
  const played = removeFromHand(state, side, card);
  if (!played) return false;
  addToGround(state, played);
  writeFeed(state, `${nameOf(side)} threw ${labelRank(card.rank)}${SUIT_LABEL[card.suit]} to ground.`);
  return true;
}

function otherSide(side) {
  return side === 'player' ? 'bot' : 'player';
}

function nameOf(side) {
  return side === 'player' ? 'Player' : 'Bot';
}

function writeFeed(state, text) {
  state.feed.unshift(text);
  state.feed = state.feed.slice(0, 10);
}

function canCapture(state, side, card) {
  return !!card && !!findGroundPile(state, card.rank);
}

function canSteal(state, side, card) {
  const target = topPile(state.collections[otherSide(side)]);
  return !!card && !!target && !target.locked && target.rank === card.rank;
}

function canAdd(state, side, card) {
  const ownTop = topPile(state.collections[side]);
  return !!card && !!ownTop && !ownTop.locked && ownTop.rank === card.rank;
}

function gameEnded(state) {
  return !state.deck.length && !state.hands.player.length && !state.hands.bot.length;
}

function finishGame(state) {
  state.over = true;
  state.busy = false;
  const player = scoreOf(state.collections.player);
  const bot = scoreOf(state.collections.bot);
  if (player === bot) state.message = `Draw. Both scored ${player}.`;
  else state.message = `${player > bot ? 'Player' : 'Bot'} wins, ${Math.max(player, bot)} to ${Math.min(player, bot)}.`;
  writeFeed(state, state.message);
}

function botChooseLockCard(state) {
  const ownTop = topPile(state.collections.bot);
  if (!ownTop || ownTop.locked || ownTop.cards.length !== 3) return null;
  return state.hands.bot.find((card) => card.rank === ownTop.rank) || null;
}

function botChooseStealCard(state) {
  const target = topPile(state.collections.player);
  if (!target || target.locked) return null;
  return state.hands.bot.find((card) => card.rank === target.rank) || null;
}

function botChooseCaptureCard(state) {
  const matches = state.hands.bot
    .filter((card) => canCapture(state, 'bot', card))
    .sort((a, b) => {
      const ga = findGroundPile(state, a.rank);
      const gb = findGroundPile(state, b.rank);
      const av = cardValue(a.rank) * (1 + (ga ? ga.cards.length : 0));
      const bv = cardValue(b.rank) * (1 + (gb ? gb.cards.length : 0));
      return bv - av;
    });
  return matches[0] || null;
}

function botChooseAddCard(state) {
  const ownTop = topPile(state.collections.bot);
  if (!ownTop || ownTop.locked) return null;
  return state.hands.bot.find((card) => card.rank === ownTop.rank) || null;
}

function botTakeActions(state) {
  let safety = 0;
  while (state.hands.bot.length && safety < 20) {
    safety++;
    if (state.hands.bot.length <= 1) {
      throwToGround(state, 'bot', lowestValueCard(state.hands.bot));
      break;
    }

    const lockCard = botChooseLockCard(state);
    if (lockCard && addToOwnTop(state, 'bot', lockCard)) continue;

    const stealCard = botChooseStealCard(state);
    if (stealCard && stealTop(state, 'bot', stealCard)) continue;

    const captureCard = botChooseCaptureCard(state);
    if (captureCard && captureGround(state, 'bot', captureCard)) continue;

    const addCard = botChooseAddCard(state);
    if (addCard && addToOwnTop(state, 'bot', addCard)) continue;

    const throwCard = lowestValueCard(state.hands.bot);
    throwToGround(state, 'bot', throwCard);
    break;
  }
}

function cardHtml(card, selected) {
  const red = card.suit === 'H' || card.suit === 'D';
  return `
    <button class="pl-card ${red ? 'red' : 'black'} ${selected ? 'selected' : ''}" data-card="${cardKey(card)}">
      <span>${labelRank(card.rank)}</span>
      <b>${SUIT_LABEL[card.suit]}</b>
      <em>${cardValue(card.rank)}</em>
    </button>
  `;
}

function readonlyCardHtml(card, extra = '') {
  const red = card.suit === 'H' || card.suit === 'D';
  return `
    <span class="pl-card readonly ${red ? 'red' : 'black'} ${extra}">
      <span>${labelRank(card.rank)}</span>
      <b>${SUIT_LABEL[card.suit]}</b>
    </span>
  `;
}

function collectionHtml(collection) {
  if (!collection.length) return '<div class="pl-empty">No collection</div>';
  const last = collection.length - 1;
  const cards = [];
  collection.forEach((pile, pileIndex) => {
    pile.cards.forEach((card, cardIndex) => {
      const cls = [
        pileIndex === last ? 'active-top' : '',
        pile.locked ? 'locked-card' : ''
      ].filter(Boolean).join(' ');
      cards.push(`
        <span class="pl-col-card-wrap">
          ${readonlyCardHtml(card, cls)}
          ${pile.locked && cardIndex === 0 ? '<small class="pl-lock">LOCK</small>' : ''}
        </span>
      `);
    });
  });
  return `<div class="pl-collection-row">${cards.join('')}</div>`;
}

function groundHtml(ground) {
  if (!ground.length) return '<div class="pl-empty">Ground is empty</div>';
  return ground.map((pile) => `
    <div class="pl-ground-pile">
      <strong>${labelRank(pile.rank)}</strong>
      <div>${pile.cards.map((card) => readonlyCardHtml(card)).join('')}</div>
    </div>
  `).join('');
}

export function mountPairLock(root, opts = {}) {
  const { onExit = null } = opts;
  let state = createState();
  let botTimer = null;

  root.innerHTML = `
    <div class="pl-screen">
      <header class="pl-header">
        <div>
          <span class="pl-kicker">Beta game</span>
          <h1>Pair Lock</h1>
        </div>
        <div class="pl-header-actions">
          <button class="pl-btn primary" id="pl-new">New match</button>
          ${onExit ? '<button class="pl-btn" id="pl-exit">Back</button>' : ''}
        </div>
      </header>

      <section class="pl-scorebar">
        <div><span>Draw pile</span><b id="pl-deck">0</b></div>
        <div><span>Player score</span><b id="pl-player-score">0</b></div>
        <div><span>Bot score</span><b id="pl-bot-score">0</b></div>
        <div><span>Turn</span><b id="pl-turn">-</b></div>
      </section>

      <main class="pl-layout">
        <section class="pl-board">
          <div class="pl-zone pl-bot">
            <div class="pl-zone-head">
              <h2>Bot collection</h2>
              <span id="pl-bot-hand">0 cards</span>
            </div>
            <div id="pl-bot-collection"></div>
          </div>

          <div class="pl-ground">
            <div class="pl-zone-head">
              <h2>Ground</h2>
              <span>Grouped by rank</span>
            </div>
            <div class="pl-ground-grid" id="pl-ground"></div>
          </div>

          <div class="pl-zone pl-player">
            <div class="pl-zone-head">
              <h2>Player collection</h2>
              <span id="pl-selected">No card selected</span>
            </div>
            <div id="pl-player-collection"></div>
          </div>

          <div class="pl-hand" id="pl-hand"></div>
        </section>

        <aside class="pl-side">
          <div class="pl-message" id="pl-message">Start a beta match.</div>
          <div class="pl-actions">
            <button class="pl-btn" id="pl-capture">Capture</button>
            <button class="pl-btn" id="pl-steal">Steal top</button>
            <button class="pl-btn" id="pl-add">Add to top</button>
            <button class="pl-btn danger" id="pl-throw">Throw</button>
          </div>
          <div class="pl-feed" id="pl-feed"></div>
        </aside>
      </main>
    </div>
  `;

  const $ = (id) => root.querySelector(`#${id}`);

  function selectedCard() {
    if (!state.selected) return null;
    return state.hands.player.find((card) => cardKey(card) === state.selected) || null;
  }

  function startTurn(side) {
    if (gameEnded(state)) {
      finishGame(state);
      render();
      return;
    }

    state.turn = side;
    state.selected = null;
    const drawn = refillForTurn(state, side);
    state.message = drawn ? `${nameOf(side)} drew ${drawn} card${drawn === 1 ? '' : 's'}.` : `${nameOf(side)} turn.`;
    render();

    if (side === 'bot' && !state.over) {
      state.busy = true;
      botTimer = setTimeout(() => {
        botTakeActions(state);
        state.busy = false;
        if (gameEnded(state)) finishGame(state);
        else startTurn('player');
        render();
      }, 800);
    }
  }

  function newMatch() {
    clearTimeout(botTimer);
    state = createState();
    state.deck = shuffle(deck52());
    for (let i = 0; i < 4; i++) {
      drawCard(state, 'player');
      drawCard(state, 'bot');
      addToGround(state, state.deck.shift());
    }
    sortHand(state.hands.player);
    sortHand(state.hands.bot);
    writeFeed(state, 'New match dealt: 4 player, 4 bot, 4 ground.');
    startTurn('player');
  }

  function playerAction(type) {
    if (state.turn !== 'player' || state.busy || state.over) return;
    const card = selectedCard();
    if (!card) {
      state.message = 'Select a hand card.';
      render();
      return;
    }

    if (type !== 'throw' && state.hands.player.length <= 1) {
      state.message = 'Keep your last card to throw and end the turn.';
      render();
      return;
    }

    let ok = false;
    if (type === 'capture') ok = captureGround(state, 'player', card);
    if (type === 'steal') ok = stealTop(state, 'player', card);
    if (type === 'add') ok = addToOwnTop(state, 'player', card);
    if (type === 'throw') ok = throwToGround(state, 'player', card);

    if (!ok) {
      state.message = 'That move is not legal for the selected card.';
      render();
      return;
    }

    state.selected = null;
    if (type === 'throw') {
      if (gameEnded(state)) {
        finishGame(state);
        render();
      } else {
        startTurn('bot');
      }
      return;
    }

    state.message = 'Action complete. Throw a card to end turn.';
    render();
  }

  function render() {
    const card = selectedCard();
    $('pl-deck').textContent = state.deck.length;
    $('pl-player-score').textContent = scoreOf(state.collections.player);
    $('pl-bot-score').textContent = scoreOf(state.collections.bot);
    $('pl-turn').textContent = state.over ? 'Done' : nameOf(state.turn);
    $('pl-bot-hand').textContent = `${state.hands.bot.length} cards`;
    $('pl-message').textContent = state.message;
    $('pl-selected').textContent = card ? `${labelRank(card.rank)}${SUIT_LABEL[card.suit]} selected` : 'No card selected';

    $('pl-bot-collection').innerHTML = collectionHtml(state.collections.bot);
    $('pl-player-collection').innerHTML = collectionHtml(state.collections.player);
    $('pl-ground').innerHTML = groundHtml(state.ground);
    $('pl-feed').innerHTML = state.feed.map((item) => `<div>${item}</div>`).join('');
    $('pl-hand').innerHTML = state.hands.player.length
      ? state.hands.player.map((c) => cardHtml(c, state.selected === cardKey(c))).join('')
      : '<div class="pl-empty">No cards in hand</div>';

    root.querySelectorAll('[data-card]').forEach((btn) => {
      btn.onclick = () => {
        if (state.turn !== 'player' || state.busy || state.over) return;
        state.selected = btn.getAttribute('data-card');
        state.message = 'Choose an action.';
        render();
      };
    });

    const playerCanAct = state.turn === 'player' && !state.busy && !state.over && !!card;
    const canSpendWithoutEnding = state.hands.player.length > 1;
    $('pl-capture').disabled = !playerCanAct || !canSpendWithoutEnding || !canCapture(state, 'player', card);
    $('pl-steal').disabled = !playerCanAct || !canSpendWithoutEnding || !canSteal(state, 'player', card);
    $('pl-add').disabled = !playerCanAct || !canSpendWithoutEnding || !canAdd(state, 'player', card);
    $('pl-throw').disabled = !playerCanAct;
  }

  $('pl-new').onclick = newMatch;
  $('pl-capture').onclick = () => playerAction('capture');
  $('pl-steal').onclick = () => playerAction('steal');
  $('pl-add').onclick = () => playerAction('add');
  $('pl-throw').onclick = () => playerAction('throw');
  const exit = $('pl-exit');
  if (exit) exit.onclick = () => {
    clearTimeout(botTimer);
    onExit();
  };

  render();

  return function unmount() {
    clearTimeout(botTimer);
    root.innerHTML = '';
  };
}
