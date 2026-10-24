'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, ChevronDown, ChevronRight, Copy, Crown, Globe2, HelpCircle, Link2, LoaderCircle, LogOut, Minus, Monitor, Moon, Music2, Plus, RotateCcw, Settings2, ShieldCheck, Sparkles, Users, Volume2, VolumeX, X, Zap } from 'lucide-react';
import { GameCard, Avatar } from '../components/game-card';
import { audio } from '../lib/audio';
// @ts-ignore Dependency-free engine shared by browser and authoritative server.
import { createGame, transition, viewFor, chooseBotAction } from '../core/game.mjs';

type Card = { id: string; color: string; value: string };
type Player = { id: string; name: string; avatar: number; bot?: boolean; difficulty?: string; count?: number; called?: boolean; connected?: boolean };
type Options = { stacking: boolean; jumpIn: boolean; sevenZero: boolean; quickPlay: boolean };
type View = { phase: string; players: Player[]; you: string; hand: Card[]; currentPlayerId: string; direction: number; topCard: Card; activeColor: string; drawCount: number; legalCardIds: string[]; canDraw: boolean; canPass: boolean; pendingDraw: number; winnerId: string | null; vulnerablePlayerId: string | null; options: Options; turn: number; version: number; events: any[] };
type Room = { code: string; hostId: string; phase: string; players: Player[]; options: Options; difficulty: string; version: number; game: View | null };
type Session = { code: string; token: string; playerId: string };
type Flight = { key: number; card?: Card; x: number; y: number; dx: number; dy: number; width: number; back?: boolean };
const DEFAULT_OPTIONS: Options = { stacking: false, jumpIn: false, sevenZero: false, quickPlay: false };
const BOT_NAMES = ['Nova', 'Milo', 'Cleo', 'Jules', 'Otto'];
const COLOR_NAMES: Record<string, string> = { red: 'Coral', yellow: 'Gold', green: 'Jade', blue: 'Blue', wild: 'Wild' };
const CARD_LABELS: Record<string, string> = { skip: 'skip', reverse: 'reverse', draw2: 'draw two', wild: 'wild', wild4: 'wild draw four' };
function ColorShape({ color }: { color: string }) {
  const shape = color === 'red' ? <circle cx="12" cy="12" r="8"/> : color === 'yellow' ? <path d="M12 3l9 9-9 9-9-9z"/> : color === 'green' ? <path d="M12 4l9 16H3z"/> : <rect x="4" y="4" width="16" height="16" rx="2"/>;
  return <svg width="1em" height="1em" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">{shape}</svg>;
}
const RULES = [
  ['The first empty hand wins.', 'Start with seven cards. Match the active color, number, or symbol. Wilds choose the next color.'],
  ['Draw one.', 'You can draw one card instead of playing. Play that new card if it fits, or keep it and pass.'],
  ['Action cards.', 'Skip misses the next player. Reverse changes direction; with two players, it skips. +2 and +4 force a draw and skip that turn.'],
  ['Wild +4 has one condition.', 'Play it only when your hand has no card in the active color. The game checks this automatically.'],
  ['One card? Call CLASH!', 'Arm CLASH before playing your second-last card, or call it while holding one. Someone can catch a missed call for a two-card penalty until the next turn action.'],
  ['House rules.', 'Default: no stacking, jump-ins, or hand swaps. House rules are opt-in and shown before each match.'],
];
const ruleInfo: { key: keyof Options; name: string; description: string }[] = [
  { key: 'stacking', name: 'Draw stacking', description: '+2 on +2. +4 on +4. The next player pays.' },
  { key: 'jumpIn', name: 'Jump-in', description: 'Play an identical colored card out of turn.' },
  { key: 'sevenZero', name: 'Seven–zero', description: '7 swaps hands. 0 rotates every hand.' },
  { key: 'quickPlay', name: 'Quick play', description: 'Five cards each. Straight into the action.' },
];
function describeCard(c: Card) { return `${COLOR_NAMES[c.color] || c.color} ${CARD_LABELS[c.value] || c.value}`; }
function safeStored(key: string, fallback: any = null) { try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; } catch { return fallback; } }
function saveStored(key: string, value: any) { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} }
function removeStored(key: string) { try { localStorage.removeItem(key); } catch {} }
function Brand({ small = false, onClick }: { small?: boolean; onClick?: () => void }) { return <button type="button" className={`brand ${small ? 'small' : ''}`} onClick={onClick} aria-label="Color Clash home"><span className="brand-mark"><i/><i/><i/><i/></span><span>Color<span className="brand-clash">Clash</span></span></button>; }
function Switch({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) { return <button type="button" className={`switch ${checked ? 'on' : ''}`} role="switch" aria-checked={checked} aria-label={label} onClick={onChange}><span/></button>; }

export default function ColorClash() {
  const [screen, setScreen] = useState<'home' | 'game' | 'lobby'>('home');
  const [modal, setModal] = useState<null | 'solo' | 'local' | 'friends' | 'rules' | 'settings' | 'leave'>(null);
  const [mode, setMode] = useState<'solo' | 'local' | 'online'>('solo');
  const [difficulty, setDifficulty] = useState('medium');
  const [botCount, setBotCount] = useState(3);
  const [localSeats, setLocalSeats] = useState([{ name: 'Player 1', bot: false }, { name: 'Player 2', bot: false }]);
  const [options, setOptions] = useState<Options>({ ...DEFAULT_OPTIONS });
  const [showHouse, setShowHouse] = useState(false);
  const [name, setName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [friendTab, setFriendTab] = useState<'create' | 'join'>('create');
  const [localGame, setLocalGame] = useState<any>(null);
  const localGameRef = useRef<any>(null);
  const [localViewer, setLocalViewer] = useState<string | null>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [busy, setBusy] = useState(false);
  const [network, setNetwork] = useState<'connected' | 'reconnecting'>('connected');
  const [sound, setSound] = useState(true);
  const [music, setMusic] = useState(false);
  const [preferencesReady, setPreferencesReady] = useState(false);
  const [coarse, setCoarse] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [callArmed, setCallArmed] = useState(false);
  const [pendingCard, setPendingCard] = useState<Card | null>(null);
  const [toast, setToast] = useState('');
  const [flights, setFlights] = useState<Flight[]>([]);
  const [tableEffect, setTableEffect] = useState<{id:number; kind:string; text:string} | null>(null);
  const [copied, setCopied] = useState(false);
  const [stats, setStats] = useState({ played: 0, won: 0 });
  const [showResult, setShowResult] = useState(true);
  const toastTimer = useRef<any>(null);
  const lastEvent = useRef(-1);
  const lastSeenView = useRef<View | null>(null);
  const statsRecorded = useRef(false);
  const cardRects = useRef<Record<string, DOMRect>>({});
  const handRef = useRef<HTMLDivElement>(null);
  const drawRef = useRef<HTMLButtonElement>(null);
  const discardRef = useRef<HTMLDivElement>(null);
  const mutating = useRef(false);
  const roomRef = useRef<Room | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const pollFailures = useRef(0);

  const say = useCallback((message: string) => { setToast(message); clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(''), 3600); }, []);
  const resetTransient = () => { setSelected(null); setPendingCard(null); setCallArmed(false); setShowResult(true); statsRecorded.current = false; lastEvent.current = -1; lastSeenView.current = null; cardRects.current = {}; setTableEffect(null); };
  useEffect(() => {
    const s = safeStored('cc-sound', true); const m = safeStored('cc-music', false);
    setSound(s); setMusic(m); audio.setEnabled(s); audio.setMusic(m); setPreferencesReady(true);
    setName(safeStored('cc-name', '')); setStats(safeStored('cc-stats', { played: 0, won: 0 }));
    const mq = matchMedia('(pointer: coarse)'); setCoarse(mq.matches); const mediaChange = () => setCoarse(mq.matches); mq.addEventListener('change', mediaChange);
    const code = new URL(location.href).searchParams.get('room')?.toUpperCase();
    if (code) { setJoinCode(code); const saved = safeStored(`cc-room-${code}`); if (saved?.token) { sessionRef.current = saved; setSession(saved); setBotCount(0); setMode('online'); setScreen('lobby'); } else { setFriendTab('join'); setModal('friends'); } }
    const unlock = () => { audio.unlock(); }; document.addEventListener('pointerdown', unlock, { once: true });
    return () => { mq.removeEventListener('change', mediaChange); document.removeEventListener('pointerdown', unlock); audio.dispose(); };
  }, []);
  useEffect(() => { if (preferencesReady) { audio.setEnabled(sound); saveStored('cc-sound', sound); } }, [sound, preferencesReady]);
  useEffect(() => { if (preferencesReady) { audio.setMusic(music); saveStored('cc-music', music); } }, [music, preferencesReady]);
  useEffect(() => { localGameRef.current = localGame; }, [localGame]);
  useEffect(() => { roomRef.current = room; }, [room]);

  const activeHuman = localGame?.players?.find((p: any) => !p.bot)?.id;
  const view: View | null = mode === 'online' ? room?.game || null : localGame ? viewFor(localGame, mode === 'solo' ? activeHuman : localViewer || activeHuman) : null;
  const current = view?.players.find(p => p.id === view.currentPlayerId);
  const me = view?.players.find(p => p.id === view.you);
  const privacy = mode === 'local' && !!view && view.phase === 'playing' && !current?.bot && current?.id !== localViewer;
  const hideHand = mode === 'local' && (!localViewer || privacy);
  const myTurn = !!view && view.currentPlayerId === view.you && !privacy && view.phase === 'playing';
  const canAct = !!view && view.phase === 'playing' && !busy && !privacy && !hideHand;
  const selectedCard = view?.hand.find(c => c.id === selected);
  const opponents = view ? (() => { const i = view.players.findIndex(p => p.id === view.you); return [...view.players.slice(i + 1), ...view.players.slice(0, i)]; })() : [];

  const api = useCallback(async (path: string, body?: any, auth?: Session | null) => {
    let response: Response;
    try { response = await fetch(`/api/rooms${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${auth.token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body), cache: 'no-store', signal: AbortSignal.timeout(12000) }); } catch { throw new Error('Could not connect to this table.'); }
    // Platform error pages (429, 503, daily limit 1027) are HTML, not JSON: fall back to the existing message.
    const data: any = await response.json().catch(() => ({})); if (!response.ok) { const e: any = new Error(data.error || 'Could not connect to this table.'); e.status = response.status; e.room = data.room; throw e; } return data;
  }, []);
  const acceptRoom = useCallback((next: Room) => {
    const previous = roomRef.current;
    if (!next || (previous?.code === next.code && next.version < previous.version)) return;
    setNetwork('connected'); pollFailures.current = 0;
    if (previous?.code === next.code && previous.version === next.version && previous.players.every((p, i) => p.connected === next.players[i]?.connected)) return;
    setRoom(next); roomRef.current = next; setScreen(next.phase === 'lobby' ? 'lobby' : 'game');
  }, []);
  useEffect(() => {
    if (!session || mode !== 'online') return;
    let active = true; let polling = false; let timer: any;
    const poll = async () => {
      if (!active || polling) return;
      polling = true;
      try { if (!mutating.current) { const result = await api(`/${session.code}`, undefined, session); if (active && !mutating.current && sessionRef.current?.token === session.token) acceptRoom(result.room); } }
      catch (e: any) { if (active && sessionRef.current?.token === session.token) { pollFailures.current++; setNetwork('reconnecting'); if ([401, 403, 404, 410].includes(e.status)) { active = false; removeStored(`cc-room-${session.code}`); sessionRef.current = null; roomRef.current = null; setSession(null); setRoom(null); setScreen('home'); setModal('friends'); setFriendTab('join'); setJoinCode(session.code); say(e.message); return; } } }
      finally { polling = false; }
      // Free-plan budget: poll at most every 1.5 s, slower after a match or errors, and pause while the tab is hidden.
      if (active && !document.hidden) timer = setTimeout(poll, pollFailures.current > 2 || roomRef.current?.phase === 'finished' ? 4000 : 1500);
    };
    poll(); const reconnect = () => { clearTimeout(timer); if (active && !document.hidden) poll(); }; window.addEventListener('online', reconnect); document.addEventListener('visibilitychange', reconnect);
    return () => { active = false; clearTimeout(timer); window.removeEventListener('online', reconnect); document.removeEventListener('visibilitychange', reconnect); };
  }, [session, mode, api, acceptRoom, say]);

  const setGame = useCallback((game: any) => { localGameRef.current = game; setLocalGame(game); }, []);
  useEffect(() => {
    if (mode === 'online' || !localGame || localGame.phase === 'finished') return;
    const v = viewFor(localGame, localGame.players[0].id); const player = v.players.find((p: any) => p.id === v.currentPlayerId);
    if (!player?.bot) return;
    const id = setTimeout(() => {
      if (localGameRef.current !== localGame) return;
      try { const botView = viewFor(localGame, player.id); const action = chooseBotAction(botView, player.difficulty || difficulty); setGame(transition(localGame, player.id, action)); }
      catch (error: any) { say(error.message || 'Could not complete the turn.'); }
    }, 900 + (localGame.version % 4) * 90);
    return () => clearTimeout(id);
  }, [localGame, mode, difficulty, setGame, say]);

  const fly = useCallback((card: Card | undefined, from: DOMRect, to: DOMRect, back = false) => {
    const key = Date.now() + Math.random(); setFlights(f => [...f, { key, card, x: from.x, y: from.y, dx: to.x - from.x, dy: to.y - from.y, width: from.width || 90, back }]);
    setTimeout(() => setFlights(f => f.filter(x => x.key !== key)), 540);
  }, []);
  useEffect(() => {
    if (!view) return;
    if (lastSeenView.current?.phase === 'finished' && view.phase === 'playing') { setShowResult(true); statsRecorded.current = false; lastEvent.current = -1; }
    const initialDeal = !lastSeenView.current && view.phase === 'playing' && !hideHand;
    const fresh = view.events.filter(e => e.id > lastEvent.current);
    if (lastSeenView.current) {
      const special = fresh.filter(e => ['reverse','skip','draw2','wild4','call'].includes(e.type)).slice(-1)[0];
      if (special) { const text: Record<string,string> = { reverse: 'REVERSE ↶', skip: 'SKIPPED', draw2: '+2', wild4: '+4', call: 'CLASH!' }; setTableEffect({id:special.id,kind:special.type,text:text[special.type]}); }
    }
    if (initialDeal) requestAnimationFrame(() => {
      if (!drawRef.current) return;
      const from = drawRef.current.getBoundingClientRect();
      document.querySelectorAll<HTMLButtonElement>('[data-card-id]').forEach((el, i) => { const to = el.getBoundingClientRect(); setTimeout(() => fly(undefined,from,to,true),i*45); });
    });
    if (lastSeenView.current) for (const e of fresh) {
      if (e.type === 'play' && e.card && discardRef.current) {
        const from = cardRects.current[e.card.id] || document.querySelector(`[data-player="${e.playerId}"]`)?.getBoundingClientRect();
        if (from) fly(e.card, from, discardRef.current.getBoundingClientRect());
        audio.play('place');
      } else if (e.type === 'draw' && drawRef.current) {
        const target = e.playerId === view.you ? handRef.current : document.querySelector(`[data-player="${e.playerId}"]`);
        if (target) fly(undefined, drawRef.current.getBoundingClientRect(), target.getBoundingClientRect(), true);
        audio.play('draw');
      } else if (['reverse', 'skip', 'draw2', 'wild4', 'wild', 'call', 'win'].includes(e.type)) audio.play(e.type);
    }
    if (view.currentPlayerId === view.you && lastSeenView.current?.currentPlayerId !== view.you) audio.play('turn');
    if (view.events.length) lastEvent.current = Math.max(...view.events.map(e => e.id));
    lastSeenView.current = view;
    requestAnimationFrame(() => { document.querySelectorAll<HTMLButtonElement>('[data-card-id]').forEach(el => { cardRects.current[el.dataset.cardId!] = el.getBoundingClientRect(); }); });
    if (view.phase === 'finished' && !statsRecorded.current) {
      statsRecorded.current = true; const old = safeStored('cc-stats', { played: 0, won: 0 }); const next = { played: old.played + 1, won: old.won + (view.winnerId === view.you ? 1 : 0) }; setStats(next); saveStored('cc-stats', next);
    }
    if (selected && !view.legalCardIds.includes(selected)) setSelected(null);
    if (pendingCard && (!view.legalCardIds.includes(pendingCard.id) || view.phase !== 'playing')) setPendingCard(null);
  }, [view?.version, view?.you, mode, fly]);
  useEffect(() => { setSelected(null); setPendingCard(null); setCallArmed(false); }, [view?.you, hideHand]);

  const startLocal = (kind: 'solo' | 'local') => {
    audio.unlock(); audio.play('deal'); resetTransient(); sessionRef.current = null; roomRef.current = null; setMode(kind); setSession(null); setRoom(null);
    history.replaceState(null, '', location.pathname);
    const players = kind === 'solo' ? [{ id: 'p0', name: name.trim() || 'You', avatar: 0, bot: false }, ...Array.from({ length: Math.max(1, Math.min(5, botCount)) }, (_, i) => ({ id: `p${i + 1}`, name: BOT_NAMES[i], avatar: i + 1, bot: true, difficulty }))] : localSeats.map((p, i) => ({ id: `p${i}`, name: p.name.trim() || `Player ${i + 1}`, avatar: i, bot: p.bot, difficulty }));
    try { setGame(createGame(players, options)); setLocalViewer(kind === 'solo' ? 'p0' : null); setScreen('game'); setModal(null); } catch (e: any) { say(e.message); }
  };
  const createOrJoin = async () => {
    if (busy || mutating.current) return; setBusy(true); mutating.current = true; audio.unlock();
    try {
      const playerName = name.trim() || 'Guest'; saveStored('cc-name', playerName);
      const code = joinCode.trim().toUpperCase();
      let result: any;
      if (friendTab === 'join') {
        const saved = safeStored(`cc-room-${code}`);
        if (saved?.token && saved.code === code) {
          try { const restored = await api(`/${code}`, undefined, saved); result = { ...saved, room: restored.room }; }
          catch (e: any) { if (![401, 403, 404, 410].includes(e.status)) throw e; removeStored(`cc-room-${code}`); }
        }
      }
      if (!result) result = friendTab === 'create' ? await api('', { name: playerName, avatar: 0, options, difficulty }) : await api(`/${code}/join`, { name: playerName, avatar: Math.floor(Math.random() * 6) });
      const nextSession = { code: result.code, token: result.token, playerId: result.playerId };
      saveStored(`cc-room-${result.code}`, nextSession); resetTransient(); sessionRef.current = nextSession; setSession(nextSession); setMode('online'); setBotCount(0); acceptRoom(result.room); setModal(null);
      history.replaceState(null, '', `${location.pathname}?room=${result.code}`); audio.play('tap');
    } catch (e: any) { say(e.message); } finally { setBusy(false); mutating.current = false; }
  };
  const onlineControl = async (control: 'start' | 'rematch' | 'leave') => {
    if (!session || busy || mutating.current) return false; setBusy(true); mutating.current = true;
    try {
      const availableSeats = Math.max(0, 6 - (roomRef.current?.players.length || 1));
      const data = await api(`/${session.code}/${control}`, control === 'start' ? { botCount: Math.min(botCount, availableSeats), difficulty } : {}, session);
      if (data.room) { resetTransient(); acceptRoom(data.room); audio.play('deal'); }
      return true;
    } catch (e: any) { if (control === 'leave' && [401, 404, 410].includes(e.status)) return true; if (e.room) acceptRoom(e.room); say(e.message); return false; }
    finally { setBusy(false); mutating.current = false; }
  };
  const act = async (action: any) => {
    if (!view || busy || mutating.current || privacy || hideHand || view.phase !== 'playing') return;
    setSelected(null); setPendingCard(null);
    try {
      if (mode === 'online' && session) {
        setBusy(true); mutating.current = true;
        const result = await api(`/${session.code}/action`, { action, expectedVersion: roomRef.current?.version, requestId: Array.from(crypto.getRandomValues(new Uint8Array(16)), n => n.toString(16).padStart(2, '0')).join('') }, session); acceptRoom(result.room);
      } else {
        const actor = view.you; const next = transition(localGameRef.current, actor, action); const nextView = viewFor(next, actor);
        if (mode === 'local' && nextView.currentPlayerId !== actor) setLocalViewer(null);
        setGame(next);
      }
      if (['play', 'draw', 'pass'].includes(action.type)) setCallArmed(false);
    } catch (e: any) { if (e.room) acceptRoom(e.room); say(e.message || 'That move is no longer available.'); }
    finally { setBusy(false); mutating.current = false; }
  };
  const playCard = (card: Card, force = false) => {
    if (!canAct) return;
    if (!view!.legalCardIds.includes(card.id)) { say(myTurn ? (card.value === 'wild4' ? 'Wild +4 needs a hand with no active-color cards.' : `Match ${COLOR_NAMES[view!.activeColor]} or the top card.`) : 'Your turn is coming.'); return; }
    if (coarse && !force && selected !== card.id) { setSelected(card.id); audio.play('tap'); return; }
    if (card.color === 'wild' || (view!.options.sevenZero && card.value === '7')) { setPendingCard(card); return; }
    act({ type: 'play', cardId: card.id, call: callArmed });
  };
  const chooseColor = (color: string) => {
    if (!pendingCard) return;
    act({ type: 'play', cardId: pendingCard.id, color, call: callArmed });
  };
  const callClash = () => { if (!view) return; if (view.hand.length === 1) act({ type: 'call' }); else { setCallArmed(v => !v); audio.play('tap'); } };
  const leave = async () => {
    if (mode === 'online' && session) {
      const left = await onlineControl('leave');
      if (!left) return;
      removeStored(`cc-room-${session.code}`);
    }
    sessionRef.current = null; roomRef.current = null; setSession(null); setRoom(null); setGame(null); setScreen('home'); setModal(null); resetTransient(); history.replaceState(null, '', location.pathname);
  };
  const copyInvite = async () => { if (!room) return; try { await navigator.clipboard.writeText(`${location.origin}/?room=${room.code}`); setCopied(true); setTimeout(() => setCopied(false), 2400); } catch { say(`Room code: ${room.code}`); } };
  const openSetup = (kind: 'solo' | 'local' | 'friends') => { audio.unlock(); audio.play('tap'); if (kind === 'solo' && botCount < 1) setBotCount(3); setModal(kind); setShowHouse(false); setFriendTab('create'); };
  useEffect(() => {
    const dialogs = document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]');
    const dialog = dialogs[dialogs.length - 1]; if (!dialog) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const focusable = () => Array.from(dialog.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), [tabindex="0"]')).filter(el => el.offsetParent !== null);
    const frame = requestAnimationFrame(() => focusable()[0]?.focus({ preventScroll: true }));
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !mutating.current) { if (modal) setModal(null); else if (pendingCard) setPendingCard(null); }
      if (event.key !== 'Tab') return;
      const items = focusable(); const first = items[0]; const last = items[items.length - 1];
      if (!first) { event.preventDefault(); return; }
      if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', key);
    return () => { cancelAnimationFrame(frame); document.removeEventListener('keydown', key); if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true }); };
  }, [modal, !!pendingCard, privacy, view?.phase, showResult]);
  const lastMessage = view?.events.filter(e => e.text).slice(-1)[0]?.text;
  const winner = view?.players.find(p => p.id === view.winnerId);
  const activeRules = Object.entries((view?.options || room?.options || options)).filter(([_, enabled]) => enabled).map(([k]) => ruleInfo.find(x => x.key === k)?.name);
  const houseRules = <div className="house-settings"><button type="button" className="disclosure" onClick={() => setShowHouse(v => !v)}><span><Settings2 size={16}/> House rules {Object.values(options).filter(Boolean).length > 0 && <b>{Object.values(options).filter(Boolean).length}</b>}</span><ChevronDown size={17} className={showHouse ? 'rotate' : ''}/></button>{showHouse && <div className="house-list">{ruleInfo.map(r => <div className="setting-row" key={r.key}><div><strong>{r.name}</strong><p>{r.description}</p></div><Switch checked={options[r.key]} label={r.name} onChange={() => setOptions(o => ({ ...o, [r.key]: !o[r.key] }))}/></div>)}</div>}</div>;
  const difficultyPicker = <div className="field"><label>THE COMPETITION</label><div className="segmented">{['easy', 'medium', 'hard', 'expert'].map(d => <button type="button" key={d} className={difficulty === d ? 'active' : ''} onClick={() => setDifficulty(d)}>{d[0].toUpperCase() + d.slice(1)}</button>)}</div></div>;

  return <main className={`app ${screen} ${privacy ? 'private-turn' : ''}`}>
    <div className="grain" aria-hidden="true"/>
    <header className="topbar"><Brand small={screen !== 'home'} onClick={() => screen !== 'home' ? setModal('leave') : null}/>{screen !== 'home' && mode === 'online' && <span className="header-caption"><span className={`connection-dot ${network}`}/>{room?.code || 'CONNECTING'}</span>}<nav className="header-actions"><button type="button" className="icon-button sound-button" aria-label={sound ? 'Mute sound' : 'Enable sound'} onClick={() => { audio.unlock(); setSound(v => !v); }}>{sound ? <Volume2 size={19}/> : <VolumeX size={19}/>}</button><button type="button" className="icon-button" aria-label="How to play" onClick={() => setModal('rules')}><HelpCircle size={19}/></button><button type="button" className="icon-button" aria-label="Settings" onClick={() => setModal('settings')}><Settings2 size={19}/></button></nav></header>

    {screen === 'home' && <>
      <section className="home-hero">
        <div className="hero-copy"><h1 className="sr-only">Color Clash</h1>
          <div className="mode-menu"><button type="button" className="mode-choice primary-choice" onClick={() => openSetup('solo')}><span className="mode-icon"><Monitor size={22}/></span><span><strong>Play Computer</strong></span><ArrowRight size={22}/></button><button type="button" className="mode-choice" onClick={() => openSetup('friends')}><span className="mode-icon"><Globe2 size={22}/></span><span><strong>Play Friends</strong></span><ArrowRight size={21}/></button><button type="button" className="mode-choice" onClick={() => openSetup('local')}><span className="mode-icon"><Users size={22}/></span><span><strong>Play Locally</strong></span><ArrowRight size={21}/></button></div>
        </div>
        <div className="hero-art" aria-hidden="true"><div className="hero-halo"/><div className="table-orbit orbit-one"/><div className="table-orbit orbit-two"/><div className="hero-center-mark"><span className="brand-mark"><i/><i/><i/><i/></span></div><div className="art-deck"><GameCard back/><GameCard back/><GameCard back/></div>
          <div className="hero-card hc-1"><GameCard card={{ color: 'red', value: '7' }}/></div><div className="hero-card hc-2"><GameCard card={{ color: 'yellow', value: 'reverse' }}/></div><div className="hero-card hc-3"><GameCard card={{ color: 'green', value: '3' }}/></div><div className="hero-card hc-4"><GameCard card={{ color: 'blue', value: 'draw2' }}/></div><div className="hero-card hc-5"><GameCard card={{ color: 'wild', value: 'wild' }}/></div>
          
        </div>
      </section>
      
    </>}

    {screen === 'lobby' && <section className="lobby-screen">
      {room ? <><div className="invite-panel"><div><small>YOUR PRIVATE ROOM</small><strong>{room.code}</strong></div><button type="button" className="cream-button" onClick={copyInvite}>{copied ? <Check size={18}/> : <Link2 size={18}/>} {copied ? 'Copied!' : 'Copy invite'}</button></div><div className="lobby-players">{Array.from({ length: 6 }, (_, i) => { const p = room.players[i]; const isBot = !p && i < room.players.length + botCount; return <div className={`lobby-seat ${p || isBot ? 'occupied' : ''}`} key={i}>{p || isBot ? <><Avatar index={p?.avatar ?? i}/><strong>{p?.name || BOT_NAMES[i - room.players.length]} {p?.id === room.hostId && <Crown size={12}/>}</strong><small>{p?.id === session?.playerId ? 'You' : p?.bot || isBot ? 'Computer' : p?.connected ? 'Ready' : 'Reconnecting'}</small></> : <><div className="empty-avatar"><Plus size={21}/></div><strong>Open seat</strong></>}</div>; })}</div>
      <div className="lobby-bottom">{room.hostId === session?.playerId ? <><div className="bot-add"><div><strong>Add computer players</strong></div><div className="stepper"><button type="button" aria-label="Remove a bot" disabled={botCount === 0} onClick={() => setBotCount(n => Math.max(0, n - 1))}><Minus size={16}/></button><b>{Math.min(botCount, 6 - room.players.length)}</b><button type="button" aria-label="Add a bot" disabled={room.players.length + botCount >= 6} onClick={() => setBotCount(n => Math.min(6 - room.players.length, n + 1))}><Plus size={16}/></button></div></div>{botCount > 0 && difficultyPicker}<button type="button" className="cream-button full lobby-start" disabled={busy || room.players.length + botCount < 2} onClick={() => onlineControl('start')}>{busy ? <LoaderCircle className="spin" size={18}/> : <>Deal us in <ArrowRight size={18}/></>}</button></> : <p className="waiting"><LoaderCircle className="spin" size={16}/> Waiting for the host to deal.</p>}<div className="lobby-rules"><ShieldCheck size={14}/>{activeRules.length ? activeRules.join(' · ') : 'Classic rules'}</div></div></> : <div className="connecting"><LoaderCircle className="spin"/> Bringing your table back…</div>}
    </section>}

    {screen === 'game' && view && <section className="game-screen">
      <div className="table-surface"><div className="table-boundary"/><div className="table-inner-ring"/><span className="table-watermark">COLOR CLASH</span></div>
      <div className={`opponents players-${opponents.length}`}>{opponents.map((p, i) => <div className={`opponent pos-${i} ${view.currentPlayerId === p.id ? 'is-current' : ''} ${p.count === 1 ? 'last-card' : ''}`} key={p.id} data-player={p.id}><div className="opponent-fan" aria-hidden="true">{Array.from({ length: Math.min(p.count || 0, 7) }, (_, n) => <div key={n} style={{ '--n': n, '--total': Math.min(p.count || 0, 7) } as any}><GameCard back/></div>)}</div><div className="avatar-wrap"><Avatar index={p.avatar}/><span className="card-count">{p.count}</span>{view.currentPlayerId === p.id && <span className="turn-ring"/>}</div><strong>{p.name}{p.bot && <Monitor size={11}/>}</strong><span className="player-subtitle">{p.count === 1 ? (p.called ? 'CLASH!' : 'One card!') : mode === 'online' && !p.bot && p.connected === false ? 'Reconnecting' : view.currentPlayerId === p.id ? p.bot ? 'Thinking' : 'Playing' : ''}</span>{view.vulnerablePlayerId === p.id && canAct && <button type="button" className="catch-button" onClick={() => act({ type: 'catch', targetId: p.id })}>Catch +2</button>}</div>)}</div>
      <div className="table-center">{tableEffect && <span key={tableEffect.id} className={`table-flash fx-${tableEffect.kind}`} aria-hidden="true">{tableEffect.text}</span>}<div className={`turn-label ${myTurn ? 'your-turn' : ''}`}><span/>{view.phase === 'finished' ? 'GAME OVER' : myTurn ? 'YOUR TURN' : `${(current?.name || '').toUpperCase()}’S TURN`}</div><div className="center-piles"><button type="button" className={`draw-pile ${myTurn && view.canDraw ? 'draw-ready' : ''}`} ref={drawRef} onClick={() => myTurn && view.canDraw ? act({ type: 'draw' }) : null} disabled={!myTurn || !view.canDraw || busy} aria-label={view.pendingDraw ? `Draw ${view.pendingDraw} penalty cards` : 'Draw one card'}><span className="deck-layer layer-2"/><span className="deck-layer layer-1"/><GameCard back/><span className="deck-hover-label">{view.pendingDraw ? `DRAW ${view.pendingDraw}` : 'DRAW ONE'}</span></button><span className={`direction-indicator ${view.direction < 0 ? 'reverse' : ''}`} title={view.direction > 0 ? 'Clockwise' : 'Counterclockwise'} aria-label={view.direction > 0 ? 'Clockwise play' : 'Counterclockwise play'}><RotateCcw size={27}/></span><div className="discard-pile" ref={discardRef} onDragOver={e => { if (canAct) e.preventDefault(); }} onDrop={e => { e.preventDefault(); const c = view.hand.find(c => c.id === e.dataTransfer.getData('text/plain')); if (c) playCard(c, true); }}><span className="discard-under"/><GameCard key={view.topCard?.id} card={view.topCard}/>{view.pendingDraw > 0 && <span className="draw-penalty">+{view.pendingDraw}</span>}</div></div><div className={`active-color color-${view.activeColor}`}><i/>{COLOR_NAMES[view.activeColor]}<span>is in play</span></div><div className="table-event" aria-live="polite">{lastMessage || ''}</div></div>
      <div className="game-meta"><button type="button" onClick={() => setModal('rules')}><ShieldCheck size={14}/>{activeRules.length ? `${activeRules.length} house rule${activeRules.length > 1 ? 's' : ''}` : 'Classic rules'}</button>{mode === 'online' && <button type="button" onClick={copyInvite}>{copied ? <Check size={14}/> : <Link2 size={14}/>} Invite</button>}</div>
      <div className="hand-area"><div className="hand-toolbar"><div className="you-identity"><div className={`self-avatar ${myTurn ? 'is-current' : ''}`}><Avatar index={me?.avatar || 0}/></div><div><strong>{mode === 'local' ? (hideHand ? 'Your table' : me?.name) : 'You'}<span>{hideHand ? '' : `${view.hand.length} cards`}</span></strong><small>{hideHand || view.phase === 'finished' ? '' : myTurn ? (view.canPass ? 'Play your new card, or keep it.' : view.pendingDraw ? `Draw ${view.pendingDraw}${view.options.stacking ? ', or stack the same symbol.' : ' to continue.'}` : coarse ? 'Choose a card. Tap again to play.' : 'Pick a card.') : view.options.jumpIn ? 'An exact match? Jump in.' : ''}</small></div></div><div className="hand-actions">{view.canPass && canAct && <button type="button" className="keep-button" onClick={() => act({ type: 'pass' })}>Keep & pass <ArrowRight size={15}/></button>}{coarse && selectedCard && canAct && <button type="button" className="mobile-play cream-button" onClick={() => playCard(selectedCard, true)}>Play card <ArrowRight size={15}/></button>}{!hideHand && view.hand.length <= 2 && view.phase === 'playing' && <button type="button" className={`clash-button ${callArmed || me?.called ? 'armed' : ''}`} onClick={callClash} disabled={busy || me?.called}><Zap size={18}/>{me?.called ? 'CALLED!' : callArmed ? 'CLASH READY' : 'CLASH!'}</button>}</div></div>
        <div className={`hand-scroll ${hideHand ? 'hidden-hand' : ''}`} ref={handRef}><div className={`card-fan ${view.hand.length > 12 ? 'big-hand' : ''}`} style={{ '--count': view.hand.length } as any}>{!hideHand ? view.hand.map((card, i) => { const offset = i - (view.hand.length - 1) / 2; const legal = view.legalCardIds.includes(card.id); const angle = Math.max(-13, Math.min(13, offset * (view.hand.length > 12 ? 1.3 : 3))); return <button type="button" key={card.id} className={`hand-card ${legal && canAct ? 'playable' : ''} ${selected === card.id ? 'selected' : ''}`} data-card-id={card.id} style={{ '--rotation': `${angle}deg`, '--arc': `${Math.min(28, Math.abs(offset) * 4)}px`, '--index': i } as any} aria-label={`${describeCard(card)}${legal ? ', playable' : ''}`} aria-disabled={!legal || !canAct} aria-pressed={selected === card.id} onClick={() => playCard(card)} draggable={!coarse && legal && canAct} onDragStart={e => { e.dataTransfer.setData('text/plain', card.id); e.dataTransfer.effectAllowed = 'move'; }}><GameCard card={card}/><span className="playable-dot"/></button>; }) : Array.from({ length: 7 }, (_, i) => <div className="hand-card private-card" key={i} style={{ '--rotation': `${(i - 3) * 3}deg`, '--arc': `${Math.abs(i - 3) * 4}px`, '--index': i } as any}><GameCard back/></div>)}</div></div>
      </div>
      {privacy && <div className="privacy-screen" role="dialog" aria-modal="true" aria-label="Pass the device"><div className="privacy-orbit"/><div className="privacy-card"><ShieldCheck size={25}/><Avatar index={current?.avatar || 0}/><h2>Pass to {current?.name}.</h2><button type="button" className="cream-button" onClick={() => { setLocalViewer(current!.id); audio.play('deal'); }}>I’m ready <ArrowRight size={18}/></button></div></div>}
      {view.phase === 'finished' && showResult && <div className="result-overlay"><div className="confetti" aria-hidden="true">{Array.from({ length: 32 }, (_, i) => <i key={i} style={{ '--i': i, '--x': `${(i * 67) % 100}%`, '--delay': `${(i % 7) * -.45}s`, '--color': ['#e96b5d', '#edba4b', '#51b69a', '#779de9'][i % 4] } as any}/>)}</div><div className="result-panel" role="dialog" aria-modal="true" aria-label="Match results"><div className="victory-avatar"><Avatar index={winner?.avatar || 0}/><Crown size={34}/></div><h2>{winner?.id === view.you && mode !== 'local' ? 'You win.' : `${winner?.name} wins.`}</h2><div className="result-standing">{[...view.players].sort((a, b) => (a.count || 0) - (b.count || 0)).map((p, i) => <div key={p.id}><span>{i + 1}</span><Avatar index={p.avatar}/><strong>{p.name}</strong><span>{p.count === 0 ? <Crown size={15}/> : `${p.count} left`}</span></div>)}</div><button type="button" className="cream-button full" disabled={busy || (mode === 'online' && room?.hostId !== session?.playerId)} onClick={() => mode === 'online' ? onlineControl('rematch') : startLocal(mode)}>{mode === 'online' && room?.hostId !== session?.playerId ? 'Waiting for host’s rematch' : <><RotateCcw size={17}/> Play again</>}</button><button type="button" className="text-button full" onClick={() => setShowResult(false)}>See the table</button><button type="button" className="result-home" onClick={leave}>Back to home</button></div></div>}
      {view.phase === 'finished' && !showResult && <button type="button" className="back-to-results cream-button" onClick={() => setShowResult(true)}>Match results <ArrowRight size={16}/></button>}
    </section>}

    {pendingCard && view && !privacy && <div className="modal-backdrop" onClick={() => setPendingCard(null)}><div className="modal small-modal color-modal" role="dialog" aria-modal="true" aria-labelledby="color-title" onClick={e => e.stopPropagation()}><button type="button" className="modal-close icon-button" aria-label="Cancel card" onClick={() => setPendingCard(null)}><X size={19}/></button><h2 id="color-title">{pendingCard.value === '7' ? 'Pick a hand.' : 'Set the color.'}</h2>{pendingCard.value === '7' ? <div className="swap-choices">{view!.players.filter(p => p.id !== view!.you).map(p => <button type="button" key={p.id} onClick={() => act({ type: 'play', cardId: pendingCard.id, targetId: p.id, call: callArmed })}><Avatar index={p.avatar}/><strong>{p.name}</strong><span>{p.count} cards</span><ArrowRight size={18}/></button>)}</div> : <div className="color-choices">{['red', 'yellow', 'green', 'blue'].map(color => <button type="button" key={color} className={`color-choice color-${color}`} onClick={() => chooseColor(color)}><span className="color-shape"><ColorShape color={color}/></span><strong>{COLOR_NAMES[color]}</strong></button>)}</div>}</div></div>}

    {modal && <div className="modal-backdrop" onClick={() => !busy && setModal(null)}><section className={`modal ${modal === 'rules' ? 'rules-modal' : ''}`} role="dialog" aria-modal="true" aria-labelledby="modal-title" onClick={e => e.stopPropagation()}><button type="button" className="modal-close icon-button" aria-label="Close dialog" onClick={() => setModal(null)}><X size={20}/></button>
      {modal === 'solo' && <><div className="modal-emblem"><Monitor size={24}/></div><h2 id="modal-title">Play Computer</h2><div className="field opponents-field"><label>COMPUTER PLAYERS</label><div className="number-choices">{[1, 2, 3, 4, 5].map(n => <button type="button" className={botCount === n ? 'active' : ''} key={n} onClick={() => setBotCount(n)}>{n}</button>)}</div></div>{difficultyPicker}{houseRules}<button type="button" className="cream-button full start-button" onClick={() => startLocal('solo')}>Deal me in <ArrowRight size={18}/></button></>}
      {modal === 'local' && <><div className="modal-emblem"><Users size={24}/></div><h2 id="modal-title">Play Locally</h2><p className="modal-intro">Hands stay hidden between turns.</p><div className="local-seat-list">{localSeats.map((p, i) => <div className="local-seat" key={i}><Avatar index={i}/><input aria-label={`Player ${i + 1} name`} maxLength={18} value={p.name} onChange={e => setLocalSeats(all => all.map((x, j) => j === i ? { ...x, name: e.target.value } : x))}/><button type="button" className={`seat-type ${p.bot ? 'is-bot' : ''}`} aria-label={`Make player ${i + 1} ${p.bot ? 'human' : 'computer'}`} onClick={() => setLocalSeats(all => all.map((x, j) => j === i ? { ...x, bot: !x.bot } : x))}>{p.bot ? <Monitor size={14}/> : <Users size={14}/>} {p.bot ? 'Bot' : 'Human'}</button>{localSeats.length > 2 && <button type="button" className="icon-button remove-seat" aria-label={`Remove player ${i + 1}`} onClick={() => setLocalSeats(all => all.filter((_, j) => j !== i))}><X size={15}/></button>}</div>)}</div>{localSeats.length < 6 && <button type="button" className="add-seat" onClick={() => setLocalSeats(all => [...all, { name: `Player ${all.length + 1}`, bot: false }])}><Plus size={16}/> Add a player</button>}{localSeats.some(p => p.bot) && difficultyPicker}{houseRules}<button type="button" className="cream-button full start-button" disabled={!localSeats.some(p => !p.bot)} onClick={() => startLocal('local')}>Deal us in <ArrowRight size={18}/></button></>}
      {modal === 'friends' && <><div className="modal-emblem"><Globe2 size={24}/></div><h2 id="modal-title">Play Friends</h2><div className="segmented friend-tabs"><button type="button" className={friendTab === 'create' ? 'active' : ''} onClick={() => setFriendTab('create')}>Create a room</button><button type="button" className={friendTab === 'join' ? 'active' : ''} onClick={() => setFriendTab('join')}>Join a room</button></div><form onSubmit={e => { e.preventDefault(); createOrJoin(); }}><div className="field"><label htmlFor="player-name">YOUR NAME</label><input id="player-name" autoComplete="nickname" maxLength={18} placeholder="What should we call you?" value={name} onChange={e => setName(e.target.value)}/></div>{friendTab === 'join' ? <div className="field"><label htmlFor="room-code">ROOM CODE</label><input id="room-code" className="room-code-input" autoCapitalize="characters" autoComplete="off" maxLength={6} placeholder="ABCDEF" value={joinCode} onChange={e => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}/></div> : houseRules}<button className="cream-button full start-button" type="submit" disabled={busy || (friendTab === 'join' && joinCode.length !== 6)}>{busy ? <LoaderCircle className="spin" size={18}/> : <>{friendTab === 'create' ? 'Create room' : 'Join room'}<ArrowRight size={18}/></>}</button></form></>}
      {modal === 'rules' && <><h2 id="modal-title">How to play</h2><div className="rules-list">{RULES.map(([title, text], i) => <div key={title}><span>{String(i + 1).padStart(2, '0')}</span><div><h3>{title}</h3><p>{text}</p></div></div>)}</div><div className="house-rule-reference"><h3>House rules</h3>{ruleInfo.map(r => <p key={r.key}><strong>{r.name}.</strong> {r.description}</p>)}<p>Jump-ins pause during a draw penalty or a drawn-card decision. Seven–zero checks the winning hand after the swap or rotation. A final draw card still gives its penalty.</p></div><button type="button" className="cream-button full" onClick={() => setModal(null)}>Got it <ArrowRight size={17}/></button></>}
      {modal === 'settings' && <><h2 id="modal-title">Settings</h2><div className="settings-list"><div className="setting-row"><div><strong><Volume2 size={17}/> Table sounds</strong></div><Switch checked={sound} label="Table sounds" onChange={() => { audio.unlock(); setSound(v => !v); }}/></div><div className="setting-row"><div><strong><Music2 size={17}/> Background music</strong></div><Switch checked={music} label="Background music" onChange={() => { audio.unlock(); setMusic(v => !v); }}/></div></div><div className="your-record"><span>Your record on this device</span><div><strong>{stats.played}<small>GAMES</small></strong><strong>{stats.won}<small>WINS</small></strong></div></div><button type="button" className="cream-button full" onClick={() => setModal(null)}>Done <ArrowRight size={17}/></button></>}
      {modal === 'leave' && <><div className="modal-emblem"><LogOut size={24}/></div><h2 id="modal-title">Leaving the table?</h2><p className="modal-intro">{mode === 'online' ? 'A computer will take your seat so the game can go on.' : 'This hand will end.'}</p><button type="button" className="cream-button full" onClick={leave} disabled={busy}>Leave table <ArrowRight size={17}/></button><button type="button" className="text-button full" onClick={() => setModal(null)}>Keep playing</button></>}
    </section></div>}
    {flights.map(f => <div className="card-flight" key={f.key} style={{ left: f.x, top: f.y, width: Math.min(f.width, 112), '--dx': `${f.dx}px`, '--dy': `${f.dy}px` } as any}><GameCard card={f.card} back={f.back}/></div>)}
    {toast && <div className="toast" role="status">{toast}</div>}
    {screen !== 'home' && network === 'reconnecting' && mode === 'online' && <div className="reconnect-banner" role="status"><LoaderCircle className="spin" size={14}/> Reconnecting. Your seat is saved.</div>}
  </main>;
}
