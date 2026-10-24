"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowRight, ArrowUpRight, Box, Check, ChevronDown, Copy, Grid2X2, HelpCircle, History, Lightbulb, Link2, LoaderCircle, Moon, Rotate3D, RotateCcw, Settings2, Sun, Trophy, Undo2, UserX, Users, Volume2, VolumeX, X } from 'lucide-react';
import BoardScene from './BoardScene';
import { createGame, applyMove, getDimensions, getLegalMoves, restoreGame, stackLabel, undoMoves } from '../public/game/engine.js';
import type { GameState, Variant } from '../public/game/engine.js';
import { ArenaAudio } from '../lib/audio';
import { createRoom, joinRoom, getRoom, actRoom, NetworkError } from '../lib/network';
import type { RoomEnvelope, RoomView } from '../lib/network';

type Difficulty = 'beginner' | 'easy' | 'medium' | 'hard' | 'expert';
type Preferences = { theme: 'light' | 'dark'; sound: boolean; reducedMotion: boolean; difficulty: Difficulty; bestOf: 1 | 3 | 5; name: string; };
type Match = { id: string; mode: 'computer' | 'local'; game: GameState; scores: [number, number]; round: number; bestOf: 1 | 3 | 5; difficulty: Difficulty; names: [string, string]; matchWinner: 0 | 1 | 2 | null; };
type Session = { code: string; token: string; seat: 0 | 1 | 2; };
type AIJob = { id: string; matchId: string; game: GameState };
type Stats = { played: number; won: number; draws: number; streak: number; bestStreak: number; recorded: string[]; };
type ModalName = 'settings' | 'friends' | 'history' | 'about' | 'stats' | null;

const DEFAULTS: Preferences = { theme: 'light', sound: true, reducedMotion: false, difficulty: 'medium', bestOf: 3, name: '' };
const EMPTY_STATS: Stats = { played: 0, won: 0, draws: 0, streak: 0, bestStreak: 0, recorded: [] };
const LEVELS: Difficulty[] = ['beginner', 'easy', 'medium', 'hard', 'expert'];
const KEYS = { prefs: 'gravity.preferences.v1', match: 'gravity.saved.v1', session: 'gravity.room.v1', parkedSession: 'gravity.parked-room.v1', stats: 'gravity.stats.v1' };
const read = (key: string) => { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; } };
const write = (key: string, value: unknown) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* A full/private store never stops a match. */ } };
const remove = (key: string) => { try { localStorage.removeItem(key); } catch {} };
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const validSession = (value: unknown): value is Session => {
  if (!value || typeof value !== 'object') return false;
  const saved = value as Session;
  return typeof saved.code === 'string' && /^[A-HJ-NP-Z2-9]{6}$/.test(saved.code) && [0, 1, 2].includes(saved.seat) && typeof saved.token === 'string' && (saved.seat === 0 ? saved.token === '' : /^[A-Za-z0-9_-]{48}$/.test(saved.token));
};

function IconButton({ label, children, onClick, active = false, disabled = false, className = '' }: { label: string; children: React.ReactNode; onClick: () => void; active?: boolean; disabled?: boolean; className?: string; }) {
  return <button type="button" className={`icon-button ${active ? 'active' : ''} ${className}`} title={label} aria-label={label} aria-pressed={active || undefined} disabled={disabled} onClick={onClick}>{children}</button>;
}

function Modal({ title, eyebrow, children, onClose, wide = false }: { title: string; eyebrow?: string; children: React.ReactNode; onClose: () => void; wide?: boolean; }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => { ref.current?.showModal(); return () => ref.current?.close(); }, []);
  return <dialog ref={ref} className={`modal ${wide ? 'modal-wide' : ''}`} aria-labelledby={titleId} onCancel={e => { e.preventDefault(); onClose(); }} onClick={e => { if (e.target === ref.current) { const r = ref.current!.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) onClose(); } }}>
    <div className="modal-head"><div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h2 id={titleId}>{title}</h2></div><IconButton label="Close" onClick={onClose}><X size={20} /></IconButton></div>
    {children}
  </dialog>;
}

function demoGame(variant: Variant) {
  let state = createGame(variant);
  const sequence = variant === '3d' ? [5, 10, 6, 9, 10, 5, 6, 9, 0, 15, 3, 12, 0, 15, 10, 6, 5] : [3, 2, 4, 3, 2, 4, 3, 5, 1, 2, 5, 1, 4, 3];
  for (const stack of sequence) { if (state.winner !== null) break; state = applyMove(state, stack); }
  return state;
}

export default function GravityArena() {
  const [prefs, setPrefs] = useState<Preferences>(DEFAULTS);
  const [hydrated, setHydrated] = useState(false);
  const [variant, setVariant] = useState<Variant>('3d');
  const [screen, setScreen] = useState<'home' | 'game'>('home');
  const [match, setMatch] = useState<Match | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [parkedSession, setParkedSession] = useState<Session | null>(null);
  const [room, setRoom] = useState<RoomView | null>(null);
  const [stats, setStats] = useState<Stats>(EMPTY_STATS);
  const [modal, setModal] = useState<ModalName>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [thinking, setThinking] = useState(false);
  const [hintBusy, setHintBusy] = useState(false);
  const [hintStack, setHintStack] = useState<number | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [rotateKey, setRotateKey] = useState(0);
  const [view, setView] = useState<'perspective' | 'top'>('perspective');
  const [showMap, setShowMap] = useState(false);
  const [sceneReady, setSceneReady] = useState(false);
  const [sceneError, setSceneError] = useState('');
  const [busy, setBusy] = useState(false);
  const [networkState, setNetworkState] = useState<'online' | 'reconnecting'>('online');
  const [toast, setToast] = useState('');
  const [friendTab, setFriendTab] = useState<'create' | 'join'>('create');
  const [roomCode, setRoomCode] = useState('');
  const [friendName, setFriendName] = useState('');
  const [friendError, setFriendError] = useState('');
  const [spectate, setSpectate] = useState(false);
  const [copied, setCopied] = useState(false);
  const [animating, setAnimating] = useState(false);
  const [opponentLeft, setOpponentLeft] = useState(false);
  const sound = useRef<ArenaAudio | null>(null);
  const worker = useRef<Worker | null>(null);
  const matchRef = useRef<Match | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const roomRef = useRef<RoomView | null>(null);
  const screenRef = useRef(screen);
  const botJob = useRef<AIJob | null>(null);
  const hintJob = useRef<AIJob | null>(null);
  const inputLocked = useRef(false);
  const busyRef = useRef(false);
  const onlineJob = useRef(0);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const animationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastOnlineMove = useRef(0);
  matchRef.current = match; sessionRef.current = session; roomRef.current = room; screenRef.current = screen;

  const notify = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 3500);
  }, []);

  const changePrefs = (changes: Partial<Preferences>) => setPrefs(p => ({ ...p, ...changes }));
  const ping = (kind: Parameters<ArenaAudio['play']>[0] = 'ui') => { sound.current?.unlock(); sound.current?.play(kind); };

  useEffect(() => {
    const stored = read(KEYS.prefs);
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (stored) setPrefs({ ...DEFAULTS, theme: stored.theme === 'dark' ? 'dark' : 'light', sound: typeof stored.sound === 'boolean' ? stored.sound : true, reducedMotion: typeof stored.reducedMotion === 'boolean' ? stored.reducedMotion : motion, name: typeof stored.name === 'string' ? stored.name.slice(0,24) : '', difficulty: LEVELS.includes(stored.difficulty) ? stored.difficulty : 'medium', bestOf: [1,3,5].includes(stored.bestOf) ? stored.bestOf : 3 });
    else setPrefs(p => ({ ...p, reducedMotion: motion }));
    const saved = read(KEYS.match);
    if (saved) {
      try {
        const game = restoreGame(saved.game);
        if (!['computer','local'].includes(saved.mode) || ![1,3,5].includes(saved.bestOf) || !Array.isArray(saved.scores) || saved.scores.length !== 2 || !saved.scores.every((score: unknown) => Number.isInteger(score) && Number(score) >= 0) || !Number.isInteger(saved.round) || saved.round < 1 || typeof saved.id !== 'string' || !Array.isArray(saved.names) || saved.names.length !== 2 || !saved.names.every((name: unknown) => typeof name === 'string') || ![null,0,1,2].includes(saved.matchWinner)) throw new Error('Invalid saved match.');
        setMatch({ ...saved, game, difficulty: LEVELS.includes(saved.difficulty) ? saved.difficulty : 'medium' });
      } catch { remove(KEYS.match); }
    }
    const savedStats = read(KEYS.stats);
    if (savedStats && Array.isArray(savedStats.recorded) && ['played','won','draws','streak','bestStreak'].every(key => Number.isInteger(savedStats[key]) && savedStats[key] >= 0) && savedStats.recorded.every((key: unknown) => typeof key === 'string')) setStats({ ...EMPTY_STATS, ...savedStats });
    const params = new URLSearchParams(window.location.search);
    const invite = params.get('room')?.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0,6);
    const savedSession = read(KEYS.session);
    const savedParked = read(KEYS.parkedSession);
    if (validSession(savedParked)) setParkedSession(savedParked);
    if (validSession(savedSession) && (!invite || invite === savedSession.code) && (params.get('watch') !== '1' || savedSession.seat === 0)) {
      setSession(savedSession); setScreen('game');
    } else if (invite && validSession(savedParked) && invite === savedParked.code && params.get('watch') !== '1') {
      setSession(savedParked); setParkedSession(null); remove(KEYS.parkedSession); setScreen('game');
    } else if (invite) {
      if (validSession(savedSession)) { setParkedSession(savedSession); write(KEYS.parkedSession, savedSession); remove(KEYS.session); }
      setRoomCode(invite); setFriendTab('join'); setSpectate(params.get('watch') === '1'); setModal('friends');
    }
    setFriendName(typeof stored?.name === 'string' ? stored.name.slice(0,24) : '');
    setHydrated(true);
    const audio = new ArenaAudio(); sound.current = audio;
    const unlock = () => audio.unlock();
    document.addEventListener('pointerdown', unlock, { once: true });
    document.addEventListener('keydown', unlock, { once: true });
    return () => { audio.dispose(); document.removeEventListener('pointerdown', unlock); document.removeEventListener('keydown', unlock); if (toastTimer.current) clearTimeout(toastTimer.current); if (animationTimer.current) clearTimeout(animationTimer.current); };
  }, []);

  useEffect(() => { if (hydrated) { write(KEYS.prefs, prefs); sound.current?.setEnabled(prefs.sound); document.documentElement.dataset.theme = prefs.theme; } }, [prefs, hydrated]);
  useEffect(() => { if (hydrated && match) write(KEYS.match, match); }, [match, hydrated]);
  useEffect(() => { if (session) write(KEYS.session, session); }, [session]);

  const markAnimation = useCallback(() => {
    inputLocked.current = true;
    setAnimating(true);
    if (animationTimer.current) clearTimeout(animationTimer.current);
    animationTimer.current = setTimeout(() => { inputLocked.current = false; setAnimating(false); }, 800);
  }, []);

  const commitLocal = useCallback((stack: number) => {
    const current = matchRef.current;
    if (!current || current.game.winner !== null) return;
    try {
      const game = applyMove(current.game, stack);
      const scores: [number,number] = [...current.scores];
      if (game.winner) scores[game.winner - 1]++;
      const target = Math.floor(current.bestOf / 2) + 1;
      const matchWinner = scores[0] >= target ? 1 : scores[1] >= target ? 2 : game.winner === 0 && current.bestOf === 1 ? 0 : null;
      const next: Match = { ...current, game, scores, matchWinner };
      matchRef.current = next;
      setMatch(next);
      setSelected(null); setHintStack(null); setHintBusy(false); hintJob.current = null;
      sound.current?.play('drop'); markAnimation();
    } catch (e) { notify(e instanceof Error ? e.message : 'That stack is full.'); }
  }, [notify, markAnimation]);

  useEffect(() => {
    let ai: Worker;
    try {
      ai = new Worker('/game/ai.worker.js', { type: 'module', name: 'gravity-computer' });
      worker.current = ai;
      ai.onmessage = (event: MessageEvent) => {
        const data = event.data;
        const pendingBot = botJob.current;
        const pendingHint = hintJob.current;
        if (pendingBot && data.id === pendingBot.id) {
          const job = pendingBot;
          botJob.current = null; setThinking(false);
          if (data.error) { notify('The computer needs a retry. Return home and resume.'); return; }
          const current = matchRef.current;
          if (screenRef.current === 'game' && !sessionRef.current && current?.id === job.matchId && current.game === job.game && current.mode === 'computer' && current.game.turn === 2 && current.game.winner === null) commitLocal(data.stack);
        } else if (pendingHint && data.id === pendingHint.id) {
          const job = pendingHint;
          hintJob.current = null; setHintBusy(false);
          const current = matchRef.current;
          if (!data.error && screenRef.current === 'game' && !sessionRef.current && current?.id === job.matchId && current.game === job.game && current.mode === 'computer' && current.game.turn === 1 && getLegalMoves(current.game).includes(data.stack)) {
            setSelected(data.stack); setHintStack(data.stack); sound.current?.play('pick');
          }
        }
      };
      ai.onerror = () => { botJob.current = null; hintJob.current = null; setThinking(false); setHintBusy(false); notify('Computer connection interrupted. Reload to restore your saved game.'); };
    } catch { notify('Your browser could not start the computer player. Local play is available.'); }
    return () => { ai?.terminate(); worker.current = null; };
  }, [commitLocal, notify]);

  useEffect(() => {
    if (screen !== 'game' || session || !match || match.mode !== 'computer' || match.game.turn !== 2 || match.game.winner !== null) {
      botJob.current = null; setThinking(false); return;
    }
    setThinking(true);
    const id = `bot-${crypto.randomUUID()}`; botJob.current = { id, matchId: match.id, game: match.game };
    const timer = setTimeout(() => {
      if (worker.current) worker.current.postMessage({ id, state: match.game, difficulty: match.difficulty });
      else { botJob.current = null; setThinking(false); notify('The computer is unavailable. Reload to restore this saved game.'); }
    }, prefs.reducedMotion ? 60 : 600);
    return () => { clearTimeout(timer); botJob.current = null; };
  }, [match?.game, match?.difficulty, match?.mode, screen, session?.code, prefs.reducedMotion, notify]);

  useEffect(() => {
    if (!match || match.mode !== 'computer' || match.game.winner === null) return;
    const key = `${match.id}:${match.round}`;
    setStats(previous => {
      if (previous.recorded.includes(key)) return previous;
      const win = match.game.winner === 1;
      const streak = win ? previous.streak + 1 : 0;
      const next = { played: previous.played + 1, won: previous.won + Number(win), draws: previous.draws + Number(match.game.winner === 0), streak, bestStreak: Math.max(previous.bestStreak, streak), recorded: [...previous.recorded.slice(-199), key] };
      write(KEYS.stats, next); return next;
    });
  }, [match]);

  const ingestRoom = useCallback((envelope: RoomEnvelope) => {
    if (sessionRef.current?.code !== envelope.code) return;
    const incoming = envelope.room;
    const previous = roomRef.current;
    if (previous && previous.code === incoming.code && previous.version > incoming.version) return;
    const sameRevision = previous?.code === incoming.code && previous.version === incoming.version;
    const next = sameRevision ? { ...incoming, game: previous.game } : incoming;
    if (incoming.game.moves.length > lastOnlineMove.current && screenRef.current === 'game') { sound.current?.play('drop'); markAnimation(); }
    lastOnlineMove.current = incoming.game.moves.length;
    roomRef.current = next;
    setRoom(next);
    setSession(previous => previous?.code === envelope.code && (previous.seat !== envelope.seat || (envelope.token && previous.token !== envelope.token)) ? { ...previous, seat: envelope.seat, token: envelope.token || previous.token } : previous);
    setNetworkState('online');
  }, [markAnimation]);

  useEffect(() => {
    // Free-plan budget: poll only while the room is on screen and the tab is visible, at most every 1.5 s.
    if (!session || screen !== 'game') return;
    let stopped = false;
    let inFlight = false;
    let timer: ReturnType<typeof setTimeout>;
    let failures = 0;
    const poll = async () => {
      if (inFlight) return; inFlight = true;
      try {
        const state = await getRoom(session.code, session.token);
        if (stopped) return;
        ingestRoom(state); failures = 0;
      } catch (e) {
        if (stopped) return;
        failures++;
        if (e instanceof NetworkError && (e.status === 404 || e.status === 410 || e.status === 401 || e.status === 403)) {
          sessionRef.current = null; roomRef.current = null;
          setSession(null); setRoom(null); remove(KEYS.session); setScreen('home'); notify('This room has closed or your seat is unavailable. Start a fresh one.'); return;
        }
        setNetworkState('reconnecting');
      } finally { inFlight = false; }
      if (!stopped && !document.hidden) timer = setTimeout(poll, failures ? Math.min(1500 * 2 ** failures, 10_000) : roomRef.current?.status === 'finished' ? 4000 : 1500);
    };
    const resume = () => { clearTimeout(timer); if (!stopped && !document.hidden) void poll(); };
    document.addEventListener('visibilitychange', resume); window.addEventListener('online', resume);
    void poll();
    return () => { stopped = true; clearTimeout(timer); document.removeEventListener('visibilitychange', resume); window.removeEventListener('online', resume); };
  }, [session?.code, session?.token, screen, ingestRoom, notify]);

  const displayGame = useMemo(() => screen === 'home' ? demoGame(variant) : session ? room?.game || createGame(variant) : match?.game || createGame(variant), [screen, variant, session?.code, room?.game, match?.game]);
  const online = screen === 'game' && !!session;
  const game = displayGame;
  const currentMode = online ? 'online' : match?.mode;
  const waiting = online && (!room || room.status === 'waiting');
  const myTurn = screen === 'game' && game.winner === null && !waiting && !busy && !animating && (online ? room?.game.turn === session?.seat && networkState === 'online' : match?.mode === 'local' || game.turn === 1);
  const names: [string,string] = online ? [room?.players[0]?.name || 'Coral', room?.players[1]?.name || 'Waiting for a friend'] : match?.names || ['You', 'Computer'];
  const scores = online ? room?.scores || [0,0] : match?.scores || [0,0];
  const round = online ? room?.round || 1 : match?.round || 1;
  const bestOf = online ? room?.bestOf || 3 : match?.bestOf || 3;
  const matchWinner = online ? room?.matchWinner : match?.matchWinner;
  const matchComplete = matchWinner !== null && matchWinner !== undefined;
  const finished = screen === 'game' && game.winner !== null;
  const dimensions = getDimensions(game.variant);
  const mySeat = online ? session?.seat || 0 : 0;
  const opponentAway = !!mySeat && !!room && room.status !== 'waiting' && room.players[mySeat === 1 ? 1 : 0]?.connected === false;

  useEffect(() => {
    // Give an opponent who dropped out 15 s to come back before offering a way out of the room.
    setOpponentLeft(false);
    if (!opponentAway) return;
    const timer = setTimeout(() => setOpponentLeft(true), 15_000);
    return () => clearTimeout(timer);
  }, [opponentAway, session?.code]);

  useEffect(() => {
    if (!finished) return;
    const timer = setTimeout(() => sound.current?.play(game.winner === 0 ? 'draw' : 'win'), prefs.reducedMotion ? 0 : 650);
    return () => clearTimeout(timer);
  }, [finished, game.winner, prefs.reducedMotion]);

  const onlineAction = useCallback(async (action: 'move' | 'ready' | 'leave' | 'reconnect', payload: Record<string,unknown> = {}) => {
    const active = sessionRef.current;
    if (!active || busyRef.current) return;
    const job = ++onlineJob.current;
    busyRef.current = true;
    setBusy(true);
    try { ingestRoom(await actRoom(active.code, active.token, action, { version: roomRef.current?.version, ...payload })); }
    catch (e) {
      if (onlineJob.current !== job || sessionRef.current?.code !== active.code) return;
      if (e instanceof NetworkError && e.room && (!roomRef.current || e.room.version >= roomRef.current.version)) { roomRef.current = e.room; setRoom(e.room); }
      notify(e instanceof Error ? e.message : 'Connection interrupted. Try again.');
    } finally { if (onlineJob.current === job) { busyRef.current = false; setBusy(false); } }
  }, [ingestRoom, notify]);

  const drop = (stack: number) => {
    if (!myTurn || inputLocked.current || busyRef.current || !getLegalMoves(game).includes(stack)) return;
    if (!online && matchRef.current?.mode === 'computer' && matchRef.current.game.turn !== 1) return;
    sound.current?.unlock();
    setSelected(null); setHintStack(null);
    if (online) void onlineAction('move', { stack });
    else commitLocal(stack);
  };

  const select = (stack: number | null) => {
    setSelected(stack);
    if (stack !== null && stack !== selected && myTurn) sound.current?.play('pick');
  };

  const parkRoom = () => {
    const active = sessionRef.current;
    if (active) {
      const retained = !active.seat && parkedSession?.seat && parkedSession.code === active.code ? parkedSession : active;
      setParkedSession(retained); write(KEYS.parkedSession, retained);
      if (active.seat) void actRoom(active.code, active.token, 'leave').catch(() => {});
    }
    sessionRef.current = null; roomRef.current = null;
    setSession(null); setRoom(null); remove(KEYS.session);
    onlineJob.current++; busyRef.current = false; setBusy(false);
  };

  const returnToRoom = () => {
    if (!parkedSession) return;
    ping(); botJob.current = null; hintJob.current = null;
    setThinking(false); setHintBusy(false); setHintStack(null); setSelected(null);
    sessionRef.current = parkedSession; roomRef.current = null;
    setSession(parkedSession); setRoom(null); setParkedSession(null); remove(KEYS.parkedSession);
    setNetworkState('reconnecting'); setScreen('game'); screenRef.current = 'game';
    inputLocked.current = false; setAnimating(false); setResetKey(k => k + 1); setView('perspective');
    const url = new URL(window.location.href); url.search = ''; url.searchParams.set('room', parkedSession.code);
    if (parkedSession.seat === 0) url.searchParams.set('watch', '1');
    window.history.replaceState(null, '', url);
  };

  const leaveRoom = (next: 'home' | 'computer') => {
    const active = sessionRef.current;
    if (active?.seat) void actRoom(active.code, active.token, 'leave').catch(() => {});
    sessionRef.current = null; roomRef.current = null;
    setSession(null); setRoom(null); remove(KEYS.session); setOpponentLeft(false);
    if (parkedSession?.code === active?.code) { setParkedSession(null); remove(KEYS.parkedSession); }
    onlineJob.current++; busyRef.current = false; setBusy(false);
    window.history.replaceState(null, '', window.location.pathname);
    if (next === 'computer') start('computer'); else home();
  };

  const start = (mode: 'computer' | 'local') => {
    ping();
    botJob.current = null; hintJob.current = null;
    setThinking(false); setHintBusy(false);
    const next: Match = { id: crypto.randomUUID(), mode, game: createGame(variant), scores: [0,0], round: 1, bestOf: prefs.bestOf, difficulty: prefs.difficulty, names: mode === 'computer' ? ['You', 'Computer'] : ['Coral', 'Blue'], matchWinner: null };
    parkRoom(); matchRef.current = next; setMatch(next);
    window.history.replaceState(null, '', window.location.pathname);
    screenRef.current = 'game'; inputLocked.current = false;
    setScreen('game'); setSelected(null); setHintStack(null); setAnimating(false); setResetKey(k => k + 1); setView('perspective');
  };

  const resume = () => {
    if (!match) return;
    ping(); parkRoom(); botJob.current = null; hintJob.current = null; setHintBusy(false); setHintStack(null); inputLocked.current = false; setAnimating(false); setVariant(match.game.variant); setScreen('game'); screenRef.current = 'game'; setResetKey(k => k + 1); setSelected(null);
  };

  const home = () => { ping(); screenRef.current = 'home'; botJob.current = null; setThinking(false); setScreen('home'); setModal(null); setSelected(null); setHintStack(null); hintJob.current = null; setHintBusy(false); inputLocked.current = false; setAnimating(false); setView('perspective'); };

  const undo = () => {
    const current = matchRef.current;
    if (!current || current.mode !== 'computer' || !current.game.moves.length || current.game.winner !== null || online) return;
    botJob.current = null; hintJob.current = null; setThinking(false); setHintBusy(false);
    const count = current.game.turn === 1 ? 2 : 1;
    const next = { ...current, game: undoMoves(current.game, Math.min(count, current.game.moves.length)) };
    matchRef.current = next; setMatch(next); inputLocked.current = false;
    setSelected(null); setHintStack(null); setAnimating(false); ping('undo');
  };

  const hint = () => {
    const current = matchRef.current;
    if (!myTurn || online || currentMode !== 'computer' || !worker.current || hintJob.current || !current || current.game.turn !== 1 || current.game.winner !== null) return;
    ping(); setHintBusy(true);
    const id = `hint-${crypto.randomUUID()}`; hintJob.current = { id, matchId: current.id, game: current.game };
    worker.current.postMessage({ id, state: current.game, difficulty: 'expert', hint: true });
  };

  const nextRound = () => {
    ping();
    if (online) { void onlineAction('ready'); return; }
    const current = matchRef.current;
    if (!current || current.game.winner === null) return;
    const newMatch = current.matchWinner !== null;
    const starter = current.game.startingPlayer === 1 ? 2 : 1;
    const next: Match = { ...current, id: newMatch ? crypto.randomUUID() : current.id, game: createGame(current.game.variant, starter), round: newMatch ? 1 : current.round + 1, scores: newMatch ? [0,0] : current.scores, matchWinner: null };
    botJob.current = null; hintJob.current = null; setHintBusy(false); inputLocked.current = false;
    matchRef.current = next; setMatch(next);
    setSelected(null); setHintStack(null); setAnimating(false); setResetKey(k => k + 1);
  };

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || screen !== 'game' || modal || event.ctrlKey || event.metaKey || event.altKey || (event.target as HTMLElement)?.isContentEditable || ['INPUT','SELECT','TEXTAREA','BUTTON'].includes((event.target as HTMLElement)?.tagName)) return;
      const legal = getLegalMoves(game);
      if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)) {
        event.preventDefault(); if (!myTurn) return;
        const step = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : event.key === 'ArrowUp' ? -dimensions.width : dimensions.width;
        let n = selected ?? legal[0] ?? 0;
        for (let i = 0; i < dimensions.stacks; i++) { n = (n + step + dimensions.stacks) % dimensions.stacks; if (legal.includes(n)) break; }
        if (legal.includes(n)) select(n);
      } else if ((event.key === 'Enter' || event.key === ' ') && selected !== null) { event.preventDefault(); drop(selected); }
      else if (event.key.toLowerCase() === 'u') undo();
      else if (event.key.toLowerCase() === 'h') hint();
      else if (event.key.toLowerCase() === 'r') { setResetKey(k => k+1); setView('perspective'); }
      else if (/^[1-7]$/.test(event.key) && game.variant === 'classic') drop(Number(event.key)-1);
      else if (event.key === 'Escape') { setSelected(null); setShowMap(false); }
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  });

  const openFriends = () => { ping(); setFriendName(prefs.name); setFriendError(''); setModal('friends'); };

  const connect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busyRef.current) return;
    const job = ++onlineJob.current;
    busyRef.current = true; setBusy(true); setFriendError('');
    try {
      const name = friendName.trim() || 'Player';
      const targetCode = roomCode.trim().toUpperCase();
      const remembered = friendTab === 'join' ? [sessionRef.current, parkedSession].find(saved => saved?.code === targetCode && (spectate ? saved.seat === 0 : saved.seat !== 0)) : null;
      const result = friendTab === 'create' ? await createRoom({ name, variant, bestOf: prefs.bestOf }) : remembered ? await getRoom(targetCode, remembered.token) : await joinRoom(targetCode, name, spectate);
      const nextSession: Session = { code: result.code, token: result.token || remembered?.token || '', seat: result.seat };
      const previousSession = sessionRef.current;
      const leavingPrevious = previousSession && (previousSession.code !== result.code || previousSession.seat !== result.seat);
      const parked = leavingPrevious ? previousSession : parkedSession?.code === result.code ? null : parkedSession;
      if (previousSession?.seat && leavingPrevious) void actRoom(previousSession.code, previousSession.token, 'leave').catch(() => {});
      setParkedSession(parked); if (parked) write(KEYS.parkedSession, parked); else remove(KEYS.parkedSession);
      botJob.current = null; hintJob.current = null; setThinking(false); setHintBusy(false); inputLocked.current = false;
      sessionRef.current = nextSession; roomRef.current = result.room; screenRef.current = 'game';
      setSession(nextSession); write(KEYS.session, nextSession); setRoom(result.room); lastOnlineMove.current = result.room.game.moves.length;
      changePrefs({ name }); setScreen('game'); setModal(null); setVariant(result.room.variant); setSelected(null); setHintStack(null); setAnimating(false); setNetworkState('online'); setResetKey(k => k+1); setView('perspective');
      const url = new URL(window.location.href); url.search = ''; url.searchParams.set('room', result.code); if (result.seat === 0) url.searchParams.set('watch', '1'); window.history.replaceState(null, '', url);
      ping();
    } catch (error) { setFriendError(error instanceof Error ? error.message : 'Could not connect. Try again.'); }
    finally { if (onlineJob.current === job) { busyRef.current = false; setBusy(false); } }
  };

  const copyInvite = async (watch = false) => {
    if (!session) return;
    const url = new URL(window.location.href); url.search = ''; url.searchParams.set('room', session.code); if (watch) url.searchParams.set('watch', '1');
    try { await navigator.clipboard.writeText(url.toString()); setCopied(true); ping(); setTimeout(() => setCopied(false), 2200); }
    catch { notify(`Room code: ${session.code}`); }
  };

  const winnerName = game.winner === 1 || game.winner === 2 ? names[game.winner - 1] : '';
  const title = waiting ? '' : opponentLeft ? `${names[mySeat === 1 ? 1 : 0]} left.` : finished ? game.winner === 0 ? 'Draw.' : matchComplete ? `${winnerName} ${game.winner === 1 && currentMode === 'computer' ? 'win' : 'wins'} the match.` : `${winnerName} ${game.winner === 1 && currentMode === 'computer' ? 'win' : 'wins'} the round.` : thinking ? 'Thinking…' : online && session?.seat === 0 ? `${names[game.turn-1]}’s move.` : myTurn || animating && (!online && currentMode === 'computer' && game.turn === 1) ? currentMode === 'local' ? `${names[game.turn-1]}’s move.` : 'Your move.' : `${names[game.turn-1]}’s move.`;
  const isReady = online && session?.seat ? room?.ready[session.seat - 1] : false;

  return <main className={`arena theme-${prefs.theme} ${screen === 'home' ? 'is-home' : 'is-playing'} ${prefs.reducedMotion ? 'reduced-motion' : ''}`}>
    <header className="site-header">
      <button className="brand" onClick={home} aria-label="Gravity Arena home"><span className="brand-symbol" aria-hidden="true"><i/><i/><i/><i/></span><span>Gravity<span className="brand-sub">Arena</span></span></button>
      {screen === 'home' ? <div className="variant-switch" role="group" aria-label="Board variant"><button className={variant === '3d' ? 'selected' : ''} aria-pressed={variant === '3d'} onClick={() => { setVariant('3d'); setResetKey(k=>k+1); ping(); }}><Box size={15}/> 3D</button><button className={variant === 'classic' ? 'selected' : ''} aria-pressed={variant === 'classic'} onClick={() => { setVariant('classic'); setResetKey(k=>k+1); ping(); }}><Grid2X2 size={15}/> Classic</button></div> : <span/>}
      <div className="header-actions"><IconButton label={prefs.sound ? 'Mute sound' : 'Enable sound'} onClick={() => { sound.current?.unlock(); changePrefs({ sound: !prefs.sound }); }}>{prefs.sound ? <Volume2 size={18}/> : <VolumeX size={18}/>}</IconButton><IconButton className="theme-toggle" label={`Use ${prefs.theme === 'light' ? 'dark' : 'light'} theme`} onClick={() => { changePrefs({ theme: prefs.theme === 'light' ? 'dark' : 'light' }); ping(); }}>{prefs.theme === 'light' ? <Moon size={18}/> : <Sun size={18}/>}</IconButton>{screen === 'home' && <IconButton label="Your stats" onClick={() => { setModal('stats'); ping(); }}><Trophy size={18}/></IconButton>}<IconButton label="How to play" onClick={() => { setModal('about'); ping(); }}><HelpCircle size={18}/></IconButton><IconButton label="Settings" onClick={() => { setModal('settings'); ping(); }}><Settings2 size={18}/></IconButton></div>
    </header>

    <section className="scene-stage" aria-label={`${game.variant === '3d' ? 'Three dimensional 4 by 4 by 4' : 'Classic 7 by 6'} game board`}>
      <BoardScene game={displayGame} theme={prefs.theme} reducedMotion={prefs.reducedMotion} interactive={myTurn && !modal} demo={screen === 'home'} selectedStack={selected} onSelect={select} onDrop={drop} onLand={() => { sound.current?.play('land'); inputLocked.current = false; if (animationTimer.current) clearTimeout(animationTimer.current); animationTimer.current = null; setAnimating(false); }} onReady={() => { setSceneReady(true); setSceneError(''); }} onError={setSceneError} resetKey={resetKey} rotateKey={rotateKey} view={view}/>
      {!sceneReady && !sceneError && <div className="scene-loading"><span className="loading-orb"/><span>Loading</span></div>}
      {sceneError && <div className="scene-fallback"><Box size={32}/><h3>Let’s play on the board below.</h3><p>3D graphics are unavailable in this browser.</p><div className={`fallback-grid ${game.variant}`} style={{gridTemplateColumns:`repeat(${dimensions.width}, 1fr)`}}>{Array.from({length: dimensions.cells},(_,n) => { const index = dimensions.cells - dimensions.stacks - Math.floor(n / dimensions.stacks)*dimensions.stacks + n % dimensions.stacks; return <span key={n} className={`fallback-piece p${game.board[index] || 0}`}/>; })}</div><button className="text-button" onClick={() => setShowMap(true)}>Choose a stack <ArrowDown size={15}/></button></div>}
    </section>

    {screen === 'home' ? <>
      <section className="home-content">
        <h1 className="sr-only">Gravity Arena</h1>
        <div className="home-buttons">
          <button className="primary-button play-computer" onClick={() => start('computer')} disabled={!hydrated}><span>Play computer</span><span className="button-arrow"><ArrowUpRight size={21}/></span></button>
          <div className="secondary-actions"><button onClick={openFriends}><Link2 size={16}/> Play a friend <ArrowUpRight size={14}/></button><button onClick={() => start('local')}><Users size={17}/> Play locally <ArrowUpRight size={14}/></button></div>
        </div>
        <div className="quick-options"><label><span className="sr-only">Computer difficulty</span><select aria-label="Computer difficulty" value={prefs.difficulty} onChange={e => changePrefs({difficulty:e.target.value as Difficulty})}>{LEVELS.map(level=><option key={level} value={level}>{capitalize(level)}</option>)}</select><ChevronDown size={13}/></label><span className="option-dot"/><label><span className="sr-only">Match length</span><select aria-label="Match length" value={prefs.bestOf} onChange={e => changePrefs({bestOf:Number(e.target.value) as 1|3|5})}><option value={1}>Single round</option><option value={3}>Best of 3</option><option value={5}>Best of 5</option></select><ChevronDown size={13}/></label></div>
        {(match || session) && <button className="resume-button" onClick={session ? () => { setScreen('game'); setResetKey(k=>k+1); } : resume}><span className="status-light"/> {session ? 'Return to your room' : 'Continue saved game'} <ArrowRight size={14}/></button>}
        {!session && parkedSession && <button className="resume-button" onClick={returnToRoom}><span className="status-light"/> Return to your room <ArrowRight size={14}/></button>}
      </section>
    </> : <>
      <section className="game-heading" aria-live="polite" aria-atomic="true">
        <div className="game-meta">{online && <span className={`connection-dot ${networkState}`} title={networkState === 'online' ? 'Connected' : 'Reconnecting'}/>}</div>
        <div className="scoreboard"><div className={`player player-one ${game.turn === 1 && !finished ? 'current' : ''}`}><span className="player-orb coral"/><span>{names[0]}{online && session?.seat === 1 && <small>YOU</small>}</span></div><div className="score"><b>{scores[0]}</b><span>:</span><b>{scores[1]}</b></div><div className={`player player-two ${game.turn === 2 && !finished ? 'current' : ''}`}><span>{names[1]}{online && session?.seat === 2 && <small>YOU</small>}</span><span className="player-orb blue"/></div></div>
        <div className="turn-line">{thinking && <span className="thinking-dots"><i/><i/><i/></span>}<h2>{networkState === 'reconnecting' && online ? 'Reconnecting…' : title}</h2></div>
        <p className="round-label">{!online && currentMode === 'computer' ? `${capitalize(match?.difficulty || 'medium')} · ` : ''}{bestOf === 1 ? 'Single round' : `Round ${round} · First to ${Math.floor(bestOf/2)+1}`}{online && !opponentLeft && room?.players.some((p)=>p && !p.connected) && ' · A player is reconnecting'}</p>
      </section>

      {online && session && <div className="room-badge"><span className="status-light"/><button onClick={() => void copyInvite()} title="Copy room invite">{session.code} {copied ? <Check size={13}/> : <Copy size={13}/>}</button>{session.seat === 0 && <span>Watching</span>}</div>}

      {waiting && session && <div className="invite-panel"><div className="room-code">{session.code}</div><button className="primary-button" onClick={() => void copyInvite()}>{copied ? <><Check size={17}/> Link copied</> : <><Link2 size={17}/> Copy invite link</>}<ArrowUpRight size={18}/></button></div>}

      {!waiting && !finished && !opponentLeft && <div className="placement-status">{selected !== null && myTurn ? <button className={`drop-button ${game.turn === 2 ? 'blue-turn' : ''}`} onClick={() => drop(selected)}><span className="small-orb"/>{hintStack === selected ? 'Suggested: ' : 'Drop in '}{stackLabel(selected,game.variant)}<ArrowDown size={16}/></button> : <span>{session?.seat === 0 && online ? '' : thinking || !myTurn ? '' : 'Choose a stack.'}</span>}</div>}

      {opponentLeft && <div className="result-panel opponent-left"><div className="result-mark"><UserX size={20}/></div><div><span className="eyebrow">OPPONENT LEFT</span></div><button className="text-button" onClick={() => leaveRoom('computer')}>Play computer</button><button className="primary-button" onClick={() => leaveRoom('home')}>Back to menu<ArrowRight size={17}/></button></div>}

      {finished && !opponentLeft && <div className="result-panel"><div className="result-mark">{game.winner === 0 ? <span>½</span> : <Trophy size={22}/>}</div><div><span className="eyebrow">{matchComplete ? 'MATCH COMPLETE' : game.winner === 0 ? 'DRAW' : 'FOUR IN A ROW'}</span></div>{(!online || session?.seat !== 0) && <button className="primary-button" onClick={nextRound} disabled={busy || !!isReady}>{isReady ? <>Waiting for friend <LoaderCircle className="spin" size={16}/></> : <>{matchComplete ? 'Play again' : 'Next round'}<ArrowRight size={17}/></>}</button>}</div>}

      <div className="game-bottom"><div className="board-ident"><Box size={15}/><span>{game.variant === '3d' ? '4 × 4 × 4' : '7 × 6'}</span><span className="ident-separator"/> <span>{game.moves.length} {game.moves.length === 1 ? 'move' : 'moves'}</span></div>
        <nav className="game-tools" aria-label="Game controls">
          {!online && currentMode === 'computer' && <><IconButton label="Undo your last turn (U)" onClick={undo} disabled={!game.moves.length || finished}><Undo2 size={19}/></IconButton><IconButton label="Suggest a move (H)" onClick={hint} disabled={!myTurn || hintBusy} active={hintStack !== null}>{hintBusy ? <LoaderCircle className="spin" size={19}/> : <Lightbulb size={19}/>}</IconButton><span className="tool-separator"/></>}
          <IconButton label="Rotate board" onClick={() => {setRotateKey(k=>k+1);ping();}}><Rotate3D size={20}/></IconButton><IconButton label="Reset camera (R)" onClick={() => {setResetKey(k=>k+1);setView('perspective');ping();}}><RotateCcw size={18}/></IconButton><IconButton label="Choose a stack from the map" onClick={() => {setShowMap(!showMap);ping();}} active={showMap}><Grid2X2 size={18}/></IconButton><span className="tool-separator"/><IconButton label="Move history" onClick={() => {setModal('history');ping();}}><History size={18}/></IconButton>
        </nav><button className="perspective-toggle" onClick={() => {setView(view==='top'?'perspective':'top');ping();}}>{view === 'top' ? 'Perspective' : 'View from above'} <ArrowUpRight size={14}/></button>
      </div>

      {(showMap || !!sceneError) && !waiting && !finished && <div className="stack-map"><div className="map-head"><span>Choose a stack</span><button onClick={() => setShowMap(false)} aria-label="Close stack map"><X size={14}/></button></div>{game.variant === '3d' && <div className="map-cols"><span>A</span><span>B</span><span>C</span><span>D</span></div>}<div className={`map-grid ${game.variant}`} style={{gridTemplateColumns:`repeat(${dimensions.width},1fr)`}}>{Array.from({length:dimensions.stacks},(_,stack)=><button key={stack} className={`${selected === stack ? 'selected' : ''} ${hintStack === stack ? 'suggested' : ''}`} disabled={!myTurn || game.heights[stack] >= dimensions.height} aria-label={`Stack ${stackLabel(stack,game.variant)}, ${dimensions.height-game.heights[stack]} spaces available`} title={stackLabel(stack,game.variant)} onClick={() => selected === stack ? drop(stack) : select(stack)}><span className={`map-piece p${game.heights[stack] ? game.board[stack + dimensions.stacks*(game.heights[stack]-1)] : 0}`}/><small>{game.variant === 'classic' ? stack+1 : stackLabel(stack,game.variant)}</small></button>)}</div><p>Tap to select. Again to drop.</p></div>}
    </>}

    {modal === 'friends' && <Modal title="Play a friend" onClose={() => !busy && setModal(null)}>
      <div className="modal-tabs"><button className={friendTab==='create'?'selected':''} onClick={()=>{setFriendTab('create');setFriendError('');}}>Create a room</button><button className={friendTab==='join'?'selected':''} onClick={()=>{setFriendTab('join');setFriendError('');}}>Join a room</button></div>
      <form onSubmit={connect}><label className="field-label" htmlFor="player-name">Your name</label><input id="player-name" autoComplete="nickname" maxLength={24} placeholder="What should we call you?" value={friendName} onChange={e=>setFriendName(e.target.value)} />
        {friendTab === 'join' ? <><label className="field-label" htmlFor="room-code">Room code</label><input id="room-code" className="code-input" autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={6} placeholder="ABC123" value={roomCode} onChange={e=>setRoomCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,''))} required minLength={6}/><label className="check-label"><input type="checkbox" checked={spectate} onChange={e=>setSpectate(e.target.checked)}/> Just watching</label></> : <div className="room-configuration"><span>{variant === '3d' ? '3D · 4 × 4 × 4' : 'Classic · 7 × 6'}</span><span>{prefs.bestOf === 1 ? 'Single round' : `Best of ${prefs.bestOf}`}</span></div>}
        {friendError && <p className="form-error" role="alert">{friendError}</p>}
        <button type="submit" className="primary-button full-width" disabled={busy}>{busy ? <>Connecting <LoaderCircle size={18} className="spin"/></> : <>{friendTab === 'create' ? 'Create private room' : spectate ? 'Watch game' : 'Take a seat'}<ArrowRight size={18}/></>}</button>
      </form>
    </Modal>}

    {modal === 'settings' && <Modal title="Settings" onClose={()=>setModal(null)}>
      <div className="setting-row"><div><strong>Appearance</strong></div><div className="small-segment"><button aria-label="Light theme" className={prefs.theme==='light'?'selected':''} onClick={()=>changePrefs({theme:'light'})}><Sun size={17}/></button><button aria-label="Dark theme" className={prefs.theme==='dark'?'selected':''} onClick={()=>changePrefs({theme:'dark'})}><Moon size={17}/></button></div></div>
      <div className="setting-row"><div><strong>Sound</strong></div><button className={`switch ${prefs.sound?'on':''}`} role="switch" aria-label="Sound" aria-checked={prefs.sound} onClick={()=>changePrefs({sound:!prefs.sound})}><span/></button></div>
      <div className="setting-row"><div><strong>Reduced motion</strong></div><button className={`switch ${prefs.reducedMotion?'on':''}`} role="switch" aria-label="Reduced motion" aria-checked={prefs.reducedMotion} onClick={()=>changePrefs({reducedMotion:!prefs.reducedMotion})}><span/></button></div>
      <div className="setting-block"><label htmlFor="difficulty">Computer strength</label><select id="difficulty" value={prefs.difficulty} onChange={e=>{ const difficulty=e.target.value as Difficulty;changePrefs({difficulty});if(match?.mode==='computer') setMatch({...match,difficulty});}}>{LEVELS.map(level=><option key={level} value={level}>{capitalize(level)}</option>)}</select></div>
      <div className="setting-block"><span className="field-label">Next match</span><div className="match-options">{([1,3,5] as const).map(n=><button key={n} className={prefs.bestOf===n?'selected':''} onClick={()=>changePrefs({bestOf:n})}>{n===1?'One round':`Best of ${n}`}</button>)}</div></div>
      {online && <button className="text-button full-width" onClick={()=>void copyInvite(true)}><Link2 size={16}/> Copy spectator invite {copied && <Check size={16}/>}</button>}
      <button className="settings-help" onClick={()=>setModal('about')}>Rules & controls <ArrowUpRight size={15}/></button>
    </Modal>}

    {modal === 'history' && <Modal title="Move history" onClose={()=>setModal(null)}><div className="history-list">{game.moves.length ? game.moves.map((move)=><div className="history-row" key={move.ply}><span className="move-number">{String(move.ply).padStart(2,'0')}</span><span className={`history-orb p${move.player}`}/><span>{names[move.player-1]}</span><strong>{stackLabel(move.stack,game.variant)}</strong><small>Level {Math.floor(move.index/dimensions.stacks)+1}</small></div>) : <div className="empty-state"><History size={25}/></div>}</div></Modal>}

    {modal === 'stats' && <Modal title="Your stats" onClose={()=>setModal(null)}><div className="stats-grid"><div><b>{stats.played}</b><span>Rounds played</span></div><div><b>{stats.won}</b><span>Wins</span></div><div><b>{stats.played ? Math.round(stats.won/stats.played*100) : 0}<small>%</small></b><span>Win rate</span></div><div><b>{stats.bestStreak}</b><span>Best win streak</span></div></div></Modal>}

    {modal === 'about' && <Modal title="How to play" onClose={()=>setModal(null)}>
      <div className="rules-content"><p>Take turns dropping a piece. Gravity brings it to the lowest empty space. Get four of your pieces in a row to win.</p><div className="rule-variants"><div><Box size={21}/><strong>3D</strong><p>Connect along a row, up a stack, across a layer, or diagonally through the entire cube.</p></div><div><Grid2X2 size={21}/><strong>Classic</strong><p>Connect horizontally, vertically, or diagonally on the familiar 7 × 6 board.</p></div></div><div className="control-rows"><div className="pointer-only"><strong>Mouse</strong><span>Click to drop · Drag to rotate · Scroll to zoom</span></div><div className="touch-only"><strong>Touch</strong><span>Tap to select, tap again to drop · Swipe to rotate · Pinch to zoom</span></div><div className="pointer-only"><strong>Keyboard</strong><span>Arrows to select · Enter to drop · U undo · H hint · R reset</span></div></div><p className="rules-note">The stack map gives you a clear view of every playable position. Drawn rounds award no points. First to the target wins the match.</p></div>
    </Modal>}
    <div className={`toast ${toast ? 'visible' : ''}`} role="status">{toast}</div>
  </main>;
}
