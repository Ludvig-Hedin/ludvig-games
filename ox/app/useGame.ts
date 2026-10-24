"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createMatch, applyMove, nextRound, restartMatch, type MatchState } from "../lib/match.js";
import { playSound, unlockAudio } from "../lib/sound";

export type Symbol = "X" | "O";
export type Mode = "computer" | "local" | "online";
export type Difficulty = "easy" | "medium" | "hard" | "impossible";
export type Preferences = { size: number; length: number; difficulty: Difficulty; mark: Symbol; sound: boolean; theme: "light" | "dark" | "system" };
export type Room = { code: string; state: MatchState; revision: number; matchNumber: number; joined: boolean; ready: { X: boolean; O: boolean }; closed: boolean; expiresAt: number; opponentSeenAt: number | null };
type Session = { code: string; token: string; role: Symbol };
type RecordStats = { rounds: number; wins: number; losses: number; draws: number; moves: number; streak: number; best: number };
type Statistics = { computer: RecordStats; local: RecordStats; online: RecordStats; seen: string[] };
type ApiData = { room?: Room; code?: string; token?: string; role?: Symbol; error?: string };
const DEFAULTS: Preferences = { size: 3, length: 3, difficulty: "medium", mark: "X", sound: true, theme: "system" };
const emptyRecord = (): RecordStats => ({ rounds: 0, wins: 0, losses: 0, draws: 0, moves: 0, streak: 0, best: 0 });
const emptyStats = (): Statistics => ({ computer: emptyRecord(), local: emptyRecord(), online: emptyRecord(), seen: [] });
export const DIFFICULTIES: Difficulty[] = ["easy", "medium", "hard", "impossible"];
export const other = (mark: Symbol): Symbol => mark === "X" ? "O" : "X";
export const capitalize = (value: string) => value[0].toUpperCase() + value.slice(1);
function read<T>(key: string, fallback: T): T { try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch { return fallback; } }
function save(key: string, value: unknown) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Storage is optional. */ } }
function remove(key: string) { try { localStorage.removeItem(key); } catch { /* Storage is optional. */ } }
function cleanPrefs(value: Partial<Preferences>): Preferences {
  return { size: [3, 4, 5].includes(value?.size ?? 0) ? value.size! : 3, length: [0, 3, 5, 7].includes(value?.length ?? -1) ? value.length! : 3, difficulty: DIFFICULTIES.includes(value?.difficulty as Difficulty) ? value.difficulty! : "medium", mark: value?.mark === "O" ? "O" : "X", sound: value?.sound !== false, theme: ["light", "dark", "system"].includes(value?.theme ?? "") ? value.theme! : "system" };
}
function savedSession(code: string): Session | null { const value = read<Session | null>(`ox.room.${code}`, null); return value?.code === code && typeof value.token === "string" && ["X", "O"].includes(value.role) ? value : null; }
class RequestError extends Error {
  constructor(public data: ApiData, public status: number) { super(data.error || "Couldn't connect. Try again."); }
}
async function api(path: string, options: { method?: string; token?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<ApiData> {
  let response: Response;
  try { response = await fetch(`/api/rooms${path}`, { method: options.method ?? "GET", cache: "no-store", headers: { ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}), ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}) }, ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}), signal: options.signal ?? AbortSignal.timeout(10000) }); }
  catch (error) { if (options.signal?.aborted) throw error; throw new Error("Couldn't connect. Try again."); }
  let data: ApiData;
  // 429, 503 or Cloudflare's 1027 daily-limit page carry no JSON: show the busy message.
  try { data = await response.json(); } catch { if (response.status === 429 || response.status === 503) throw new RequestError({ error: "Online play is temporarily unavailable. Try again shortly." }, response.status); throw new Error("Connection interrupted. Try again."); }
  if (!response.ok) throw new RequestError(data, response.status);
  return data;
}

export function useGame() {
  const [preferences, setPreferences] = useState<Preferences>(DEFAULTS);
  const [draft, setDraft] = useState<Preferences>(DEFAULTS);
  const [screen, setScreen] = useState<"home" | "game">("home");
  const [mode, setMode] = useState<Mode>("computer");
  const [match, setMatch] = useState<MatchState>(() => createMatch());
  const [sheet, setSheet] = useState<"settings" | "friend" | "stats" | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const [connection, setConnection] = useState<"connecting" | "online" | "reconnecting" | "ended">("connecting");
  const [busy, setBusy] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [code, setCode] = useState("");
  const [invited, setInvited] = useState(false);
  const [friendError, setFriendError] = useState("");
  const [notice, setNotice] = useState("");
  const [copied, setCopied] = useState(false);
  const [statistics, setStatistics] = useState<Statistics>(emptyStats);
  const [statsMode, setStatsMode] = useState<Mode>("computer");
  const [lastRoom, setLastRoom] = useState("");
  const [resolvedDark, setResolvedDark] = useState(false);
  const [localId, setLocalId] = useState("initial");
  const [hydrated, setHydrated] = useState(false);
  const statsRef = useRef(statistics);
  const currentSession = useRef<Session | null>(null);
  const audioSnapshot = useRef("");
  const pendingMove = useRef(false);
  const navigationEpoch = useRef(0);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const roomRef = useRef<Room | null>(null);
  const repoll = useRef<() => void>(() => {});
  const game = mode === "online" && room ? room.state : match;
  const yourMark = mode === "online" ? session?.role ?? "X" : preferences.mark;
  const finished = !!game.winner || game.draw;
  const connected = mode !== "online" || connection === "online";
  const isWaiting = mode === "online" && (!room?.joined || room.closed);
  const canPlay = screen === "game" && !finished && !resetting && !busy && connected && !isWaiting && (mode === "local" || game.turn === yourMark);

  useEffect(() => {
    const prefs = cleanPrefs(read("ox.preferences.v1", DEFAULTS)); setPreferences(prefs); setDraft(prefs);
    const stored = read<Statistics>("ox.statistics.v1", emptyStats());
    const valid = { ...emptyStats(), ...stored, seen: Array.isArray(stored?.seen) ? stored.seen : [] }; statsRef.current = valid; setStatistics(valid);
    const recent = read<string>("ox.lastRoom", ""); if (recent && savedSession(recent)) setLastRoom(recent);
    const invitedCode = new URLSearchParams(location.search).get("room")?.replace(/[^a-z0-9]/gi, "").toUpperCase();
    if (invitedCode) { setCode(invitedCode); setInvited(true); const saved = savedSession(invitedCode); if (saved) { currentSession.current = saved; setSession(saved); setMode("online"); setScreen("game"); } else setSheet("friend"); }
    setHydrated(true);
    return () => { if (resetTimer.current) clearTimeout(resetTimer.current); };
  }, []);
  useEffect(() => {
    if (!hydrated) return;
    save("ox.preferences.v1", preferences); const query = matchMedia("(prefers-color-scheme: dark)");
    const update = () => { const dark = preferences.theme === "dark" || preferences.theme === "system" && query.matches; setResolvedDark(dark); document.documentElement.dataset.theme = dark ? "dark" : "light"; document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#1e201e" : "#f6f5f1"); };
    update(); query.addEventListener("change", update); return () => query.removeEventListener("change", update);
  }, [preferences, hydrated]);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(""), 4000); return () => clearTimeout(timer); }, [notice]);
  const syncRoom = useCallback((incoming: Room) => { if (currentSession.current?.code !== incoming.code) return; if (!roomRef.current || roomRef.current.code !== incoming.code || incoming.revision >= roomRef.current.revision) roomRef.current = incoming; setRoom(previous => !previous || previous.code !== incoming.code || incoming.revision >= previous.revision ? incoming : previous); }, []);
  useEffect(() => {
    if (!session || screen !== "game" || mode !== "online") return;
    let stopped = false, inFlight = false, errors = 0; let timer: ReturnType<typeof setTimeout>; let controller: AbortController | null = null;
    currentSession.current = session; setConnection("connecting");
    // Free-plan budget: at most one request per 1.5 s, slower on your own turn,
    // nothing while the tab is hidden, and stop once the room is closed.
    const delay = () => { const r = roomRef.current; if (errors) return Math.min(8000, 1500 * 2 ** errors); if (r && r.joined && !r.closed && !r.state.winner && !r.state.draw && r.state.turn === session.role) return 4000; return 1500; };
    const schedule = () => { clearTimeout(timer); if (stopped || document.hidden || roomRef.current?.closed) return; timer = setTimeout(poll, delay()); };
    repoll.current = () => { if (!inFlight) schedule(); };
    const poll = async () => {
      if (stopped || inFlight) return; inFlight = true; controller = new AbortController(); const activeController = controller; const timeout = setTimeout(() => activeController.abort(), 9000);
      try { const data = await api(`/${session.code}`, { token: session.token, signal: controller.signal }); if (stopped) return; if (data.room) { syncRoom(data.room); setConnection(data.room.closed ? "ended" : "online"); if (data.room.closed) stopped = true; } errors = 0; }
      catch (error) { if (stopped) return; if (error instanceof RequestError && [401, 403, 404, 410].includes(error.status)) { setConnection("ended"); setNotice(error.message); remove(`ox.room.${session.code}`); if (read("ox.lastRoom", "") === session.code) remove("ox.lastRoom"); setLastRoom(""); stopped = true; return; } errors++; setConnection("reconnecting"); }
      finally { clearTimeout(timeout); inFlight = false; schedule(); }
    };
    const resume = () => { if (document.hidden) { clearTimeout(timer); return; } if (!inFlight && !stopped) { clearTimeout(timer); void poll(); } }; void poll(); window.addEventListener("online", resume); document.addEventListener("visibilitychange", resume);
    return () => { stopped = true; clearTimeout(timer); controller?.abort(); window.removeEventListener("online", resume); document.removeEventListener("visibilitychange", resume); };
  }, [session, screen, mode, syncRoom]);
  useEffect(() => {
    if (screen !== "game" || mode !== "computer" || match.winner || match.draw || match.turn === preferences.mark || resetting) { setThinking(false); return; }
    let active = true, accepted = false; let timer: ReturnType<typeof setTimeout>; let worker: Worker | null = null; setThinking(true);
    const started = performance.now(); const id = `${localId}-${match.round}-${match.moves}`;
    const accept = (move: number) => { if (accepted || move < 0 || match.board[move] !== null) return; accepted = true; timer = setTimeout(() => { if (!active) return; setMatch(current => current === match ? applyMove(current, move) : current); setThinking(false); }, Math.max(0, 260 - (performance.now() - started))); };
    const fallback = async () => { const { chooseMove } = await import("../public/engine.js"); if (active) accept(chooseMove(match.board, match.size, match.turn, preferences.difficulty)); };
    try { worker = new Worker("/ai-worker.js", { type: "module" }); worker.onmessage = (event: MessageEvent<{ id: string; move: number; error?: string }>) => { if (event.data.id !== id || !active) return; if (event.data.error) void fallback(); else accept(event.data.move); }; worker.onerror = () => { worker?.terminate(); void fallback(); }; worker.postMessage({ id, board: match.board, size: match.size, mark: match.turn, difficulty: preferences.difficulty }); } catch { void fallback(); }
    return () => { active = false; worker?.terminate(); clearTimeout(timer); };
  }, [screen, mode, match, preferences.mark, preferences.difficulty, resetting, localId]);
  const boardSignature = game.board.join("-");
  useEffect(() => {
    const signature = `${localId}:${mode}:${game.round}:${boardSignature}`; if (screen !== "game" || signature === audioSnapshot.current) return;
    const hadSnapshot = !!audioSnapshot.current; audioSnapshot.current = signature;
    if (game.lastMove !== null && game.moves > 0 && hadSnapshot) playSound(game.board[game.lastMove] as Symbol, preferences.sound);
    if (finished) { const timer = setTimeout(() => playSound(game.draw ? "draw" : "win", preferences.sound), 160); return () => clearTimeout(timer); }
  }, [screen, mode, boardSignature, game.round, finished, preferences.sound, localId]);
  useEffect(() => {
    if (screen !== "game" || !finished || !hydrated) return;
    const key = mode === "online" ? `${room?.code}:${room?.matchNumber}:${game.round}` : `${localId}:${game.round}`; if (statsRef.current.seen.includes(key)) return;
    const old = statsRef.current[mode] ?? emptyRecord(); const win = game.winner === (mode === "local" ? "X" : yourMark); const loss = !!game.winner && !win; const streak = win ? old.streak + 1 : 0;
    const next = { ...statsRef.current, [mode]: { rounds: old.rounds + 1, wins: old.wins + Number(win), losses: old.losses + Number(loss), draws: old.draws + Number(game.draw), moves: old.moves + game.moves, streak, best: Math.max(old.best, streak) }, seen: [...statsRef.current.seen.slice(-299), key] };
    statsRef.current = next; setStatistics(next); save("ox.statistics.v1", next);
  }, [finished, screen, mode, room?.code, room?.matchNumber, game.round, game.winner, game.draw, game.moves, localId, yourMark, hydrated]);

  const tap = () => { unlockAudio(); playSound("tap", preferences.sound); };
  const openSettings = () => { tap(); setDraft(mode === "online" && room && screen === "game" ? { ...preferences, size: room.state.size, length: room.state.matchLength } : preferences); setSheet("settings"); };
  const cancelReset = () => { if (resetTimer.current) clearTimeout(resetTimer.current); setResetting(false); };
  const startGame = (nextMode: "computer" | "local", prefs = preferences) => { tap(); navigationEpoch.current++; pendingMove.current = false; cancelReset(); setMode(nextMode); setSession(null); currentSession.current = null; setRoom(null); setMatch(createMatch({ size: prefs.size, length: prefs.length })); setLocalId(crypto.randomUUID()); setScreen("game"); setSheet(null); setBusy(false); setNotice(""); audioSnapshot.current = ""; history.replaceState(null, "", location.pathname); };
  const goHome = () => { if (screen === "game" && sheet === null && (mode === "online" ? connection !== "ended" : game.moves > 0 && !finished) && !window.confirm("Leave this game?")) return; tap(); navigationEpoch.current++; pendingMove.current = false; cancelReset(); setScreen("home"); setSheet(null); setBusy(false); setInvited(false); setNotice(""); history.replaceState(null, "", location.pathname); };
  const openFriend = () => { tap(); setCode(""); setInvited(false); setFriendError(""); setSheet("friend"); };
  const acceptSession = (data: ApiData, expectedEpoch: number) => {
    if (!data.code || !data.token || !data.role || !data.room) throw new Error("Couldn't open the room. Try again.");
    const next: Session = { code: data.code, token: data.token, role: data.role };
    // Keep a newly issued room credential recoverable even if navigation won the race.
    save(`ox.room.${next.code}`, next);
    if (expectedEpoch !== navigationEpoch.current) { if (!currentSession.current) save("ox.lastRoom", next.code); return; }
    navigationEpoch.current++; pendingMove.current = false; setBusy(false);
    cancelReset(); save("ox.lastRoom", next.code); setLastRoom(next.code); currentSession.current = next; setSession(next); setRoom(data.room); setMode("online"); setScreen("game"); setConnection("online"); setSheet(null); audioSnapshot.current = ""; setNotice(""); history.replaceState(null, "", `?room=${next.code}`);
  };
  const createRoom = async () => { if (busy) return; const epoch = navigationEpoch.current; tap(); setBusy(true); setFriendError(""); try { acceptSession(await api("", { method: "POST", body: { size: preferences.size, length: preferences.length } }), epoch); } catch (error) { if (epoch === navigationEpoch.current) setFriendError(error instanceof Error ? error.message : "Couldn't create a room."); } finally { if (epoch === navigationEpoch.current) setBusy(false); } };
  const joinRoom = async (rawCode = code) => {
    if (busy) return; const roomCode = rawCode.trim().toUpperCase(); if (!/^[A-Z0-9]{8}$/.test(roomCode)) { setFriendError("Enter the 8-character room code."); return; }
    const epoch = navigationEpoch.current; tap(); setBusy(true); setFriendError("");
    try { const saved = savedSession(roomCode); if (saved) acceptSession({ ...await api(`/${roomCode}`, { token: saved.token }), ...saved }, epoch); else acceptSession(await api(`/${roomCode}/join`, { method: "POST", body: {} }), epoch); }
    catch (error) {
      if (epoch !== navigationEpoch.current) return;
      const message = error instanceof Error ? error.message : "Couldn't join. Check the code."; setFriendError(message); if (sheet !== "friend") setNotice(message);
      if (error instanceof RequestError && [401, 403, 404, 410].includes(error.status)) { remove(`ox.room.${roomCode}`); if (read("ox.lastRoom", "") === roomCode) remove("ox.lastRoom"); setLastRoom(current => current === roomCode ? "" : current); }
    }
    finally { if (epoch === navigationEpoch.current) setBusy(false); }
  };
  const move = async (index: number) => {
    if (!canPlay || game.board[index] !== null || pendingMove.current) return; unlockAudio();
    if (mode !== "online") { setMatch(current => !current.board[index] && !current.winner && !current.draw && (mode === "local" || current.turn === preferences.mark) ? applyMove(current, index) : current); return; }
    if (!session || !room) return; const epoch = navigationEpoch.current; pendingMove.current = true; setBusy(true);
    try { const data = await api(`/${session.code}/move`, { method: "POST", token: session.token, body: { index, revision: room.revision } }); if (epoch === navigationEpoch.current && data.room) { syncRoom(data.room); repoll.current(); } }
    catch (error) { if (epoch !== navigationEpoch.current) return; if (error instanceof RequestError && error.data.room) syncRoom(error.data.room); else setConnection("reconnecting"); setNotice(error instanceof Error ? error.message : "Couldn't place that move."); }
    finally { if (epoch === navigationEpoch.current) { pendingMove.current = false; setBusy(false); } }
  };
  const rematch = async () => {
    if (busy || resetting) return; unlockAudio(); playSound("rematch", preferences.sound);
    if (mode === "online") {
      if (!session || !room || room.ready[session.role]) return; const epoch = navigationEpoch.current; setBusy(true);
      try { const data = await api(`/${session.code}/rematch`, { method: "POST", token: session.token, body: { matchNumber: room.matchNumber, round: room.state.round } }); if (epoch === navigationEpoch.current && data.room) syncRoom(data.room); }
      catch (error) { if (epoch !== navigationEpoch.current) return; if (error instanceof RequestError && error.data.room) syncRoom(error.data.room); setNotice(error instanceof Error ? error.message : "Couldn't start the next round."); }
      finally { if (epoch === navigationEpoch.current) setBusy(false); }
    } else {
      setResetting(true); const restart = !!game.matchWinner || !finished;
      resetTimer.current = setTimeout(() => { setMatch(current => restart ? restartMatch(current) : nextRound(current)); if (restart) setLocalId(crypto.randomUUID()); setResetting(false); }, 150);
    }
  };
  const copyInvite = async () => { if (!room) return; tap(); try { await navigator.clipboard.writeText(`${location.origin}/?room=${room.code}`); setCopied(true); setTimeout(() => setCopied(false), 2200); } catch { setNotice(`Room code: ${room.code}`); } };
  const settingsChanged = screen === "game" && mode !== "online" && (draft.size !== game.size || draft.length !== game.matchLength || mode === "computer" && (draft.mark !== preferences.mark || draft.difficulty !== preferences.difficulty));
  const applySettings = () => { tap(); setPreferences(draft); setSheet(null); if (settingsChanged) startGame(mode, draft); };
  const quitRoom = async () => {
    if (!session || busy) return; const epoch = navigationEpoch.current; setBusy(true);
    try {
      await api(`/${session.code}/leave`, { method: "POST", token: session.token, body: {} }); remove(`ox.room.${session.code}`); if (read("ox.lastRoom", "") === session.code) remove("ox.lastRoom");
      if (epoch !== navigationEpoch.current) return;
      setLastRoom(""); setSession(null); setRoom(null); currentSession.current = null; goHome();
    } catch (error) { if (epoch === navigationEpoch.current) setNotice(error instanceof Error ? error.message : "Couldn't leave. Try again."); }
    finally { if (epoch === navigationEpoch.current) setBusy(false); }
  };
  const toggleSound = () => { unlockAudio(); if (!preferences.sound) playSound("tap"); setPreferences(p => ({ ...p, sound: !p.sound })); };
  const toggleTheme = () => { tap(); setPreferences(p => ({ ...p, theme: resolvedDark ? "light" : "dark" })); };
  const openStats = () => { tap(); setStatsMode(screen === "game" ? mode : "computer"); setSheet("stats"); };
  const nameFor = (mark: Symbol) => mode === "local" ? `Player ${mark}` : mark === yourMark ? "You" : mode === "computer" ? "Computer" : "Friend";
  const title = mode === "online" && connection === "ended" ? "Room closed." : mode === "online" && connection === "connecting" ? "Connecting…" : mode === "online" && connection === "reconnecting" ? "Reconnecting…" : isWaiting ? "Waiting for a friend" : game.matchWinner ? mode === "local" ? `${game.matchWinner} wins the match.` : game.matchWinner === yourMark ? "Match is yours." : "Well played." : game.winner ? mode === "local" ? `${game.winner} takes it.` : game.winner === yourMark ? "Nice move." : "They got this one." : game.draw ? "A perfect draw." : mode === "local" ? `${game.turn}’s move.` : game.turn === yourMark ? "Your move." : mode === "online" ? "Their move." : "Thinking";
  const subtitle = mode === "online" && connection === "ended" ? "Start a new room for another game." : mode === "online" && connection !== "online" ? "Your game is saved." : isWaiting ? "Share the link. Your friend plays O." : game.matchWinner ? `${nameFor(game.matchWinner)} won ${game.scores[game.matchWinner]}–${game.scores[other(game.matchWinner)]}.` : game.winner ? `${nameFor(game.winner)} ${game.winner === yourMark && mode !== "local" ? "take" : "takes"} round ${game.round}.` : game.draw ? "It's a draw." : mode === "online" && room && Date.now() - (room.opponentSeenAt ?? Date.now()) > 35000 && room.joined ? "Your friend is reconnecting." : `${game.winLength} in a row${game.size > 3 ? " wins" : ""}`;
  const onlineReady = mode === "online" && !!room && !!session && room.ready[session.role];
  return { preferences, draft, setDraft, screen, mode, game, sheet, setSheet, room, session, connection, busy, thinking, resetting, code, setCode, invited, friendError, setFriendError, notice, copied, statistics, statsMode, setStatsMode, lastRoom, resolvedDark, localId, yourMark, finished, isWaiting, canPlay, settingsChanged, title, subtitle, onlineReady, nameFor, tap, openSettings, startGame, goHome, openFriend, createRoom, joinRoom, move, rematch, copyInvite, applySettings, quitRoom, toggleSound, toggleTheme, openStats };
}
