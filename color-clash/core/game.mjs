/**
 * Color Clash's authoritative, dependency-free rules engine.
 * The same immutable transitions drive browser-local and hosted matches.
 * AI receives viewFor() output only: never the deck or another player's cards.
 */
export const COLORS = Object.freeze(['red', 'yellow', 'green', 'blue']);
const VALUES = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'skip', 'reverse', 'draw2'];
const DIFFICULTIES = ['easy', 'medium', 'hard', 'expert'];
const DEFAULT_OPTIONS = Object.freeze({ stacking: false, jumpIn: false, sevenZero: false, quickPlay: false });
const copy = (value) => structuredClone(value);
const wrap = (n, length) => ((n % length) + length) % length;

// Solo games name the human "You"; keep the event lines grammatical.
const verb = (name, singular, plural) => (name === 'You' ? plural : singular);
function randomIndex(length, rng) {
  if (length < 1) throw new Error('Random selection requires a nonempty collection.');
  if (rng) {
    const value = rng();
    if (!Number.isFinite(value) || value < 0 || value >= 1) throw new Error('RNG must return a number in [0, 1).');
    return Math.floor(value * length);
  }
  // Rejection sampling avoids modulo bias, including during Fisher–Yates shuffle.
  const limit = Math.floor(0x100000000 / length) * length;
  const buffer = new Uint32Array(1);
  do { globalThis.crypto.getRandomValues(buffer); } while (buffer[0] >= limit);
  return buffer[0] % length;
}
function chance(probability, rng) { return randomIndex(10000, rng) < probability * 10000; }
function shuffle(cards, rng) {
  const shuffled = [...cards];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1, rng);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}
function deckOfCards() {
  const deck = [];
  let id = 0;
  for (const color of COLORS) {
    for (const value of VALUES) {
      const copies = value === '0' ? 1 : 2;
      for (let n = 0; n < copies; n++) deck.push({ id: `c${id++}`, color, value });
    }
  }
  for (const value of ['wild', 'wild4']) {
    for (let n = 0; n < 4; n++) deck.push({ id: `c${id++}`, color: 'wild', value });
  }
  return deck;
}
function event(game, type, fields = {}) {
  game.events.push({ id: ++game.eventSeq, type, ...fields });
  if (game.events.length > 32) game.events.splice(0, game.events.length - 32);
}
function nextIndex(game, from = game.currentIndex, steps = 1) {
  return wrap(from + game.direction * steps, game.players.length);
}
function advance(game, steps = 1) {
  game.currentIndex = nextIndex(game, game.currentIndex, steps);
  game.drawnCardId = null;
  game.turn++;
}
function drawCards(game, playerIndex, count, rng) {
  const player = game.players[playerIndex];
  const received = [];
  for (let i = 0; i < count; i++) {
    if (!game.deck.length && game.discard.length > 1) {
      const top = game.discard[game.discard.length - 1];
      game.deck = shuffle(game.discard.slice(0, -1), rng);
      game.discard = [top];
      event(game, 'reshuffle', { text: 'The discard pile is shuffled back in.' });
    }
    if (!game.deck.length) break;
    const card = game.deck.pop();
    player.hand.push(card);
    received.push(card);
  }
  if (received.length) player.called = false;
  return received;
}
function publicDraw(game, index, amount, rng, extra = {}) {
  const received = drawCards(game, index, amount, rng);
  event(game, 'draw', { playerId: game.players[index].id, amount: received.length, ...extra,
    text: `${game.players[index].name} ${verb(game.players[index].name, 'draws', 'draw')} ${received.length}.` });
  return received;
}
function hasActiveColor(game, player) { return player.hand.some((card) => card.color === game.activeColor); }
function legalCard(game, playerIndex, card) {
  if (game.phase !== 'playing') return false;
  const player = game.players[playerIndex];
  const top = game.discard[game.discard.length - 1];
  const isTurn = playerIndex === game.currentIndex;
  if (!isTurn) {
    return Boolean(game.options.jumpIn && !game.pendingDraw && !game.drawnCardId &&
      top.color !== 'wild' && card.color === top.color && card.value === top.value);
  }
  if (game.pendingDraw) {
    return Boolean(game.options.stacking && card.value === game.pendingDrawValue &&
      (card.value !== 'wild4' || !hasActiveColor(game, player)));
  }
  if (game.drawnCardId && card.id !== game.drawnCardId) return false;
  if (card.value === 'wild4') return !hasActiveColor(game, player);
  if (card.value === 'wild') return true;
  return card.color === game.activeColor || card.value === top.value;
}
function legalIds(game, playerIndex) {
  return game.players[playerIndex].hand.filter((card) => legalCard(game, playerIndex, card)).map((card) => card.id);
}
function setWarning(game, playerIndex, called) {
  for (const player of game.players) if (player.hand.length !== 1) player.called = false;
  const player = game.players[playerIndex];
  if (player.hand.length !== 1) return;
  player.called = called === true;
  if (player.called) {
    event(game, 'call', { playerId: player.id, text: `${player.name} ${verb(player.name, 'calls', 'call')} CLASH!` });
    game.vulnerablePlayerId = null;
  } else {
    game.vulnerablePlayerId = player.id;
  }
}
function finishIfEmpty(game, rng) {
  const winnerIndex = game.players.findIndex((player) => player.hand.length === 0);
  if (winnerIndex < 0) return false;
  // The final +2 / +4 is paid even though the round ends immediately.
  if (game.pendingDraw) {
    publicDraw(game, game.currentIndex, game.pendingDraw, rng);
    game.pendingDraw = 0;
    game.pendingDrawValue = null;
  }
  game.phase = 'finished';
  game.winnerId = game.players[winnerIndex].id;
  game.currentIndex = winnerIndex;
  game.drawnCardId = null;
  game.vulnerablePlayerId = null;
  event(game, 'win', { playerId: game.winnerId, text: `${game.players[winnerIndex].name} ${verb(game.players[winnerIndex].name, 'wins', 'win')}!` });
  return true;
}

export function createGame(players, options = {}, rng) {
  if (!Array.isArray(players) || players.length < 2 || players.length > 6) throw new Error('Choose 2–6 players.');
  if (new Set(players.map((player) => player.id)).size !== players.length ||
    players.some((player) => typeof player.id !== 'string' || !player.id)) throw new Error('Every player needs a unique ID.');
  const game = {
    phase: 'playing',
    players: players.map((player, index) => ({
      id: player.id, name: String(player.name || `Player ${index + 1}`).slice(0, 32),
      bot: Boolean(player.bot), difficulty: DIFFICULTIES.includes(player.difficulty) ? player.difficulty : 'medium',
      avatar: Number.isInteger(player.avatar) ? player.avatar : index, hand: [], called: false,
    })),
    options: Object.fromEntries(Object.keys(DEFAULT_OPTIONS).map((key) => [key, options[key] === true])),
    deck: shuffle(deckOfCards(), rng), discard: [], currentIndex: 0, direction: 1,
    activeColor: 'red', pendingDraw: 0, pendingDrawValue: null, drawnCardId: null,
    winnerId: null, vulnerablePlayerId: null, turn: 1, version: 1, eventSeq: 0, events: [],
  };
  const handSize = game.options.quickPlay ? 5 : 7;
  for (let n = 0; n < handSize; n++) for (let p = 0; p < players.length; p++) drawCards(game, p, 1, rng);
  // A number starts the table. Opening 7 / 0 has no hand-transfer effect.
  const numberIndex = game.deck.findIndex((card) => /^\d$/.test(card.value));
  const [top] = game.deck.splice(numberIndex, 1);
  game.discard.push(top);
  game.activeColor = top.color;
  event(game, 'start', { playerId: game.players[0].id, amount: handSize, text: `${game.players[0].name} ${verb(game.players[0].name, 'starts', 'start')}.` });
  return game;
}

export function transition(source, playerId, action, rng) {
  if (!source || source.phase !== 'playing') throw new Error('This round has ended.');
  const playerIndex = source.players.findIndex((player) => player.id === playerId);
  if (playerIndex < 0) throw new Error('You do not have a seat in this game.');
  if (!action || typeof action !== 'object' || typeof action.type !== 'string') throw new Error('Choose an action.');
  const game = copy(source);
  const player = game.players[playerIndex];
  const isTurn = playerIndex === game.currentIndex;

  if (action.type === 'call') {
    if (player.hand.length !== 1 || player.called) throw new Error('Call CLASH when you have one card.');
    player.called = true;
    if (game.vulnerablePlayerId === player.id) game.vulnerablePlayerId = null;
    event(game, 'call', { playerId, text: `${player.name} ${verb(player.name, 'calls', 'call')} CLASH!` });
  } else if (action.type === 'catch') {
    const targetIndex = game.players.findIndex((entry) => entry.id === action.targetId);
    const target = game.players[targetIndex];
    if (!target || target.id === playerId || game.vulnerablePlayerId !== target.id ||
      target.hand.length !== 1 || target.called) throw new Error('There is no missed CLASH call to catch.');
    const received = drawCards(game, targetIndex, 2, rng);
    game.vulnerablePlayerId = null;
    event(game, 'catch', { playerId, targetId: target.id, amount: received.length,
      text: `${player.name} ${verb(player.name, 'catches', 'catch')} ${target.name}: +${received.length}.` });
  } else if (action.type === 'draw') {
    if (!isTurn) throw new Error('Wait for your turn.');
    if (game.drawnCardId) throw new Error('Play your drawn card or pass.');
    game.vulnerablePlayerId = null;
    if (game.pendingDraw) {
      publicDraw(game, playerIndex, game.pendingDraw, rng);
      game.pendingDraw = 0;
      game.pendingDrawValue = null;
      advance(game);
    } else {
      const received = publicDraw(game, playerIndex, 1, rng);
      if (received.length && legalCard(game, playerIndex, received[0])) {
        game.drawnCardId = received[0].id;
      } else {
        advance(game);
      }
    }
  } else if (action.type === 'pass') {
    if (!isTurn || !game.drawnCardId) throw new Error('Draw a card before passing.');
    game.vulnerablePlayerId = null;
    event(game, 'pass', { playerId, text: `${player.name} ${verb(player.name, 'passes', 'pass')}.` });
    advance(game);
  } else if (action.type === 'play') {
    const handIndex = player.hand.findIndex((card) => card.id === action.cardId);
    if (handIndex < 0) throw new Error('That card is not in your hand.');
    const card = player.hand[handIndex];
    if (!legalCard(game, playerIndex, card)) {
      if (card.value === 'wild4' && hasActiveColor(game, player)) throw new Error('Save +4 until you have no cards in the active color.');
      throw new Error('Match the active color, number, or symbol.');
    }
    if (card.color === 'wild' && !COLORS.includes(action.color)) throw new Error('Choose a color.');
    let swapIndex = -1;
    if (game.options.sevenZero && card.value === '7') {
      swapIndex = game.players.findIndex((entry) => entry.id === action.targetId);
      if (swapIndex < 0 || swapIndex === playerIndex) throw new Error('Choose another player to swap hands with.');
    }
    game.vulnerablePlayerId = null;
    game.drawnCardId = null;
    if (!isTurn) {
      game.currentIndex = playerIndex;
      event(game, 'jumpIn', { playerId, text: `${player.name} ${verb(player.name, 'jumps', 'jump')} in!` });
    }
    player.hand.splice(handIndex, 1);
    player.called = false;
    game.discard.push(card);
    game.activeColor = card.color === 'wild' ? action.color : card.color;
    event(game, 'play', { playerId, card: copy(card), color: game.activeColor,
      text: `${player.name} ${verb(player.name, 'plays', 'play')} ${card.color === 'wild' ? '' : `${card.color} `}${card.value}.` });

    let steps = 1;
    if (card.value === 'reverse') {
      game.direction *= -1;
      steps = game.players.length === 2 ? 2 : 1;
      event(game, 'reverse', { playerId, text: 'Direction reversed.' });
    } else if (card.value === 'skip') {
      const skipped = game.players[nextIndex(game)];
      steps = 2;
      event(game, 'skip', { playerId, targetId: skipped.id, text: `${skipped.name} ${verb(skipped.name, 'is', 'are')} skipped.` });
    } else if (card.value === 'draw2' || card.value === 'wild4') {
      const amount = card.value === 'draw2' ? 2 : 4;
      game.pendingDraw += amount;
      game.pendingDrawValue = card.value;
      event(game, card.value, { playerId, targetId: game.players[nextIndex(game)].id,
        amount: game.pendingDraw, color: game.activeColor, text: `Next player draws ${game.pendingDraw}.` });
    } else if (card.value === 'wild') {
      event(game, 'wild', { playerId, color: game.activeColor, text: `${player.name} ${verb(player.name, 'chooses', 'choose')} ${game.activeColor}.` });
    }

    if (game.options.sevenZero && card.value === '7') {
      const target = game.players[swapIndex];
      [player.hand, target.hand] = [target.hand, player.hand];
      // A recipient cannot be penalized for being handed a one-card hand.
      target.called = target.hand.length === 1;
      player.called = false;
      event(game, 'swap', { playerId, targetId: target.id, text: `${player.name} ${verb(player.name, 'swaps', 'swap')} with ${target.name}.` });
    } else if (game.options.sevenZero && card.value === '0') {
      const hands = game.players.map((entry) => entry.hand);
      for (let i = 0; i < game.players.length; i++) {
        game.players[nextIndex(game, i)].hand = hands[i];
      }
      for (const entry of game.players) entry.called = entry.id !== playerId && entry.hand.length === 1;
      event(game, 'rotate', { playerId, text: 'All hands rotate with the direction of play.' });
    }
    setWarning(game, playerIndex, action.call === true);
    advance(game, steps);
    finishIfEmpty(game, rng);
  } else {
    throw new Error('That action is not supported.');
  }
  game.version++;
  return game;
}

export function viewFor(game, playerId) {
  const index = game.players.findIndex((player) => player.id === playerId);
  if (index < 0) throw new Error('You do not have a seat in this game.');
  const isTurn = index === game.currentIndex && game.phase === 'playing';
  // Explicit allowlisting is intentional. Never spread authoritative game state.
  return {
    phase: game.phase,
    players: game.players.map(({ id, name, bot, difficulty, avatar, hand, called }) =>
      ({ id, name, bot, difficulty, avatar, count: hand.length, called })),
    you: playerId,
    hand: copy(game.players[index].hand),
    currentPlayerId: game.players[game.currentIndex].id,
    direction: game.direction,
    topCard: copy(game.discard[game.discard.length - 1]),
    activeColor: game.activeColor,
    drawCount: game.deck.length,
    legalCardIds: legalIds(game, index),
    canDraw: Boolean(isTurn && !game.drawnCardId),
    canPass: Boolean(isTurn && game.drawnCardId),
    pendingDraw: game.pendingDraw,
    drawnCardId: isTurn ? game.drawnCardId : null,
    winnerId: game.winnerId,
    vulnerablePlayerId: game.vulnerablePlayerId,
    options: { ...game.options },
    turn: game.turn,
    version: game.version,
    events: copy(game.events),
  };
}

function colorForHand(hand, difficulty, rng) {
  const counts = Object.fromEntries(COLORS.map((color) => [color, 0]));
  for (const card of hand) if (card.color !== 'wild') counts[card.color] += 1;
  if (difficulty === 'easy' && chance(0.25, rng)) return COLORS[randomIndex(COLORS.length, rng)];
  const max = Math.max(...Object.values(counts));
  const choices = COLORS.filter((color) => counts[color] === max);
  return choices[randomIndex(choices.length, rng)];
}

/** A strategy based solely on the bot's own cards and public player counts. */
export function chooseBotAction(view, difficulty = 'medium', rng) {
  if (view.phase !== 'playing') throw new Error('This round has ended.');
  if (!DIFFICULTIES.includes(difficulty)) difficulty = 'medium';
  const me = view.players.find((player) => player.id === view.you);
  if (!me) throw new Error('The bot has no seat.');
  if (view.vulnerablePlayerId === view.you && view.hand.length === 1 && !me.called) return { type: 'call' };
  if (view.vulnerablePlayerId && view.vulnerablePlayerId !== view.you &&
    (difficulty === 'expert' || difficulty === 'hard' || chance(difficulty === 'medium' ? 0.85 : 0.4, rng))) {
    return { type: 'catch', targetId: view.vulnerablePlayerId };
  }
  const legal = view.hand.filter((card) => view.legalCardIds.includes(card.id));
  if (!legal.length) {
    if (view.canPass) return { type: 'pass' };
    if (view.canDraw) return { type: 'draw' };
    throw new Error('The bot has no legal action right now.');
  }
  const myIndex = view.players.findIndex((player) => player.id === view.you);
  const next = view.players[wrap(myIndex + view.direction, view.players.length)];
  const previous = view.players[wrap(myIndex - view.direction, view.players.length)];
  const opponents = view.players.filter((player) => player.id !== view.you);
  const smallestOpponent = [...opponents].sort((a, b) => a.count - b.count)[0];
  // Every candidate is scored against information already present in the view.
  const evaluate = (card) => {
    const rest = view.hand.filter((entry) => entry.id !== card.id);
    const selectedColor = card.color === 'wild' ? colorForHand(rest, difficulty, rng) : card.color;
    const matchingColor = rest.filter((entry) => entry.color === selectedColor).length;
    const matchingFace = rest.filter((entry) => entry.value === card.value && entry.color !== 'wild').length;
    const actionCard = ['skip', 'reverse', 'draw2', 'wild4'].includes(card.value);
    let score = matchingColor * 2 + matchingFace * 0.35;
    if (/^\d$/.test(card.value)) score += Number(card.value) * 0.06;
    if (card.color === 'wild') score -= 5;
    if (actionCard) score += next.count <= 2 ? 8 : 1;
    if (card.value === 'reverse' && view.players.length > 2) score += (previous.count - next.count) * 1.4;
    if (view.hand.length <= 3 && card.color === 'wild') score += 3;
    if (difficulty === 'expert') {
      // Preserve flexible wilds, build a dominant suit, disrupt imminent exits.
      score += matchingColor * 0.9;
      if (next.count === 1 && actionCard) score += 15;
      if (next.count === 1 && card.color === 'wild' && !actionCard) score += 2;
      if (rest.length === 1 && rest[0].color === 'wild') score += 12;
      if (card.value === 'reverse' && previous.count === 1 && view.players.length > 2) score -= 18;
      if (card.value === 'skip' && view.players.length === 2 && matchingColor) score += 6;
      if (card.value === 'reverse' && view.players.length === 2 && matchingColor) score += 6;
    }
    if (view.options.sevenZero && card.value === '7') {
      score += (rest.length - smallestOpponent.count) * 4;
      if (rest.length === 0) score -= 1000; // Avoid giving an empty hand away.
    }
    if (view.options.sevenZero && card.value === '0') {
      score += (rest.length - previous.count) * 3.5;
      if (rest.length === 0) score -= 1000;
    }
    return { card, color: selectedColor, targetId: smallestOpponent.id, score };
  };
  const candidates = legal.map(evaluate);
  let chosen;
  if (difficulty === 'easy') {
    chosen = candidates[randomIndex(candidates.length, rng)];
  } else {
    const noise = difficulty === 'medium' ? 7 : difficulty === 'hard' ? 1.5 : 0.3;
    for (const candidate of candidates) candidate.score += randomIndex(1000, rng) / 1000 * noise;
    candidates.sort((a, b) => b.score - a.score);
    chosen = candidates[0];
  }
  const action = { type: 'play', cardId: chosen.card.id };
  if (chosen.card.color === 'wild') action.color = chosen.color;
  if (view.options.sevenZero && chosen.card.value === '7') action.targetId = chosen.targetId;
  // Call as part of the play; a one-card hand acquired via 7/0 is covered too.
  if (difficulty !== 'easy' || chance(0.9, rng)) action.call = true;
  return action;
}
