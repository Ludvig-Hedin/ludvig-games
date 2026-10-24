import test from 'node:test';
import assert from 'node:assert/strict';
import { COLORS, createGame, transition, viewFor, chooseBotAction } from '../core/game.mjs';

const players = (count = 4) => Array.from({ length: count }, (_, i) => ({ id: `p${i}`, name: `Player ${i + 1}`, bot: true, avatar: i, difficulty: 'expert' }));
function seeded(seed = 1) {
  let n = seed >>> 0;
  return () => { n += 0x6D2B79F5; let t = n; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
function fixture(hands, top = 'red:5', options = {}) {
  const game = createGame(players(hands.length), options, seeded(1));
  const pool = [...game.deck, ...game.discard, ...game.players.flatMap((player) => player.hand)];
  const take = (spec) => {
    const [color, value] = spec.split(':');
    const i = pool.findIndex((card) => card.color === color && card.value === value);
    assert.notEqual(i, -1, `Fixture needs another ${spec}`);
    return pool.splice(i, 1)[0];
  };
  game.discard = [take(top)];
  game.activeColor = game.discard[0].color === 'wild' ? 'red' : game.discard[0].color;
  game.players.forEach((player, i) => { player.hand = hands[i].map(take); player.called = false; });
  game.deck = pool;
  game.events = []; game.eventSeq = 0;
  return game;
}
function card(game, index, value, color) {
  return game.players[index].hand.find((entry) => entry.value === value && (!color || entry.color === color));
}
function play(game, index, value, extra = {}, color) {
  return transition(game, `p${index}`, { type: 'play', cardId: card(game, index, value, color).id, ...extra }, seeded(2));
}
function deckTop(game, spec) {
  const [color, value] = spec.split(':');
  const i = game.deck.findIndex((entry) => entry.color === color && entry.value === value);
  assert.notEqual(i, -1);
  game.deck.push(game.deck.splice(i, 1)[0]);
}
function invariant(game) {
  const all = [...game.deck, ...game.discard, ...game.players.flatMap((player) => player.hand)];
  assert.equal(all.length, 108, 'all cards conserved');
  assert.equal(new Set(all.map((entry) => entry.id)).size, 108, 'no card duplication');
  assert.ok(COLORS.includes(game.activeColor));
  assert.ok(game.currentIndex >= 0 && game.currentIndex < game.players.length);
  assert.ok(game.direction === 1 || game.direction === -1);
  assert.ok(game.discard.length >= 1);
  assert.ok(game.events.length <= 32);
  if (game.phase === 'finished') assert.equal(game.players.find((entry) => entry.id === game.winnerId).hand.length, 0);
}

test('deck distribution, player limits and clean default start', () => {
  for (let count = 2; count <= 6; count++) {
    const game = createGame(players(count), {}, seeded(count));
    invariant(game);
    assert.equal(game.players.every((player) => player.hand.length === 7), true);
    assert.match(game.discard[0].value, /^\d$/);
    assert.deepEqual(game.options, { stacking: false, jumpIn: false, sevenZero: false, quickPlay: false });
    assert.equal(viewFor(game, 'p0').currentPlayerId, 'p0');
    const all = [...game.deck, ...game.discard, ...game.players.flatMap((player) => player.hand)];
    for (const color of COLORS) assert.equal(all.filter((entry) => entry.color === color).length, 25);
    assert.equal(all.filter((entry) => entry.value === 'wild').length, 4);
    assert.equal(all.filter((entry) => entry.value === 'wild4').length, 4);
  }
  assert.throws(() => createGame(players(1)), /2–6/);
  assert.throws(() => createGame(players(7)), /2–6/);
  assert.throws(() => createGame([{id:'a'}, {id:'a'}]), /unique/);
  assert.equal(createGame(players(3), { quickPlay: true }, seeded()).players[0].hand.length, 5);
});

test('production shuffle uses crypto and all injected randomness stays in range', () => {
  invariant(createGame(players(6)));
  assert.throws(() => createGame(players(2), {}, () => 1), /RNG/);
  assert.throws(() => createGame(players(2), {}, () => -1), /RNG/);
  assert.notDeepEqual(createGame(players(2), {}, seeded(3)).deck, createGame(players(2), {}, seeded(4)).deck);
  assert.deepEqual(createGame(players(2), {}, seeded(3)).deck, createGame(players(2), {}, seeded(3)).deck);
});

test('matches color, number and symbols; rejects absent or illegal cards immutably', () => {
  const game = fixture([['red:3','blue:5','green:9','wild:wild'], ['yellow:3','blue:7']]);
  const before = structuredClone(game);
  const view = viewFor(game, 'p0');
  assert.deepEqual(view.legalCardIds.sort(), ['3','5','wild'].map((value) => card(game,0,value).id).sort());
  assert.throws(() => play(game,0,'9'), /Match/);
  assert.throws(() => transition(game,'p0',{ type:'play',cardId:'invented' }), /not in your hand/);
  assert.throws(() => transition(game,'outsider',{type:'draw'}), /seat/);
  assert.deepEqual(game,before);
  const result = play(game,0,'5');
  assert.equal(result.activeColor,'blue');
  assert.equal(result.currentIndex,1);
  assert.deepEqual(game,before);
  const symbols = fixture([['blue:skip','green:8'],['red:7','green:1']], 'red:skip');
  assert.ok(viewFor(symbols,'p0').legalCardIds.includes(card(symbols,0,'skip').id));
});

test('skip and reverse handle every direction, seat and player count', () => {
  for (const count of [2,3,4,5,6]) {
    for (const direction of [1,-1]) {
      for (let index = 0; index < count; index++) {
        for (const value of ['skip','reverse']) {
          const hands = Array.from({length:count},(_,i) => i === index ? [`red:${value}`,'blue:8'] : ['green:1']);
          // More than two green 1 cards require independent filler values.
          for (let i=0;i<count;i++) if(i!==index) hands[i]=[`yellow:${i+1}`];
          const game=fixture(hands); game.currentIndex=index; game.direction=direction;
          const result=play(game,index,value,{call:true});
          const expectedDirection=value==='reverse' ? -direction : direction;
          const steps=value==='skip'||count===2 ? 2 : 1;
          assert.equal(result.direction,expectedDirection);
          assert.equal(result.currentIndex,((index+expectedDirection*steps)%count+count)%count);
          invariant(result);
        }
      }
    }
  }
});

test('default draw-two cannot stack; penalty is consumed and skips the turn', () => {
  let game=fixture([['red:draw2','green:3'],['blue:draw2','blue:2'],['yellow:7']]);
  game=play(game,0,'draw2');
  assert.equal(game.pendingDraw,2);
  assert.equal(game.currentIndex,1);
  assert.deepEqual(viewFor(game,'p1').legalCardIds,[]);
  assert.throws(()=>play(game,1,'draw2'),/Match/);
  game=transition(game,'p1',{type:'draw'},seeded(4));
  assert.equal(game.players[1].hand.length,4);
  assert.equal(game.pendingDraw,0);
  assert.equal(game.currentIndex,2);
  invariant(game);
});

test('wild requires a color; draw-four enforces the active-color restriction', () => {
  const wild=fixture([['wild:wild','red:7'],['yellow:8']]);
  assert.throws(()=>play(wild,0,'wild'),/Choose a color/);
  assert.throws(()=>play(wild,0,'wild',{color:'magenta'}),/Choose a color/);
  const chosen=play(wild,0,'wild',{color:'green'});
  assert.equal(chosen.activeColor,'green');
  assert.equal(chosen.discard.at(-1).color,'wild');
  const forbidden=fixture([['wild:wild4','red:7'],['blue:8']]);
  assert.equal(viewFor(forbidden,'p0').legalCardIds.includes(card(forbidden,0,'wild4').id),false);
  assert.throws(()=>play(forbidden,0,'wild4',{color:'green'}),/no cards in the active color/);
  let valid=fixture([['wild:wild4','blue:5'],['yellow:8'],['green:2']]);
  valid=play(valid,0,'wild4',{color:'yellow'});
  assert.equal(valid.pendingDraw,4);
  valid=transition(valid,'p1',{type:'draw'},seeded());
  assert.equal(valid.players[1].hand.length,5);
  assert.equal(valid.currentIndex,2);
});

test('draw once: automatically pass nonmatch, allow only drawn matching card or pass', () => {
  let game=fixture([['red:2','blue:8'],['green:6']]);
  deckTop(game,'red:9');
  game=transition(game,'p0',{type:'draw'});
  assert.equal(game.currentIndex,0);
  assert.equal(viewFor(game,'p0').canPass,true);
  assert.deepEqual(viewFor(game,'p0').legalCardIds,[game.drawnCardId]);
  assert.throws(()=>play(game,0,'2'),/Match/);
  assert.throws(()=>transition(game,'p0',{type:'draw'}),/drawn card/);
  assert.equal(viewFor(game,'p1').drawnCardId,null);
  const result=play(game,0,'9');
  assert.equal(result.currentIndex,1);
  const passed=transition(game,'p0',{type:'pass'});
  assert.equal(passed.currentIndex,1);
  assert.equal(passed.players[0].hand.length,3);
  let other=fixture([['blue:2'],['green:6']]);
  deckTop(other,'yellow:9');
  other=transition(other,'p0',{type:'draw'});
  assert.equal(other.currentIndex,1);
  assert.equal(other.drawnCardId,null);
  assert.throws(()=>transition(other,'p1',{type:'pass'}),/Draw a card/);
});

test('CLASH pre-call, late call, caught call, and closing catch window', () => {
  const base=fixture([['red:2','blue:9'],['red:7','yellow:9'],['green:3']]);
  const called=play(base,0,'2',{call:true});
  assert.equal(called.players[0].called,true);
  assert.equal(called.vulnerablePlayerId,null);
  assert.throws(()=>transition(called,'p1',{type:'catch',targetId:'p0'}),/no missed/);
  const missed=play(base,0,'2');
  assert.equal(missed.vulnerablePlayerId,'p0');
  assert.throws(()=>transition(missed,'p0',{type:'catch',targetId:'p0'}),/no missed/);
  const late=transition(missed,'p0',{type:'call'});
  assert.equal(late.vulnerablePlayerId,null);
  assert.equal(late.players[0].called,true);
  const caught=transition(missed,'p2',{type:'catch',targetId:'p0'},seeded(4));
  assert.equal(caught.players[0].hand.length,3);
  assert.equal(caught.currentIndex,1);
  assert.equal(caught.vulnerablePlayerId,null);
  const closed=play(missed,1,'7',{call:true});
  assert.throws(()=>transition(closed,'p2',{type:'catch',targetId:'p0'}),/no missed/);
  assert.throws(()=>transition(base,'p0',{type:'call'}),/one card/);
});

test('same-symbol stacks accumulate; mixed stacks rejected; stacking +4 cannot cheat', () => {
  let game=fixture([['red:draw2','blue:3'],['blue:draw2','wild:wild4'],['green:8']], 'red:5',{stacking:true});
  game=play(game,0,'draw2');
  assert.ok(viewFor(game,'p1').legalCardIds.includes(card(game,1,'draw2').id));
  assert.throws(()=>play(game,1,'wild4',{color:'yellow'}),/Match/);
  game=play(game,1,'draw2');
  assert.equal(game.pendingDraw,4);
  game=transition(game,'p2',{type:'draw'});
  assert.equal(game.players[2].hand.length,5);
  assert.equal(game.currentIndex,0);
  let fours=fixture([['wild:wild4','blue:3'],['wild:wild4','green:2'],['yellow:8']], 'red:5',{stacking:true});
  fours=play(fours,0,'wild4',{color:'green'});
  assert.throws(()=>play(fours,1,'wild4',{color:'blue'}),/no cards in the active color/);
  let legal=fixture([['wild:wild4','blue:3'],['wild:wild4','blue:2'],['yellow:8']], 'red:5',{stacking:true});
  legal=play(legal,0,'wild4',{color:'green'});
  legal=play(legal,1,'wild4',{color:'red'});
  assert.equal(legal.pendingDraw,8);
});

test('jump-in is exact, redirects turn order, and cannot interrupt draw resolution', () => {
  let game=fixture([['green:2'],['red:5','yellow:9'],['blue:8']], 'red:5',{jumpIn:true});
  assert.deepEqual(viewFor(game,'p1').legalCardIds,[card(game,1,'5').id]);
  game=play(game,1,'5',{call:true});
  assert.equal(game.currentIndex,2);
  assert.ok(game.events.some((entry)=>entry.type==='jumpIn'));
  const disabled=fixture([['green:2'],['red:5','yellow:9']], 'red:5');
  assert.throws(()=>play(disabled,1,'5'),/Match/);
  let drawn=fixture([['green:2'],['red:5','yellow:9']], 'red:5',{jumpIn:true});
  deckTop(drawn,'red:7');
  drawn=transition(drawn,'p0',{type:'draw'});
  assert.deepEqual(viewFor(drawn,'p1').legalCardIds,[]);
  let penalty=fixture([['red:draw2','green:2'],['red:draw2','yellow:9'],['blue:8']], 'red:5',{jumpIn:true});
  penalty=play(penalty,0,'draw2');
  assert.deepEqual(viewFor(penalty,'p1').legalCardIds,[]);
  const wild=fixture([['green:2'],['wild:wild','yellow:9']], 'wild:wild',{jumpIn:true});
  assert.deepEqual(viewFor(wild,'p1').legalCardIds,[]);
});

test('seven swaps chosen hands and checks victory after transfer', () => {
  const base=fixture([['red:7','blue:2'],['green:3','green:4','green:5'],['blue:6']], 'red:5',{sevenZero:true});
  assert.throws(()=>play(base,0,'7'),/Choose another/);
  assert.throws(()=>play(base,0,'7',{targetId:'p0'}),/Choose another/);
  const game=play(base,0,'7',{targetId:'p1'});
  assert.equal(game.players[0].hand.length,3);
  assert.equal(game.players[1].hand.length,1);
  assert.equal(game.players[1].called,true);
  assert.equal(game.phase,'playing');
  invariant(game);
  const final=fixture([['red:7'],['blue:3','green:3']], 'red:5',{sevenZero:true});
  const ended=play(final,0,'7',{targetId:'p1'});
  assert.equal(ended.winnerId,'p1');
  assert.equal(ended.players[1].hand.length,0);
});

test('zero rotates all hands in either direction; zero final card gives recipient win', () => {
  for (const direction of [1,-1]) {
    const game=fixture([['red:0','blue:3'],['green:4','green:5','green:6'],['yellow:9']], 'red:5',{sevenZero:true});
    game.direction=direction;
    const before=game.players.map((entry)=>entry.hand.map((c)=>c.id));
    const result=play(game,0,'0',{call:true});
    for(let i=0;i<3;i++) {
      const destination=((i+direction)%3+3)%3;
      const expected=i===0 ? before[i].filter((id)=>id!==card(game,0,'0').id) : before[i];
      assert.deepEqual(result.players[destination].hand.map((c)=>c.id),expected);
    }
    invariant(result);
    const final=fixture([['red:0'],['green:4'],['yellow:9']], 'red:5',{sevenZero:true});
    final.direction=direction;
    const ended=play(final,0,'0');
    assert.equal(ended.winnerId,direction===1?'p1':'p2');
  }
});

test('victory resolves every type of final card and rejects further actions', () => {
  for(const value of ['2','skip','reverse','draw2','wild','wild4']) {
    const color=value.startsWith('wild')?'wild':'red';
    const base=fixture([[`${color}:${value}`],['green:7'],['yellow:9']]);
    const game=play(base,0,value,color==='wild'?{color:'blue'}:{});
    assert.equal(game.phase,'finished');
    assert.equal(game.winnerId,'p0');
    assert.equal(game.pendingDraw,0);
    assert.equal(game.events.at(-1).type,'win');
    if(value==='draw2') assert.equal(game.players[1].hand.length,3);
    if(value==='wild4') assert.equal(game.players[1].hand.length,5);
    assert.throws(()=>transition(game,'p1',{type:'draw'}),/ended/);
    invariant(game);
  }
});

test('exhausted deck recycles discards but preserves top, never duplicates cards', () => {
  const game=fixture([['blue:8'],['green:7']]);
  const top=game.discard[0];
  game.discard=[...game.deck,top]; game.deck=[];
  const result=transition(game,'p0',{type:'draw'},seeded(3));
  assert.equal(result.discard.at(-1).id,top.id);
  assert.ok(result.events.some((entry)=>entry.type==='reshuffle'));
  invariant(result);
  const empty=fixture([['blue:8'],['green:7']]);
  empty.players[1].hand.push(...empty.deck);empty.deck=[];
  const noDraw=transition(empty,'p0',{type:'draw'});
  assert.equal(noDraw.currentIndex,1);
  assert.equal(noDraw.players[0].hand.length,1);
  invariant(noDraw);
});

test('views never expose deck order, opponent hands or secretly drawn card IDs', () => {
  const game=createGame(players(6),{},seeded(7));
  for(const player of game.players) {
    const view=viewFor(game,player.id);
    assert.equal(view.deck,undefined);
    assert.equal(view.discard,undefined);
    for(const other of view.players) assert.equal(other.hand,undefined);
    const visible=JSON.stringify(view);
    for(const opponent of game.players.filter((entry)=>entry.id!==player.id)) {
      for(const hidden of opponent.hand) assert.equal(visible.includes(`"${hidden.id}"`),false);
    }
    view.hand[0].value='tampered';
    view.players[0].name='tampered';
    view.topCard.color='tampered';
    assert.notEqual(game.players[0].name,'tampered');
    assert.notEqual(game.discard.at(-1).color,'tampered');
    assert.ok(game.players.flatMap((entry)=>entry.hand).every((entry)=>entry.value!=='tampered'));
  }
  assert.throws(()=>viewFor(game,'outsider'),/seat/);
  let drawn=fixture([['blue:2'],['green:9']]);
  deckTop(drawn,'red:7');
  drawn=transition(drawn,'p0',{type:'draw'});
  const opponent=viewFor(drawn,'p1');
  assert.equal(opponent.drawnCardId,null);
  assert.equal(JSON.stringify(opponent).includes(`"${drawn.drawnCardId}"`),false);
  assert.equal(opponent.events.some((entry)=>entry.type==='draw'&&entry.card),false);
});

test('hard bots select public-count tactical disruption and useful wild colors', () => {
  const base=fixture([['red:2','red:skip','blue:9'],['yellow:3'],['green:4','green:5','green:6']]);
  const action=chooseBotAction(viewFor(base,'p0'),'expert',seeded(5));
  assert.equal(action.cardId,card(base,0,'skip').id);
  const color=fixture([['wild:wild','blue:1','blue:2','green:4'],['yellow:5']]);
  // Make the Wild the only playable card.
  const choice=chooseBotAction(viewFor(color,'p0'),'hard',seeded(5));
  assert.equal(choice.color,'blue');
  assert.equal(choice.call,true);
});

test('400 complete seeded AI matches preserve legal moves and card conservation', () => {
  const difficulties=['easy','medium','hard','expert'];
  let longest=0;let total=0;
  for(let match=0;match<400;match++) {
    const rng=seeded(1000+match);
    const options={stacking:Boolean(match&1),jumpIn:Boolean(match&2),sevenZero:Boolean(match&4),quickPlay:Boolean(match&8)};
    let game=createGame(players(2+match%5),options,rng);
    let moves=0;
    while(game.phase==='playing' && moves<5000) {
      invariant(game);
      const id=game.players[game.currentIndex].id;
      const view=viewFor(game,id);
      const action=chooseBotAction(view,difficulties[(match+moves)%4],rng);
      try { game=transition(game,id,action,rng); }
      catch(error) { throw new Error(`Match ${match}, move ${moves}, ${JSON.stringify(action)}: ${error.message}`); }
      moves++;
    }
    assert.equal(game.phase,'finished',`Match ${match} failed to terminate`);
    invariant(game);
    longest=Math.max(longest,moves);total+=moves;
  }
  console.log(`400 complete matches: ${total} actions; longest ${longest}.`);
});
