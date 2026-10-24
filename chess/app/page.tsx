'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Chess, DEFAULT_POSITION, type Color, type PieceSymbol } from 'chess.js';
import { ArrowDownUp, ArrowRight, BookOpen, Bot, Check, ChevronDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, CircleHelp, Clipboard, Clock3, Download, Flag, Globe2, Handshake, History, Home, Lightbulb, Link2, LoaderCircle, MoreHorizontal, PencilLine, Play, Plus, RotateCcw, Settings2, ShieldCheck, SlidersHorizontal, Sparkles, Trophy, Undo2, Upload, Users, Volume2, VolumeX, X } from 'lucide-react';
import Board, { type BoardMove } from '@/components/Board';
import Settings from '@/components/Settings';
import Modal from '@/components/Modal';
import { ChessEngine, DIFFICULTIES, classifyMove, type EngineResult } from '@/lib/engine';
import { ChessSound } from '@/lib/sound';
import { DEFAULT_CONFIG, TIME_CONTROLS, chessOf, clocksAt, endGame, expireGame, formatClock, gamePgn, importGame, makeMove, moveUci, newGame, turnOf, uciMove, undoMoves, type Game, type GameConfig, type Mode } from '@/lib/game';
import { DEFAULT_PREFERENCES, readStorage, writeStorage, type Preferences } from '@/lib/preferences';
import { claimDraw, claimOptions, opposite, resignationResult, RULES_SCOPE, type MoveInput } from '@/lib/rules';
import { useOnline } from '@/lib/use-online';

const PIECE_VALUE: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const PIECE_NAME: Record<PieceSymbol, string> = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
const MODE_LABEL = { ai: 'Computer', local: 'Local', online: 'Online' };
type Screen = 'home' | 'play' | 'history';
type Dialog = null | 'settings' | 'help' | 'export' | 'import' | 'join' | 'result' | 'resign' | 'draw' | 'undo' | 'leave' | 'actions' | 'claim';

function safeGame(value: Game | null): Game | null {
  if (!value || !value.config || !Array.isArray(value.moves)) return null;
  try { const chess = chessOf(value); if (chess.fen() !== value.fen) return null; return value; } catch { return null; }
}
function evalLabel(result?: EngineResult): string {
  if (!result) return '—';
  if (result.mate !== undefined) return `M${Math.abs(result.mate)}`;
  return `${result.evaluation >= 0 ? '+' : ''}${(result.evaluation / 100).toFixed(1)}`;
}
function variation(fen: string, moves: string[]): string {
  const chess = new Chess(fen); const parts: string[] = [];
  for (const move of moves.slice(0, 8)) { try { parts.push(chess.move(uciMove(move)).san); } catch { break; } }
  return parts.join('  ');
}
function capturedBy(game: Game, side: Color): PieceSymbol[] {
  return game.moves.filter(move => move.color === side && move.captured).map(move => move.captured!).sort((a,b) => PIECE_VALUE[a] - PIECE_VALUE[b]);
}
function PlayerStrip({ game, side, preview, prefs, offset, you, connected, thinking, onLowTime }: { game: Game; side: Color; preview: boolean; prefs: Preferences; offset: number; you?: Color | 'spectator'; connected?: boolean; thinking?: boolean; onLowTime: () => void }) {
  const [now, setNow] = useState(Date.now()); const warned = useRef('');
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 100); return () => clearInterval(timer); }, []);
  const ms = preview ? game.clocks[side] : clocksAt(game, now + offset)[side];
  const active = !preview && !game.result && game.clocks.running === side;
  useEffect(() => { if (active && ms > 0 && ms < 10000 && warned.current !== game.id) { warned.current = game.id; onLowTime(); } }, [active, ms, game.id, onLowTime]);
  const computer = game.mode === 'ai' && side !== game.humanColor;
  const captures = capturedBy(game, side);
  const balance = captures.reduce((sum,p) => sum + PIECE_VALUE[p],0) - capturedBy(game, opposite(side)).reduce((sum,p) => sum + PIECE_VALUE[p],0);
  const subtitle = computer ? `${DIFFICULTIES[game.config.difficulty].label} · ~${DIFFICULTIES[game.config.difficulty].elo}${game.config.difficulty === 6 ? '+' : ''}`
    : game.mode === 'online' ? connected ? (side === 'w' ? 'White' : 'Black') : game.waiting && game.players[side] === (side === 'w' ? 'White' : 'Black') ? 'Waiting for opponent' : 'Away'
    : side === game.humanColor && game.mode === 'ai' ? 'Playing as ' + (side === 'w' ? 'white' : 'black') : side === 'w' ? 'White pieces' : 'Black pieces';
  return <div className={`player-strip ${active ? 'player-active' : ''}`}>
    <div className={`player-avatar ${computer ? 'avatar-bot' : ''}`}>{computer ? <Bot size={24}/> : <img src={`/pieces/${prefs.pieces}/${side}K.svg`} alt=""/>}{game.mode === 'online' && <i className={`presence ${connected ? 'connected' : ''}`}/>}</div>
    <div className="player-identity"><div className="player-name">{computer ? 'Computer' : game.players[side]}{you === side && game.mode === 'online' && <span className="you-label">you</span>}{thinking && computer && <span className="thinking-dots" aria-label="Thinking"><i/><i/><i/></span>}</div>
      {captures.length ? <div className="captured" aria-label={`${captures.length} captured pieces`}>{captures.map((piece,i)=><img key={i} src={`/pieces/${prefs.pieces}/${opposite(side)}${piece.toUpperCase()}.svg`} alt={PIECE_NAME[piece]}/>)}{balance > 0 && <span>+{balance}</span>}</div> : <div className="player-subtitle">{subtitle}</div>}
    </div>
    <div className={`chess-clock ${active ? 'clock-active' : ''} ${ms >= 0 && ms < 10000 ? 'clock-low' : ''}`} role="timer" aria-label={`${side === 'w' ? 'White' : 'Black'} time: ${formatClock(ms)}`}><Clock3 size={15}/><span>{formatClock(ms)}</span></div>
  </div>;
}
function IconButton({ label, children, onClick, disabled = false, active }: { label: string; children: ReactNode; onClick: () => void; disabled?: boolean; active?: boolean }) {
  return <button className={`icon-button ${active ? 'is-active' : ''}`} title={label} aria-label={label} onClick={onClick} disabled={disabled} aria-pressed={active}>{children}</button>;
}

export default function ChessApp() {
  const [screen, setScreen] = useState<Screen>('home');
  const [config, setConfig] = useState<GameConfig>(DEFAULT_CONFIG);
  const [prefs, setPrefs] = useState<Preferences>(DEFAULT_PREFERENCES);
  const [game, setGame] = useState<Game | null>(null);
  const [saved, setSaved] = useState<Game | null>(null);
  const [recent, setRecent] = useState<Game[]>([]);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [hydrated, setHydrated] = useState(false);
  const [flipped, setFlipped] = useState(false);
  const [viewIndex, setViewIndex] = useState<number | null>(null);
  const [panel, setPanel] = useState<'moves' | 'analysis'>('moves');
  const [movesOpen, setMovesOpen] = useState(true);
  const [annotationMode, setAnnotationMode] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [customTime, setCustomTime] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [engineState, setEngineState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [engineError, setEngineError] = useState('');
  const [engineAttempt, setEngineAttempt] = useState(0);
  const [toast, setToast] = useState('');
  const [hint, setHint] = useState<MoveInput | null>(null);
  const [hintText, setHintText] = useState('');
  const [hintBusy, setHintBusy] = useState(false);
  const [premove, setPremove] = useState<BoardMove | null>(null);
  const [joinCode, setJoinCode] = useState('');
  const [joinError, setJoinError] = useState('');
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState('');
  const [claimText, setClaimText] = useState('');
  const [consent, setConsent] = useState(false);
  const [evaluations, setEvaluations] = useState<Record<number, EngineResult>>({});
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [analysisError, setAnalysisError] = useState('');
  const [positionBusy, setPositionBusy] = useState(false);
  const engine = useRef<ChessEngine | null>(null); const analyst = useRef<ChessEngine | null>(null); const sound = useRef<ChessSound | null>(null);
  const gameRef = useRef<Game | null>(game); gameRef.current = game;
  const lastSound = useRef<{id: string; count: number} | null>(null); const seenResult = useRef('');
  const analysisController = useRef<AbortController | null>(null); const hintController = useRef<AbortController | null>(null); const moveList = useRef<HTMLDivElement>(null);
  const online = useOnline(); const onlineRef = useRef(online); onlineRef.current = online;
  const notify = useCallback((message: string) => setToast(message), []);
  const warmEngine = useCallback(() => {
    if (!engine.current) engine.current = new ChessEngine();
    setEngineError(''); setEngineState('loading');
    const instance = engine.current;
    void instance.ready().then(() => { if (engine.current === instance) setEngineState('ready'); }).catch(err => {
      if (engine.current !== instance || err.name === 'AbortError') return;
      setEngineState('error'); setEngineError(err.message);
    });
  }, []);

  useEffect(() => {
    const storedPrefs = readStorage<Partial<Preferences>>('chess:preferences:v1', {});
    setPrefs({ ...DEFAULT_PREFERENCES, ...storedPrefs });
    const storedConfig = readStorage<Partial<GameConfig>>('chess:config:v1', {});
    setConfig({ ...DEFAULT_CONFIG, ...storedConfig, mode: 'ai', difficulty: Math.max(0, Math.min(6, storedConfig.difficulty ?? 2)) });
    setSaved(safeGame(readStorage<Game | null>('chess:unfinished:v1', null)));
    setRecent(readStorage<Game[]>('chess:recent:v1', []).map(safeGame).filter((item): item is Game => !!item).slice(0, 30));
    setHydrated(true); sound.current = new ChessSound(); warmEngine();
    const unlock = () => sound.current?.unlock(); document.addEventListener('pointerdown', unlock, { passive: true }); document.addEventListener('keydown', unlock);
    const roomCode = new URLSearchParams(window.location.search).get('room');
    if (roomCode) {
      setJoinCode(roomCode.toUpperCase());
      void onlineRef.current.resume(roomCode).then(data => { if (data) { setGame(data.game); setScreen('play'); } else setDialog('join'); }).catch(err => { setJoinError(err.message); setDialog('join'); });
    }
    return () => {
      engine.current?.destroy(); analyst.current?.destroy(); sound.current?.destroy();
      engine.current = null; analyst.current = null; sound.current = null;
      document.removeEventListener('pointerdown', unlock); document.removeEventListener('keydown', unlock);
      analysisController.current?.abort(); hintController.current?.abort();
    };
  }, [warmEngine]);
  useEffect(() => {
    if (!hydrated) return;
    writeStorage('chess:preferences:v1', prefs); sound.current?.setVolume(prefs.volume); sound.current?.setMuted(prefs.muted);
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => { document.documentElement.dataset.theme = prefs.theme === 'system' ? query.matches ? 'dark' : 'light' : prefs.theme; document.documentElement.dataset.motion = prefs.reducedMotion ? 'reduced' : 'full'; };
    apply(); query.addEventListener('change', apply); return () => query.removeEventListener('change', apply);
  }, [prefs, hydrated]);
  useEffect(() => { if (hydrated) writeStorage('chess:config:v1', config); }, [config, hydrated]);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 4500); return () => clearTimeout(timer); }, [toast]);
  useEffect(() => {
    if (!game || !hydrated) return;
    if (game.mode !== 'online' && !game.result) { writeStorage('chess:unfinished:v1', game); setSaved(game); }
    if (game.result) {
      setRecent(previous => { const next = [game, ...previous.filter(item => item.id !== game.id)].slice(0, 30); writeStorage('chess:recent:v1', next); return next; });
      if (game.mode !== 'online' && readStorage<Game | null>('chess:unfinished:v1', null)?.id === game.id) { writeStorage('chess:unfinished:v1', null); setSaved(null); }
      if (seenResult.current !== game.id && screen === 'play') { seenResult.current = game.id; setDialog('result'); sound.current?.play(game.result.winner === null ? 'draw' : game.mode === 'ai' && game.result.winner !== game.humanColor ? 'lose' : 'win'); }
    }
  }, [game, hydrated, screen]);
  useEffect(() => {
    if (!game || game.mode === 'online' || game.result || screen !== 'play') return;
    const timer = setInterval(() => setGame(current => current ? expireGame(current) : current), 100);
    return () => clearInterval(timer);
  }, [game?.id, game?.mode, game?.result, screen]);
  useEffect(() => {
    if (!online.room) return;
    if (gameRef.current?.id !== online.room.game.id && !online.room.game.result) setPanel('moves');
    setGame(current => current?.id === online.room!.game.id && current.revision === online.room!.game.revision ? current : online.room!.game);
  }, [online.room]);
  useEffect(() => {
    if (!game) return;
    if (lastSound.current?.id === game.id && game.moves.length > lastSound.current.count) {
      const move = game.moves.at(-1)!;
      sound.current?.play(move.san.includes('+') || move.san.includes('#') ? 'check' : move.promotion ? 'promotion' : move.flags.includes('k') || move.flags.includes('q') ? 'castle' : move.captured ? 'capture' : game.mode === 'online' && online.room?.you !== move.color ? 'incoming' : 'move');
    }
    lastSound.current = { id: game.id, count: game.moves.length };
    hintController.current?.abort(); hintController.current = null; setHintBusy(false);
    setHint(null); setHintText('');
  }, [game?.id, game?.moves.length]);
  useEffect(() => {
    if (!game || game.mode !== 'ai' || game.result || game.waiting || turnOf(game) === game.humanColor || screen !== 'play') { setThinking(false); return; }
    const controller = new AbortController(); const id = game.id; const fen = game.fen;
    setThinking(true); setEngineError('');
    if (!engine.current) engine.current = new ChessEngine();
    const remaining = clocksAt(game)[turnOf(game)]; const budget = remaining < 0 ? game.config.thinkMs : Math.min(game.config.thinkMs, Math.max(60, remaining / 12));
    void engine.current.bestMove(fen, { difficulty: game.config.difficulty, thinkMs: budget, signal: controller.signal, initialFen: game.initialFen, moves: game.moves.map(moveUci) }).then(result => {
      if (controller.signal.aborted || gameRef.current?.id !== id || gameRef.current.fen !== fen || gameRef.current.result) return;
      const current = gameRef.current;
      if (!current || current.id !== id || current.fen !== fen || current.result) return;
      const next = makeMove(current, uciMove(result.move)); gameRef.current = next; setGame(next); setEngineState('ready');
    }).catch(err => { if (err.name !== 'AbortError' && !controller.signal.aborted) { setEngineError(err.message || 'The engine stopped. Try again.'); setEngineState('error'); } }).finally(() => { if (!controller.signal.aborted) setThinking(false); });
    return () => controller.abort();
  }, [game?.id, game?.fen, game?.result, screen, engineAttempt]);
  useEffect(() => {
    if (!premove || !game || game.mode !== 'online' || game.result || online.busy || online.connection !== 'live' || online.room?.you !== turnOf(game)) return;
    const move = premove; setPremove(null);
    try { new Chess(game.fen).move(move); void online.send('move', { move }).catch(err => notify(err.message)); } catch { notify('Premove cancelled: that move is no longer legal.'); }
  }, [premove, game?.fen, game?.result, online.busy, online.connection, online.room?.you]);
  useEffect(() => {
    setEvaluations({}); setAnalysisProgress(0); setAnalysisError(''); setAnalyzing(false); setPositionBusy(false); setAnnotationMode(false);
    analysisController.current?.abort(); analyst.current?.cancel(); setViewIndex(null); setPremove(null);
  }, [game?.id]);

  const preview = screen !== 'play' || !game;
  const previewGame = useMemo(() => newGame({ ...config, color: config.color === 'random' ? 'w' : config.color }, 0), [config]);
  const shownGame = preview ? previewGame : game!;
  const index = viewIndex === null ? shownGame.moves.length : Math.min(viewIndex, shownGame.moves.length);
  const historical = index < shownGame.moves.length;
  const initialPlyOffset = shownGame.initialFen.split(' ')[1] === 'b' ? 1 : 0;
  const firstMoveNumber = Number(shownGame.initialFen.split(' ')[5]) || 1;
  const shownFen = index === 0 ? shownGame.initialFen : shownGame.moves[index - 1]?.fen ?? shownGame.fen;
  const position = useMemo(() => new Chess(shownFen), [shownFen]);
  const claims = useMemo(() => game && !game.result ? claimOptions(chessOf(game)) : { threefold: false, fiftyMove: false }, [game?.id, game?.fen, game?.result]);
  const baseOrientation = !preview && shownGame.mode === 'online' && online.room?.you !== 'spectator' ? online.room?.you ?? 'w'
    : !preview && shownGame.mode === 'local' && shownGame.config.autoRotate && !shownGame.result ? turnOf(shownGame) : shownGame.humanColor;
  const orientation: Color = flipped ? opposite(baseOrientation) : baseOrientation;
  const myColor = game?.mode === 'online' ? online.room?.you : game?.mode === 'ai' ? game.humanColor : game ? turnOf(game) : 'w';
  const reviewAllowed = !!game?.result;
  const currentEvaluation = evaluations[index];
  const hasBestMove = !!currentEvaluation?.move && /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(currentEvaluation.move);
  const displayHint = hint ?? (!preview && reviewAllowed && panel === 'analysis' && prefs.bestArrow && hasBestMove ? uciMove(currentEvaluation!.move) : null);
  const canInteract = !historical && !shownGame.result && !shownGame.waiting && (preview ? config.mode !== 'online' && config.color !== 'b' : game?.mode !== 'online' || (online.connection === 'live' && !online.busy && online.room?.you !== 'spectator'));
  const gameStatus = preview ? 'White to move' : shownGame.waiting ? 'Waiting for your opponent' : shownGame.result ? shownGame.result.reason
    : historical ? `Reviewing move ${Math.ceil(index / 2)} · Game is still live` : position.isCheck() ? `${position.turn() === 'w' ? 'White' : 'Black'} is in check` : thinking ? 'Thinking…'
    : shownGame.mode === 'online' && online.room?.you === 'spectator' ? `${position.turn() === 'w' ? 'White' : 'Black'} to move` : shownGame.mode === 'local' ? `${position.turn() === 'w' ? 'White' : 'Black'} to move` : turnOf(shownGame) === myColor ? 'Your move' : 'Opponent’s move';

  useEffect(() => { if (screen === 'play') window.scrollTo({ top: 0 }); }, [screen, game?.id]);
  const opponentColor: Color | null = game?.mode === 'online' && online.room && online.room.you !== 'spectator' && online.room.game.id === game.id ? opposite(online.room.you) : null;
  const opponentAway = !preview && !!opponentColor && !shownGame.waiting && online.connection === 'live' && online.room?.connected[opponentColor] === false;
  const [opponentLeft, setOpponentLeft] = useState(false);
  useEffect(() => {
    // Give an opponent who dropped out 15 s to come back before offering a way out.
    setOpponentLeft(false);
    if (!opponentAway) return;
    const timer = setTimeout(() => setOpponentLeft(true), 15_000);
    return () => clearTimeout(timer);
  }, [opponentAway, game?.id]);
  const stopCalculations = () => { engine.current?.cancel(); analyst.current?.cancel(); analysisController.current?.abort(); hintController.current?.abort(); hintController.current = null; setThinking(false); setHintBusy(false); setAnalyzing(false); setPositionBusy(false); setPremove(null); };
  const begin = (nextConfig = config) => {
    stopCalculations(); online.leave(); setFlipped(false); setViewIndex(null); setPanel('moves'); seenResult.current = ''; setDialog(null); setHint(null);
    const next = newGame(nextConfig); setGame(next); setScreen('play'); sound.current?.unlock(); sound.current?.play('start');
  };
  const onMove = useCallback((move: BoardMove) => {
    sound.current?.unlock();
    if (preview) {
      if (config.mode === 'online' || config.color === 'b') return;
      try { const next = makeMove(newGame({ ...config, color: 'w' }), move); gameRef.current = next; setGame(next); setScreen('play'); seenResult.current = ''; sound.current?.play('move'); }
      catch (err) { notify(err instanceof Error ? err.message : 'That move is not legal.'); }
      return;
    }
    const current = gameRef.current;
    if (!current || current.result) return;
    if (current.mode === 'online') { if (onlineRef.current.room?.you === turnOf(current)) void onlineRef.current.send('move', { move }).catch(err => notify(err.message)); return; }
    if (current.mode === 'ai' && turnOf(current) !== current.humanColor) return;
    try { const next = makeMove(current, move); gameRef.current = next; setGame(next); } catch (err) { notify(err instanceof Error ? err.message : 'That move is not legal.'); }
    setViewIndex(null);
  }, [preview, config, notify]);
  const navigate = useCallback((next: number | 'last') => {
    const current = gameRef.current; if (!current) return;
    hintController.current?.abort(); hintController.current = null; setHintBusy(false);
    setViewIndex(next === 'last' || next >= current.moves.length ? null : Math.max(0, next)); setHint(null); setHintText('');
  }, []);
  const returnHome = () => { stopCalculations(); online.leave(); setScreen('home'); setDialog(null); setViewIndex(null); setAnnotationMode(false); };
  const newGameClick = () => { if (game && !game.result && screen === 'play' && (game.moves.length || game.mode === 'online')) setDialog('leave'); else returnHome(); };
  const resumeGame = () => { if (!saved) return; online.leave(); setGame(expireGame(saved)); setScreen('play'); setViewIndex(null); seenResult.current = ''; };
  const retryEngine = () => { engine.current?.destroy(); engine.current = null; warmEngine(); setEngineAttempt(value => value + 1); };
  const pickupSound = useCallback(() => { sound.current?.unlock(); sound.current?.play('pickup'); }, []);
  const lowTimeSound = useCallback(() => sound.current?.play('warning'), []);
  const askHint = async () => {
    if (!game || game.result || game.mode !== 'ai' || turnOf(game) !== game.humanColor || historical) return;
    hintController.current?.abort(); const controller = new AbortController(); hintController.current = controller;
    setHintBusy(true); const id = game.id; const fen = game.fen;
    try {
      if (!engine.current) engine.current = new ChessEngine();
      const result = await engine.current.evaluate(fen, 800, controller.signal);
      if (controller.signal.aborted || gameRef.current?.id !== id || gameRef.current.fen !== fen || gameRef.current.result) return;
      const move = uciMove(result.move); const chess = new Chess(fen); const san = chess.move(move).san;
      setHint(move); setHintText(`Try ${san}.`);
    } catch (err) { if ((err as Error).name !== 'AbortError' && !controller.signal.aborted) notify((err as Error).message); } finally { if (hintController.current === controller) { hintController.current = null; setHintBusy(false); } }
  };
  const resign = async () => {
    if (!game) return;
    setDialog(null); stopCalculations();
    if (game.mode === 'online') { await online.send('resign').catch(err => notify(err.message)); return; }
    const color = game.mode === 'ai' ? game.humanColor : turnOf(game); setGame(endGame(game, resignationResult(chessOf(game), color)));
  };
  const undo = () => {
    if (!game || !game.moves.length) return;
    stopCalculations(); const count = game.mode === 'ai' && turnOf(game) === game.humanColor ? 2 : 1;
    setGame(undoMoves(game, count)); setViewIndex(null); setDialog(null); seenResult.current = '';
  };
  const requestDraw = () => {
    if (!game) return;
    if (game.mode === 'online') { void online.send('offer-draw').catch(err => notify(err.message)); return; }
    setConsent(false); setDialog('draw');
  };
  const performClaim = async (kind: 'threefold' | 'fifty') => {
    if (!game) return;
    let intended: MoveInput | undefined;
    if (claimText.trim()) { try { intended = new Chess(game.fen).move(claimText.trim()); } catch { notify('Enter a legal intended move, for example Nf3.'); return; } }
    if (game.mode === 'online') { await online.send('claim-draw', { claim: kind, move: intended }).catch(err => notify(err.message)); setDialog(null); return; }
    if (game.mode === 'ai' && turnOf(game) !== game.humanColor) { notify('You can claim a draw on your turn.'); return; }
    const result = claimDraw(chessOf(game), kind, intended);
    if (!result) { notify('The position does not qualify for that claim.'); return; }
    stopCalculations(); setGame(endGame(game, result)); setDialog(null);
  };
  const rematch = () => {
    if (!game) return;
    if (game.mode === 'online') {
      if (online.room?.game.id === game.id) { void online.send('rematch').catch(err => notify(err.message)); setDialog(null); }
      else { setConfig({ ...game.config, mode: 'online' }); returnHome(); notify('Create a new room to play again.'); }
      return;
    }
    begin({ ...game.config, color: opposite(game.humanColor) });
  };
  const createOnline = async () => {
    try { stopCalculations(); const room = await online.create(config); setGame(room.game); setScreen('play'); setFlipped(false); setViewIndex(null); sound.current?.play('start'); }
    catch (err) { notify((err as Error).message); }
  };
  const joinOnline = async (spectate = false) => {
    setJoinError('');
    try { stopCalculations(); const room = await online.join(joinCode, config.nickname === 'You' ? 'Guest' : config.nickname, spectate); setGame(room.game); setScreen('play'); setDialog(null); setFlipped(false); }
    catch (err) { setJoinError((err as Error).message); }
  };
  const copy = async (text: string, success = 'Copied to clipboard') => {
    try { await navigator.clipboard.writeText(text); notify(success); } catch { notify('Clipboard is unavailable. Select and copy the text instead.'); }
  };
  const download = () => {
    if (!game) return; const blob = new Blob([gamePgn(game)], { type: 'application/x-chess-pgn' }); const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `chess-${new Date(game.startedAt).toISOString().slice(0,10)}.pgn`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const doImport = () => {
    try { const imported = importGame(importText, config); stopCalculations(); online.leave(); seenResult.current = imported.result ? imported.id : ''; setGame(imported); setScreen('play'); setDialog(null); setPanel(imported.result ? 'analysis' : 'moves'); setViewIndex(null); setImportError(''); }
    catch (err) { setImportError((err as Error).message); }
  };
  const reviewGame = () => { setDialog(null); setPanel('analysis'); setViewIndex(null); };
  const runAnalysis = async () => {
    if (!game?.result) return; analysisController.current?.abort(); const controller = new AbortController(); analysisController.current = controller;
    if (!analyst.current) analyst.current = new ChessEngine();
    analyst.current.cancel(); setAnalyzing(true); setAnalysisError(''); setAnalysisProgress(0); setEvaluations({});
    try {
      const positions = [game.initialFen, ...game.moves.map(move => move.fen)];
      for (let i = 0; i < positions.length; i++) {
        const result = await analyst.current.evaluate(positions[i], 400, controller.signal);
        if (controller.signal.aborted) return;
        setEvaluations(previous => ({ ...previous, [i]: result })); setAnalysisProgress(i + 1);
      }
    } catch (err) { if ((err as Error).name !== 'AbortError') setAnalysisError((err as Error).message); }
    finally { if (!controller.signal.aborted) setAnalyzing(false); }
  };
  useEffect(() => {
    if (!game?.result || panel !== 'analysis' || analyzing || evaluations[index] || screen !== 'play') { setPositionBusy(false); return; }
    const controller = new AbortController(); if (!analyst.current) analyst.current = new ChessEngine(); setPositionBusy(true);
    void analyst.current.evaluate(shownFen, 700, controller.signal).then(result => { if (!controller.signal.aborted) setEvaluations(previous => ({ ...previous, [index]: result })); }).catch(err => { if (err.name !== 'AbortError') setAnalysisError(err.message); }).finally(() => { if (!controller.signal.aborted) setPositionBusy(false); });
    return () => { controller.abort(); setPositionBusy(false); };
  }, [game?.id, game?.result, panel, index, analyzing, screen]);
  useEffect(() => {
    if (viewIndex === null && moveList.current) moveList.current.scrollTop = moveList.current.scrollHeight;
  }, [game?.moves.length, viewIndex, panel]);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement && event.target.closest('input, textarea, select, [contenteditable="true"]')) return;
      const inBoard = event.target instanceof HTMLElement && !!event.target.closest('[role="grid"]');
      if (dialog) return;
      if (event.key.toLowerCase() === 'f') { event.preventDefault(); setFlipped(value => !value); }
      if (event.key.toLowerCase() === 'm') setPrefs(previous => ({ ...previous, muted: !previous.muted }));
      if (screen === 'play' && !inBoard && event.key === 'ArrowLeft') { event.preventDefault(); navigate(index - 1); }
      if (screen === 'play' && !inBoard && event.key === 'ArrowRight') { event.preventDefault(); navigate(index + 1); }
      if (event.key === 'Escape') { setHint(null); setPremove(null); setAnnotationMode(false); }
    };
    window.addEventListener('keydown', handler); return () => window.removeEventListener('keydown', handler);
  }, [dialog, screen, index, navigate]);

  const startButton = <button className="button button-primary play-button" onClick={() => config.mode === 'online' ? void createOnline() : begin()} disabled={online.busy}>{online.busy ? <LoaderCircle className="spin" size={19}/> : <Play size={18} fill="currentColor"/>}<span>{config.mode === 'online' ? 'Create a private room' : 'Play now'}</span><ArrowRight size={19}/></button>;
  const timeSelect = <div className="field"><label htmlFor="time-control"><Clock3 size={15}/> Time control</label><div className="select-wrap"><select id="time-control" value={customTime ? 'custom' : TIME_CONTROLS.findIndex(time => time.minutes === config.time.minutes && time.increment === config.time.increment)} onChange={e => { if (e.target.value === 'custom') setCustomTime(true); else { setCustomTime(false); setConfig(previous => ({ ...previous, time: TIME_CONTROLS[Number(e.target.value)] })); } }}>{TIME_CONTROLS.map((time,i) => <option key={i} value={i}>{time.label}{i === 6 ? ' · Rapid' : i > 0 && i < 3 ? ' · Bullet' : i >= 3 && i <= 5 ? ' · Blitz' : ''}</option>)}<option value="custom">Custom…</option></select><ChevronDown size={15}/></div>{customTime && <div className="custom-time"><label>Minutes<input type="number" min="0" max="180" value={config.time.minutes} onChange={e=>setConfig(previous=>({...previous,time:{...previous.time,minutes:Math.max(0,Math.min(180,Number(e.target.value))),label:'Custom'}}))}/></label><label>Increment (sec)<input type="number" min="0" max="180" value={config.time.increment} onChange={e=>setConfig(previous=>({...previous,time:{...previous.time,increment:Math.max(0,Math.min(180,Number(e.target.value))),label:'Custom'}}))}/></label></div>}</div>;
  const colorSelect = <div className="field"><label>Your pieces</label><div className="color-options">{(['w','random','b'] as const).map(color=><button key={color} className={config.color === color ? 'selected' : ''} aria-pressed={config.color === color} onClick={()=>setConfig(previous=>({...previous,color}))}>{color === 'random' ? <span className="random-piece"><img src="/pieces/classic/wK.svg" alt=""/><img src="/pieces/classic/bK.svg" alt=""/></span> : <img src={`/pieces/classic/${color}K.svg`} alt=""/>}<span>{color === 'w' ? 'White' : color === 'b' ? 'Black' : 'Random'}</span>{config.color === color && <Check size={13}/>}</button>)}</div></div>;

  return <div className="app-shell">
    <aside className="app-rail" aria-label="Main navigation"><button className="brand-mark" aria-label="Chess home" onClick={newGameClick}><img src="/pieces/classic/bN.svg" alt=""/></button><nav><button className={`rail-button ${screen !== 'history' ? 'rail-active' : ''}`} onClick={newGameClick} title="Play" aria-label="Play"><Play size={21}/><span>Play</span></button><button className={`rail-button ${screen === 'history' ? 'rail-active' : ''}`} onClick={()=>{ if (game && !game.result && screen === 'play') { notify('Finish this game first.'); return; } setScreen('history'); }} title="Your games" aria-label="Your games"><History size={22}/><span>Games</span></button><button className="rail-button" onClick={()=>{ setImportError(''); setDialog('import'); }} title="Import game" aria-label="Import game"><Upload size={20}/><span>Import</span></button></nav><div className="rail-bottom"><button className="rail-button" onClick={()=>setDialog('help')} title="How to play" aria-label="How to play"><CircleHelp size={21}/></button><button className="rail-button" onClick={()=>setDialog('settings')} title="Settings" aria-label="Settings"><Settings2 size={22}/></button></div></aside>
    <div className="app-main"><header className="topbar"><h1 className="wordmark-title"><button className="wordmark" onClick={newGameClick}>Chess</button></h1><div className="topbar-actions"><button className="quiet-button" onClick={()=>{ setJoinError(''); setDialog('join'); }}><Link2 size={16}/><span>Join a friend</span></button><span className="mobile-only"><IconButton label="Your games" onClick={()=>{ if (game && !game.result && screen === 'play') { notify('Finish this game first.'); return; } setScreen('history'); }}><History size={19}/></IconButton><IconButton label="How to play" onClick={()=>setDialog('help')}><CircleHelp size={19}/></IconButton></span><IconButton label="Settings" onClick={()=>setDialog('settings')}><SlidersHorizontal size={19}/></IconButton></div></header>
      <main className={`workspace ${screen === 'history' ? 'history-workspace' : ''}`}>
        {screen === 'history' && <header className="page-heading"><div><h1>Your games</h1></div></header>}
        {screen === 'history' ? <section className="archive"><div className="archive-heading"><h2>Recent games <span>{recent.length}</span></h2><button className="button button-small" onClick={()=>{setScreen('home');}}><Plus size={16}/>Play a game</button></div>{recent.length ? <div className="game-table"><div className="game-table-head"><span>Players</span><span>Mode</span><span>Result</span><span>Date</span><span/></div>{recent.map(item=><button className="game-table-row" key={item.id} onClick={()=>{ online.leave(); stopCalculations(); seenResult.current = item.id; setGame(item); setScreen('play'); setPanel('analysis'); setViewIndex(null); }}><span className="archive-players"><img src="/pieces/classic/wK.svg" alt=""/><span>{item.players.w}<small>vs. {item.players.b}</small></span></span><span>{MODE_LABEL[item.mode]}<small>{item.config.time.label}</small></span><strong>{item.result?.result}<small>{item.result?.reason}</small></strong><span>{new Date(item.startedAt).toLocaleDateString(undefined,{month:'short',day:'numeric'})}<small>{Math.ceil(item.moves.length/2)} moves</small></span><ChevronRight size={18}/></button>)}</div> : <div className="empty-archive"><History size={36}/><h3>No games yet.</h3><p>Finished games show up here.</p><button className="button button-primary" onClick={()=>setScreen('home')}>Play <ArrowRight size={17}/></button></div>}</section> : <div className="play-layout">
          <section className="board-column" aria-label="Chess game">
            <PlayerStrip game={shownGame} side={opposite(orientation)} preview={preview} prefs={prefs} offset={game?.mode === 'online' ? online.offset : 0} you={online.room?.you} connected={online.room?.connected[opposite(orientation)]} thinking={thinking} onLowTime={lowTimeSound}/>
            <div className="board-frame">{reviewAllowed && panel === 'analysis' && !preview && <div className="evaluation-bar" title={`White evaluation ${evalLabel(currentEvaluation)}`}><div style={{height:`${Math.max(3,Math.min(97,50 + 45 * Math.tanh((currentEvaluation?.evaluation ?? 0)/400)))}%`}}/><span>{evalLabel(currentEvaluation)}</span></div>}<Board key={preview ? 'preview' : shownGame.id} fen={shownFen} orientation={orientation} interactive={canInteract} allowedColor={preview ? 'w' : shownGame.mode === 'local' ? undefined : shownGame.mode === 'ai' ? shownGame.humanColor : online.room?.you === 'spectator' ? undefined : online.room?.you} onMove={onMove} lastMove={index ? shownGame.moves[index-1] : null} hint={displayHint} theme={prefs.board} pieceStyle={prefs.pieces} coordinates={prefs.coordinates} legalIndicators={prefs.legal} animations={prefs.animations && !prefs.reducedMotion} autoQueen={prefs.autoQueen} annotationMode={annotationMode} onPickup={pickupSound} premove={premove} onPremove={!preview && game?.mode === 'online' && prefs.premoves && online.room?.you !== 'spectator' ? setPremove : undefined}/></div>
            <PlayerStrip game={shownGame} side={orientation} preview={preview} prefs={prefs} offset={game?.mode === 'online' ? online.offset : 0} you={online.room?.you} connected={online.room?.connected[orientation]} thinking={thinking} onLowTime={lowTimeSound}/>
            <div className="board-toolbar"><div className="board-status" aria-live="polite"><span className={`status-dot ${position.isCheck() ? 'status-check' : ''}`}/><span>{gameStatus}</span></div><div className="board-tools"><IconButton label="Flip board (F)" onClick={()=>setFlipped(value=>!value)}><ArrowDownUp size={17}/></IconButton><IconButton label="Annotate board" active={annotationMode} onClick={()=>setAnnotationMode(value=>!value)}><PencilLine size={17}/></IconButton><IconButton label={prefs.muted ? 'Unmute sound (M)' : 'Mute sound (M)'} onClick={()=>setPrefs(previous=>({...previous,muted:!previous.muted}))}>{prefs.muted ? <VolumeX size={18}/> : <Volume2 size={18}/>}</IconButton><span className="mobile-only"><IconButton label="Game actions" onClick={()=>setDialog('actions')}><MoreHorizontal size={20}/></IconButton></span></div></div>
            {hintText && !preview && <div className="hint-message"><Lightbulb size={17}/>{hintText}<button onClick={()=>{setHint(null);setHintText('');}} aria-label="Dismiss hint"><X size={15}/></button></div>}{premove && <button className="premove-message" onClick={()=>setPremove(null)}>Premove: {premove.from} → {premove.to}<X size={14}/></button>}{historical && !shownGame.result && <button className="return-live button" onClick={()=>navigate('last')}><Play size={15}/>Return to live game</button>}
          </section>
          <aside className={`side-panel ${preview ? 'setup-panel' : 'match-panel'}`}>
            {preview ? <><div className="mode-tabs" role="tablist" aria-label="Game mode">{(['ai','online','local'] as Mode[]).map(mode=><button key={mode} role="tab" aria-selected={config.mode === mode} className={config.mode === mode ? 'active' : ''} onClick={()=>setConfig(previous=>({...previous,mode}))}>{mode === 'ai' ? <Bot size={17}/> : mode === 'online' ? <Globe2 size={17}/> : <Users size={17}/>}<span>{MODE_LABEL[mode]}</span></button>)}</div>
              <div className="setup-content">
              {config.mode === 'ai' && <div className="difficulty-block"><div className="opponent-profile"><div className="opponent-portrait"><img src="/pieces/classic/bN.svg" alt=""/></div><div><h3>{DIFFICULTIES[config.difficulty].label}</h3><p>~{DIFFICULTIES[config.difficulty].elo}{config.difficulty === 6 ? '+' : ''}<span> estimated strength</span></p></div><div className="strength-bars" aria-hidden="true">{[0,1,2,3,4].map(i=><i key={i} className={i <= config.difficulty * 4/6 ? 'filled' : ''}/>)}</div></div><label className="sr-only" htmlFor="difficulty">Computer difficulty</label><input id="difficulty" className="difficulty-slider" type="range" min="0" max="6" step="1" value={config.difficulty} onChange={e=>setConfig(previous=>({...previous,difficulty:Number(e.target.value)}))} aria-valuetext={`${DIFFICULTIES[config.difficulty].label}, approximately ${DIFFICULTIES[config.difficulty].elo} Elo`}/><div className="slider-labels"><span>Beginner</span><span>Master</span></div></div>}
              {config.mode === 'online' && <div className="field"><label htmlFor="online-nickname">Your name</label><input id="online-nickname" maxLength={24} value={config.nickname === 'You' ? '' : config.nickname} placeholder="Enter a nickname" onChange={e=>setConfig(previous=>({...previous,nickname:e.target.value || 'You'}))}/></div>}
              {timeSelect}{config.mode !== 'local' && colorSelect}
              <button className="advanced-toggle" onClick={()=>setAdvanced(value=>!value)} aria-expanded={advanced}><SlidersHorizontal size={15}/><span>Game options</span><ChevronDown size={14} className={advanced ? 'turned' : ''}/></button>
              {advanced && <div className="advanced-options">{config.mode === 'ai' && <><label><input type="checkbox" checked={config.hints} onChange={e=>setConfig(previous=>({...previous,hints:e.target.checked}))}/>Allow hints</label><label><input type="checkbox" checked={config.takebacks} onChange={e=>setConfig(previous=>({...previous,takebacks:e.target.checked}))}/>Allow takebacks</label><label className="think-time">Thinking time<select value={config.thinkMs} onChange={e=>setConfig(previous=>({...previous,thinkMs:Number(e.target.value)}))}><option value={250}>Quick · 0.25 seconds</option><option value={900}>Balanced · 0.9 seconds</option><option value={2000}>Thoughtful · 2 seconds</option><option value={5000}>Deep · 5 seconds</option></select></label></>}{config.mode === 'local' && <label><input type="checkbox" checked={config.autoRotate} onChange={e=>setConfig(previous=>({...previous,autoRotate:e.target.checked}))}/>Rotate board after each move</label>}</div>}
              {startButton}
              {config.mode === 'online' && <button className="join-room-button" onClick={()=>{setJoinError('');setDialog('join');}}>Join with a code <ArrowRight size={15}/></button>}
              {saved && <button className="continue-game" onClick={resumeGame}><RotateCcw size={17}/><span>Continue your game<small>{saved.players.w} vs. {saved.players.b} · Move {Math.floor(saved.moves.length/2)+1}</small></span><ArrowRight size={16}/></button>}
              </div></> : <>
              <div className="match-heading"><div className="match-icon">{shownGame.mode === 'ai' ? <Bot size={22}/> : shownGame.mode === 'online' ? <Globe2 size={22}/> : <Users size={22}/>}</div><div><h2>{shownGame.mode === 'ai' ? 'You vs. computer' : shownGame.mode === 'online' ? 'Online game' : 'Local game'}</h2><p>{shownGame.config.time.label}{shownGame.mode === 'ai' ? ` · ${DIFFICULTIES[shownGame.config.difficulty].label}` : shownGame.mode === 'online' ? ` · Game ${shownGame.gameNumber}` : ' · Pass & play'}</p></div><button className="button button-small match-new" onClick={newGameClick}><Plus size={16}/>New game</button></div>
              {shownGame.mode === 'online' && online.room?.game.id === shownGame.id && <div className="room-info"><div className={`connection-state ${online.connection === 'live' ? 'live' : ''}`}><span className="status-dot"/>{online.connection === 'live' ? online.room?.you === 'spectator' ? 'Watching' : '' : 'Reconnecting…'}</div><button onClick={()=>void copy(`${window.location.origin}${window.location.pathname}?room=${online.room?.code}`, 'Invite link copied')}><Link2 size={14}/>{online.room?.code}<Clipboard size={13}/></button></div>}
              {shownGame.waiting ? <div className="waiting-panel"><div className="waiting-icon"><Users size={30}/></div><h3>Send this link to a friend.</h3><div className="share-link"><input readOnly aria-label="Room invite link" value={hydrated ? `${window.location.origin}${window.location.pathname}?room=${online.room?.code}` : ''}/><IconButton label="Copy invite link" onClick={()=>void copy(`${window.location.origin}${window.location.pathname}?room=${online.room?.code}`, 'Invite link copied')}><Clipboard size={18}/></IconButton></div><span className="waiting-code">Room code <strong>{online.room?.code}</strong></span><p className="waiting-footnote">The clock starts when your opponent joins.</p></div> : <>
              <div className="panel-tabs"><button className={panel === 'moves' ? 'active' : ''} onClick={()=>setPanel('moves')}>Moves <span>{shownGame.moves.length}</span></button><button className={panel === 'analysis' ? 'active' : ''} onClick={()=>setPanel('analysis')}>Analysis{!reviewAllowed && <span className="tab-after">after game</span>}</button><button className="collapse-moves" onClick={()=>setMovesOpen(value=>!value)} aria-label="Toggle move history" aria-expanded={movesOpen}><ChevronDown size={17}/></button></div>
              {panel === 'moves' ? <><div className={`moves-body ${movesOpen ? '' : 'collapsed'}`} ref={moveList}>{shownGame.moves.length ? <div className="move-table">{Array.from({length:Math.ceil((shownGame.moves.length+initialPlyOffset)/2)},(_,i)=><div className="move-row" key={i}><span className="move-number">{firstMoveNumber+i}.</span>{[0,1].map(offset=>{const ply = i*2+offset-initialPlyOffset;const move=shownGame.moves[ply];const before=evaluations[ply];const after=evaluations[ply+1];const quality=move&&before&&after ? classifyMove((before.evaluation-after.evaluation)*(move.color==='w'?1:-1)):null;return move ? <button key={offset} onClick={()=>navigate(ply+1)} className={`${index === ply+1 ? 'current-move' : ''} ${quality ? `quality-${quality}` : ''}`}><span>{move.san}</span>{quality&&quality!=='good'&&<i title={quality}>{quality==='best'?'★':quality==='inaccuracy'?'?!':quality==='mistake'?'?':'??'}</i>}</button> : <span key={offset}/>;})}</div>)}</div> : <div className="empty-moves"><BookOpen size={27}/><span>Tap or drag a piece to move.</span></div>}</div></> : !reviewAllowed ? <div className="analysis-locked"><ShieldCheck size={30}/><p>Analysis opens when the game ends.</p>{shownGame.mode === 'ai' && shownGame.config.hints && <button className="button button-small" onClick={()=>void askHint()} disabled={thinking||hintBusy||turnOf(shownGame)!==shownGame.humanColor}><Lightbulb size={16}/>Hint</button>}</div> : <div className="analysis-panel"><div className="evaluation-summary"><span>Position evaluation</span><strong>{positionBusy&&!currentEvaluation?<LoaderCircle className="spin" size={22}/>:evalLabel(currentEvaluation)}</strong></div><p className="evaluation-caption">{position.isCheckmate() ? `${position.turn() === 'w' ? 'Black' : 'White'} delivered checkmate.` : position.isStalemate() ? 'No legal moves. The position is stalemate.' : currentEvaluation?.mate !== undefined ? `${currentEvaluation.mate > 0 ? 'White' : 'Black'} has a forced mate.` : currentEvaluation ? Math.abs(currentEvaluation.evaluation) < 40 ? 'The position is balanced.' : `${currentEvaluation.evaluation > 0 ? 'White' : 'Black'} has the advantage.` : 'Evaluating…'}</p>{hasBestMove && <div className="best-line"><span>Best continuation <small>Depth {currentEvaluation.depth}</small></span><p>{variation(shownFen,currentEvaluation.pv)}</p></div>}<button className="button analysis-button" onClick={()=>{ if(analyzing){analysisController.current?.abort();analyst.current?.cancel();setAnalyzing(false);}else void runAnalysis(); }}><Sparkles size={17}/>{analyzing ? 'Stop analysis' : analysisProgress > shownGame.moves.length ? 'Analyse again' : 'Analyse entire game'}{analyzing && <LoaderCircle className="spin" size={15}/>}</button>{analyzing && <div className="analysis-progress"><progress value={analysisProgress} max={shownGame.moves.length+1}/><span>{analysisProgress} / {shownGame.moves.length+1} positions</span></div>}{analysisProgress > 0 && <div className="quality-summary">{(['inaccuracy','mistake','blunder'] as const).map(quality=>{const count=shownGame.moves.filter((move,i)=>evaluations[i]&&evaluations[i+1]&&classifyMove((evaluations[i].evaluation-evaluations[i+1].evaluation)*(move.color==='w'?1:-1))===quality).length;return <div key={quality}><strong>{count}</strong><span>{quality==='inaccuracy'?'Inaccuracies':quality==='mistake'?'Mistakes':'Blunders'}</span></div>;})}</div>}{analysisError&&<p className="inline-error">{analysisError}</p>}</div>}
              <div className="history-controls"><IconButton label="First position" onClick={()=>navigate(0)} disabled={!shownGame.moves.length||index===0}><ChevronsLeft size={19}/></IconButton><IconButton label="Previous move (left arrow)" onClick={()=>navigate(index-1)} disabled={index===0}><ChevronLeft size={21}/></IconButton><span>{index} / {shownGame.moves.length}</span><IconButton label="Next move (right arrow)" onClick={()=>navigate(index+1)} disabled={index===shownGame.moves.length}><ChevronRight size={21}/></IconButton><IconButton label="Current position" onClick={()=>navigate('last')} disabled={index===shownGame.moves.length}><ChevronsRight size={19}/></IconButton></div>
              {shownGame.result ? <div className="end-panel"><div className="result-mini"><Trophy size={19}/><span>{shownGame.result.winner ? `${shownGame.players[shownGame.result.winner]} won` : 'Draw'}<small>{shownGame.result.reason} · {shownGame.result.result}</small></span></div>{shownGame.mode === 'online' && shownGame.rematchBy.length > 0 && <p className="rematch-note">{shownGame.rematchBy.includes(online.room?.you as Color) ? 'Rematch requested. Waiting for your opponent…' : 'Your opponent wants a rematch.'}</p>}<button className="button button-primary" onClick={rematch} disabled={shownGame.mode==='online' && (online.room?.you==='spectator'||online.busy||shownGame.rematchBy.includes(online.room?.you as Color))}><RotateCcw size={17}/>Play again</button><button className="quiet-button export-small" onClick={()=>setDialog('export')}><Download size={15}/>Export game</button></div> : <div className="match-actions">{game?.mode === 'ai' && <div className="assist-actions"><button disabled={!game.config.takebacks||!game.moves.length} onClick={undo}><Undo2 size={17}/>Take back</button><button disabled={!game.config.hints||thinking||hintBusy||turnOf(game)!==game.humanColor||historical} onClick={()=>void askHint()}>{hintBusy?<LoaderCircle className="spin" size={17}/>:<Lightbulb size={17}/>}Hint</button></div>}{game?.mode==='local'&&<button className="local-undo" disabled={!game.moves.length} onClick={()=>{setConsent(false);setDialog('undo');}}><Undo2 size={16}/>Take back a move</button>}{shownGame.drawOffer && <div className="draw-offer">{online.room?.you === 'spectator' ? <p>A draw has been offered. Waiting for a response.</p> : shownGame.drawOffer === online.room?.you ? <p>Draw offered. Waiting for your opponent.</p> : <><p>Your opponent offers a draw.</p><div><button className="button button-small" onClick={()=>void online.send('accept-draw').catch(err=>notify(err.message))}>Accept</button><button className="quiet-button" onClick={()=>void online.send('decline-draw').catch(err=>notify(err.message))}>Decline</button></div></>}</div>}<div className="secondary-game-actions">{game?.mode!=='ai'&&<button disabled={shownGame.moves.length<2||online.room?.you==='spectator'||!!shownGame.drawOffer} onClick={requestDraw}><Handshake size={16}/>Draw</button>}<button disabled={online.room?.you==='spectator'} onClick={()=>prefs.confirmResign?setDialog('resign'):void resign()}><Flag size={15}/>Resign</button><IconButton label="More game actions" onClick={()=>setDialog('actions')}><MoreHorizontal size={20}/></IconButton></div>{myColor!=='spectator'&&(claims.threefold||claims.fiftyMove)&&<button className="claim-available" onClick={()=>{setClaimText('');setDialog('claim');}}>Draw claim available <ArrowRight size={14}/></button>}</div>}
              </>}
              {engineError&&shownGame.mode==='ai'&&!shownGame.result&&<div className="engine-error"><p>The computer stopped.</p><button className="button button-small" onClick={retryEngine}>Retry engine</button><small>{engineError}</small></div>}{online.error&&shownGame.mode==='online'&&<p className="inline-error connection-error">{online.error}</p>}
            </>}
          </aside>
        </div>}
      </main>
    </div>
    {toast&&<div className="toast" role="status"><Check size={16}/><span>{toast}</span><button aria-label="Dismiss notification" onClick={()=>setToast('')}><X size={15}/></button></div>}
    {opponentLeft&&!dialog&&opponentColor&&<Modal title={`${shownGame.players[opponentColor]} left.`} onClose={()=>setOpponentLeft(false)}><div className="modal-buttons"><button className="button" onClick={()=>{setOpponentLeft(false);begin({...config,mode:'ai'});}}><Bot size={16}/>Play computer</button><button className="button button-primary" onClick={()=>{setOpponentLeft(false);returnHome();}}>Back to menu<ArrowRight size={16}/></button></div></Modal>}
    {dialog==='settings'&&<Modal title="Settings" onClose={()=>setDialog(null)} wide><Settings preferences={prefs} onChange={setPrefs}/></Modal>}
    {dialog==='join'&&<Modal title="Join a room" onClose={()=>setDialog(null)}><div className="field"><label htmlFor="join-nickname">Your name</label><input id="join-nickname" autoComplete="nickname" maxLength={24} placeholder="Your nickname" value={config.nickname==='You'?'':config.nickname} onChange={e=>setConfig(previous=>({...previous,nickname:e.target.value||'You'}))}/></div><div className="field"><label htmlFor="join-code">Room code</label><input id="join-code" className="code-input" maxLength={8} autoCapitalize="characters" placeholder="ABCD2345" value={joinCode} onChange={e=>setJoinCode(e.target.value.toUpperCase().replace(/\s/g,''))} onKeyDown={e=>{if(e.key==='Enter')void joinOnline();}}/></div>{joinError&&<p className="inline-error">{joinError}</p>}<button className="button button-primary full-width" disabled={online.busy||joinCode.length!==8} onClick={()=>void joinOnline()}>{online.busy?<LoaderCircle className="spin" size={17}/>:<Users size={17}/>}Join game</button><button className="quiet-button full-width spectate-button" disabled={online.busy||joinCode.length!==8} onClick={()=>void joinOnline(true)}>Watch</button></Modal>}
    {dialog==='help'&&<Modal title="How to play" onClose={()=>setDialog(null)} wide><div className="help-content"><h3>Moving</h3><p>Tap a piece, then a highlighted square, or drag it. When a pawn reaches the last rank, pick its new piece.</p><h3>Modes</h3><p>Computer: seven levels; the numbers are rough strength, not ratings. Local: two players on one screen. Online: create a room and send the link or code.</p><div className="desktop-help"><h3>Shortcuts</h3><div className="shortcut-grid"><span>Flip the board<kbd>F</kbd></span><span>Sound on/off<kbd>M</kbd></span><span>Step through moves<kbd>← →</kbd></span><span>Cancel selection<kbd>Esc</kbd></span></div><p>Right-drag draws an arrow. Right-click marks a square.</p></div><p className="touch-help">Use the pencil button to draw arrows and mark squares.</p><h3>Draws and time</h3><p>Claim threefold repetition or the fifty-move rule from the game menu. Fivefold repetition and 75 moves end the game as a draw. Clocks keep running in a hidden tab and when a player is offline.</p><h3>Saved games</h3><p>Settings and finished games stay in this browser. Online seats come back after a refresh in the same tab. Rooms expire after 30 days.</p><p className="help-licenses">{RULES_SCOPE}</p><p className="help-licenses">Licenses: <a href="/engine/NOTICE.md" target="_blank" rel="noreferrer">Stockfish (GPL)</a> · <a href="/pieces/NOTICE.md" target="_blank" rel="noreferrer">pieces</a> · <a href="https://github.com/jhlywa/chess.js" target="_blank" rel="noreferrer">chess.js</a></p></div></Modal>}
    {dialog==='export'&&game&&<Modal title="Export" onClose={()=>setDialog(null)} wide><label className="field-label" htmlFor="export-pgn">PGN game</label><textarea id="export-pgn" className="notation-input" readOnly value={gamePgn(game)} rows={9}/><div className="modal-buttons"><button className="button button-primary" onClick={download}><Download size={17}/>Download PGN</button><button className="button" onClick={()=>void copy(gamePgn(game),'PGN copied')}><Clipboard size={16}/>Copy PGN</button></div><label className="field-label" htmlFor="export-fen">Current board position (FEN)</label><div className="share-link"><input id="export-fen" readOnly value={shownFen}/><IconButton label="Copy FEN" onClick={()=>void copy(shownFen,'FEN copied')}><Clipboard size={17}/></IconButton></div></Modal>}
    {dialog==='import'&&<Modal title="Import" onClose={()=>setDialog(null)} wide><p className="modal-intro">Paste a PGN game to review, or a FEN position to play locally.</p><textarea className="notation-input" aria-label="PGN game or FEN position" rows={10} value={importText} onChange={e=>setImportText(e.target.value)} placeholder={'[Event "A great game"]\n[White "You"]\n[Black "A friend"]\n\n1. e4 e5 2. Nf3 Nc6'}/>{importError&&<p className="inline-error">{importError}</p>}<div className="modal-buttons"><label className="button upload-file"><Upload size={16}/>Choose PGN file<input type="file" accept=".pgn,.fen,.txt" onChange={async e=>{const file=e.target.files?.[0];if(file){if(file.size>250000){setImportError('Choose a file smaller than 250 KB.');return;}setImportText(await file.text());}}}/></label><button className="button button-primary" onClick={doImport} disabled={!importText.trim()}>Open game <ArrowRight size={17}/></button></div></Modal>}
    {dialog==='result'&&game?.result&&<Modal title={game.result.winner ? game.mode==='ai' ? game.result.winner===game.humanColor ? 'You won.' : 'You lost.' : `${game.players[game.result.winner]} wins.` : 'Draw.'} onClose={()=>setDialog(null)}><div className={`result-content ${game.result.winner===game.humanColor?'result-win':''}`}><div className="result-medallion">{game.result.winner ? <Trophy size={36}/> : <Handshake size={36}/>}</div><div className="result-score">{game.result.result}</div><p>{game.result.reason}</p><div className="result-stats"><div><strong>{Math.ceil(game.moves.length/2)}</strong><span>moves</span></div><div><strong>{Math.floor(((game.finishedAt??Date.now())-game.startedAt)/60000)}:{String(Math.floor(((game.finishedAt??Date.now())-game.startedAt)/1000)%60).padStart(2,'0')}</strong><span>duration</span></div></div><button className="button button-primary full-width" onClick={rematch} disabled={game.mode==='online'&&online.room?.you==='spectator'}><RotateCcw size={17}/>Play again</button><div className="modal-buttons"><button className="button" onClick={reviewGame}><Sparkles size={16}/>Review game</button><button className="button" onClick={returnHome}><Plus size={16}/>New game</button></div></div></Modal>}
    {dialog==='resign'&&<Modal title="Resign?" onClose={()=>setDialog(null)}><div className="modal-buttons"><button className="button" onClick={()=>setDialog(null)}>Keep playing</button><button className="button button-danger" onClick={()=>void resign()}><Flag size={16}/>Resign</button></div></Modal>}
    {dialog==='draw'&&game&&<Modal title="Agree to a draw?" onClose={()=>setDialog(null)}><p className="modal-intro">{consent?'Black, do you agree to end the game as a draw?':'White, do you agree to end the game as a draw?'}</p><div className="modal-buttons"><button className="button" onClick={()=>setDialog(null)}>Keep playing</button><button className="button button-primary" onClick={()=>{if(!consent)setConsent(true);else{setGame(endGame(game,{winner:null,result:'1/2-1/2',reason:'Draw by agreement'}));setDialog(null);}}}>{consent?'Black agrees':'White agrees'}</button></div></Modal>}
    {dialog==='undo'&&<Modal title="Take that move back?" onClose={()=>setDialog(null)}><p className="modal-intro">{consent?'Black, do you agree to undo the last move?':'White, do you agree to undo the last move?'} The clock returns to the time just before that move.</p><div className="modal-buttons"><button className="button" onClick={()=>setDialog(null)}>Keep playing</button><button className="button button-primary" onClick={()=>{if(!consent)setConsent(true);else undo();}}>{consent?'Black agrees':'White agrees'}</button></div></Modal>}
    {dialog==='leave'&&<Modal title="Leave this game?" onClose={()=>setDialog(null)}><p className="modal-intro">{game?.mode==='online'?'Your online game and its clock will continue. You can return using the room link in this tab.':'Your game is saved on this device. Timed games continue counting down.'}</p><div className="modal-buttons"><button className="button" onClick={()=>setDialog(null)}>Keep playing</button><button className="button button-primary" onClick={returnHome}>Leave</button></div></Modal>}
    {dialog==='actions'&&<Modal title="Game actions" onClose={()=>setDialog(null)}><div className="action-menu"><button onClick={()=>{setFlipped(value=>!value);setDialog(null);}}><ArrowDownUp size={20}/>Flip board<kbd className="desktop-kbd">F</kbd></button><button onClick={()=>setDialog('settings')}><Settings2 size={20}/>Board & sound settings<ChevronRight size={16}/></button>{game&&<><button onClick={()=>setDialog('export')}><Download size={20}/>Export PGN / FEN<ChevronRight size={16}/></button>{!game.result&&!game.waiting&&myColor!=='spectator'&&<><button onClick={()=>{setClaimText('');setDialog('claim');}}><Handshake size={20}/>Claim a draw<ChevronRight size={16}/></button><button onClick={()=>setDialog('resign')}><Flag size={20}/>Resign game<ChevronRight size={16}/></button></>}</>}<button onClick={newGameClick}><Plus size={20}/>New game<ChevronRight size={16}/></button></div></Modal>}
    {dialog==='claim'&&<Modal title="Claim a draw" onClose={()=>setDialog(null)}><p className="modal-intro">Claim on your turn when the same position has appeared three times, or after 50 moves by each side without a capture or pawn move.</p><div className="field"><label htmlFor="claim-move">Intended move (optional)</label><input id="claim-move" placeholder="e.g. Nf3" value={claimText} onChange={e=>setClaimText(e.target.value)}/><small>Use this if your next move would create the qualifying position. The move will not be played.</small></div><div className="claim-buttons"><button className="button" onClick={()=>void performClaim('threefold')}>Threefold repetition</button><button className="button" onClick={()=>void performClaim('fifty')}>Fifty-move rule</button></div></Modal>}
  </div>;
}
