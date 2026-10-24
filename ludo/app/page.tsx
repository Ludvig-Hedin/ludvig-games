"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, ChevronRight, Copy, Dice5, Flag, Globe2, HelpCircle, House, Link2, LoaderCircle, Maximize2, Minimize2, Plus, RotateCcw, Settings2, Sparkles, Trophy, Users, Volume2, VolumeX, X, Zap } from "lucide-react";
import Board from "../components/Board";
import { createGame, applyRoll, applyMove, chooseMove, fairDie } from "../lib/engine.js";
import { audio } from "../lib/audio";
type Mode = "solo" | "local" | "online";
type Screen = "setup" | "game" | "lobby";
type Modal = null | "rules" | "settings" | "leave";
type Rules = { mode: "classic" | "quick"; safeSquares: boolean; threeSixes: boolean };
type Session = { code: string; token: string; playerId: string };
const PALETTE = ["#e9715e", "#54977c", "#e7b84e", "#6a8cc9"];
const BOT_NAMES = ["Cleo", "Otto", "Sunny"];
const DEFAULT_RULES: Rules = { mode: "classic", safeSquares: true, threeSixes: true };
const DIFFICULTIES = ["easy", "medium", "hard", "expert"] as const;
const EMPTY_PREVIEW = { players: [3, 0, 1, 2].map((color, i) => ({ id: `preview-${i}`, name: i ? BOT_NAMES[i - 1] : "You", color, type: i ? "ai" : "human", pieces: [-1, -1, -1, -1] })), current: 0, phase: "roll", legal: [], rules: DEFAULT_RULES };
const PIPS: Record<number, number[]> = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
function Face({ color, kind = 0, small = false }: { color: number; kind?: number; small?: boolean }) {
  return <span className={`avatar ${small ? "avatar-small" : ""}`} style={{ "--seat": PALETTE[color] } as React.CSSProperties} aria-hidden="true"><svg viewBox="0 0 44 44"><path d={kind % 3 === 1 ? "M12 19 Q22 5 32 19" : "M12 16 Q17 9 22 14 Q28 8 33 16"} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><circle cx="16" cy="23" r="1.7" fill="currentColor"/><circle cx="28" cy="23" r="1.7" fill="currentColor"/><path d={kind % 3 === 2 ? "M18 30 L26 30" : "M17 29 Q22 35 27 29"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none"/></svg></span>;
}
function Dice({ value = 5, rolling = false, large = false }: { value?: number; rolling?: boolean; large?: boolean }) {
  return <span className={`die ${large ? "die-large" : ""} ${rolling ? "die-rolling" : ""}`} aria-hidden="true">{Array.from({ length: 9 }, (_, i) => <i key={i} className={(PIPS[value] || PIPS[5]).includes(i) ? "pip on" : "pip"}/>)}</span>;
}
function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (value: boolean) => void; label: string; hint?: string }) {
  return <label className="toggle-row"><span><b>{label}</b>{hint && <small>{hint}</small>}</span><button type="button" className={`switch ${checked ? "on" : ""}`} role="switch" aria-label={label} aria-checked={checked} onClick={() => onChange(!checked)}><span/></button></label>;
}
export default function Ludo() {
  const [screen, setScreen] = useState<Screen>("setup"), [mode, setMode] = useState<Mode>("solo");
  const [difficulty, setDifficulty] = useState("medium"), [opponents, setOpponents] = useState(3);
  const [humans, setHumans] = useState(2), [totalSeats, setTotalSeats] = useState(4);
  const [name, setName] = useState(""), [names, setNames] = useState(["", "", "", ""]);
  const [rules, setRules] = useState<Rules>(DEFAULT_RULES), [game, setGame] = useState<any>(null), [resume, setResume] = useState<any>(null);
  const [modal, setModal] = useState<Modal>(null), [sound, setSound] = useState(true), [music, setMusic] = useState(false);
  const [fast, setFast] = useState(false), [reduced, setReduced] = useState(false), [full, setFull] = useState(false), [canFullscreen, setCanFullscreen] = useState(false);
  const [rolling, setRolling] = useState(false), [visualFace, setVisualFace] = useState(5), [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(""), [error, setError] = useState("");
  const [onlineTab, setOnlineTab] = useState<"create" | "join">("create"), [code, setCode] = useState("");
  const [room, setRoom] = useState<any>(null), [session, setSession] = useState<Session | null>(null);
  const [connection, setConnection] = useState<"connected" | "reconnecting">("connected");
  const [fillAI, setFillAI] = useState(true), [wins, setWins] = useState(0);
  const gameRef = useRef<any>(game), roomRef = useRef<any>(room), sessionRef = useRef<Session | null>(session);
  const busyRef = useRef(false), epoch = useRef(0), lastSound = useRef(""), winRecorded = useRef(false), modalRef = useRef<HTMLDivElement>(null);
  gameRef.current = game; roomRef.current = room; sessionRef.current = session;
  const notify = useCallback((message: string) => setToast(message), []);
  useEffect(() => { setCanFullscreen(!!document.fullscreenEnabled && typeof document.documentElement.requestFullscreen === "function"); const update = () => setFull(!!document.fullscreenElement); document.addEventListener("fullscreenchange", update); return () => document.removeEventListener("fullscreenchange", update); }, []);
  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(""), 3300); return () => clearTimeout(t); } }, [toast]);
  useEffect(() => {
    try {
      const prefs = JSON.parse(localStorage.getItem("ludo-prefs") || "{}");
      if (typeof prefs.sound === "boolean") { setSound(prefs.sound); audio.setSound(prefs.sound); }
      if (typeof prefs.fast === "boolean") setFast(prefs.fast);
      if (prefs.name) setName(prefs.name);
      setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
      setWins(Number(localStorage.getItem("ludo-wins") || 0));
      const saved = JSON.parse(localStorage.getItem("ludo-match") || "null");
      if (saved?.game?.players?.length && saved.game.phase !== "finished") setResume(saved);
      const invite = new URLSearchParams(window.location.search).get("room")?.toUpperCase();
      const seats = JSON.parse(localStorage.getItem("ludo-seats") || "{}");
      const last = invite ? seats[invite] : JSON.parse(localStorage.getItem("ludo-session") || "null");
      if (invite) { setMode("online"); setOnlineTab("join"); setCode(invite.slice(0, 6)); }
      if (last?.token) { setSession(last); setMode("online"); setScreen("lobby"); }
    } catch {}
  }, []);
  useEffect(() => { try { localStorage.setItem("ludo-prefs", JSON.stringify({ sound, fast, name })); } catch {} audio.setSound(sound); }, [sound, fast, name]);
  useEffect(() => { audio.setMusic(music); return () => audio.setMusic(false); }, [music]);
  useEffect(() => { if (game && !session && mode !== "online") { try { localStorage.setItem("ludo-match", JSON.stringify({ game, mode })); } catch {} } }, [game, mode, session]);
  const acceptRoom = useCallback((data: any) => {
    if (!data?.room) return;
    const next = data.room;
    if (roomRef.current?.code === next.code && roomRef.current.version > next.version) return;
    const changed = !roomRef.current || roomRef.current.version !== next.version;
    roomRef.current = next; setRoom(next);
    if (next.game && changed) { gameRef.current = next.game; setGame(next.game); }
    if (!next.game) { gameRef.current = null; setGame(null); winRecorded.current = false; }
    setScreen(next.phase === "lobby" ? "lobby" : "game"); setConnection("connected");
  }, []);
  useEffect(() => {
    if (!session) return;
    let alive = true; let inFlight = false; let timeout: ReturnType<typeof setTimeout>; const abort = new AbortController(); let failures = 0;
    const poll = async () => {
      if (inFlight) return; inFlight = true;
      try {
        const response = await fetch(`/api/rooms/${session.code}`, { headers: { Authorization: `Bearer ${session.token}` }, cache: "no-store", signal: abort.signal });
        // Platform error pages (429, 503, daily limit 1027) are HTML, not JSON.
        const data: any = await response.json().catch(() => ({})); if (!alive) return;
        if (!response.ok) {
          if ([401, 403, 404, 410].includes(response.status)) { setError(data.error || "This room is no longer available."); setSession(null); sessionRef.current = null; setRoom(null); roomRef.current = null; setGame(null); gameRef.current = null; setScreen("setup"); try { localStorage.removeItem("ludo-session"); const seats = JSON.parse(localStorage.getItem("ludo-seats") || "{}"); delete seats[session.code]; localStorage.setItem("ludo-seats", JSON.stringify(seats)); } catch {} return; }
          throw new Error(data.error);
        }
        acceptRoom(data); failures = 0;
      } catch { failures = Math.min(failures + 1, 4); if (alive) setConnection("reconnecting"); }
      finally { inFlight = false; }
      // Free-plan budget: at most one poll per 1.5 s, slower after a match, paused while the tab is hidden.
      // While busy or offline, back off: 3 s, 6 s, up to 15 s.
      if (alive && !document.hidden) timeout = setTimeout(poll, failures ? Math.min(15000, 1500 * 2 ** failures) : roomRef.current?.phase === "finished" ? 4000 : 1500);
    };
    const resume = () => { clearTimeout(timeout); if (alive && !document.hidden) poll(); };
    document.addEventListener("visibilitychange", resume); window.addEventListener("online", resume);
    poll(); return () => { alive = false; abort.abort(); clearTimeout(timeout); document.removeEventListener("visibilitychange", resume); window.removeEventListener("online", resume); };
  }, [session, acceptRoom]);
  const roomAction = useCallback(async (action: string, extra: any = {}) => {
    const s = sessionRef.current; if (!s) return; const requestEpoch = epoch.current;
    let response: Response;
    try { response = await fetch(`/api/rooms/${s.code}`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${s.token}` }, body: JSON.stringify({ action, version: roomRef.current?.version, ...extra }) }); } catch { throw new Error("Connection failed. Please try again."); }
    const data: any = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 409 && data.code === "stale_version") {
        const refreshed = await fetch(`/api/rooms/${s.code}`, { headers: { Authorization: `Bearer ${s.token}` }, cache: "no-store" }).catch(() => null);
        const latest: any = refreshed?.ok ? await refreshed.json().catch(() => null) : null;
        if (latest && sessionRef.current?.token === s.token && epoch.current === requestEpoch) acceptRoom(latest);
        throw new Error("The table updated. Please choose your action again.");
      }
      throw new Error(data.error || "That didn't go through. Try again.");
    }
    if (sessionRef.current?.token === s.token && epoch.current === requestEpoch) acceptRoom(data); return data;
  }, [acceptRoom]);
  const roll = useCallback(async () => {
    const state = gameRef.current; if (!state || state.phase !== "roll" || busyRef.current) return;
    if (sessionRef.current && state.players[state.current].id !== sessionRef.current.playerId) return;
    busyRef.current = true; setBusy(true); setRolling(true); setError(""); audio.unlock(); audio.roll();
    const currentEpoch = epoch.current; const die = sessionRef.current ? null : fairDie();
    try {
      if (sessionRef.current) await roomAction("roll");
      await new Promise(resolve => setTimeout(resolve, reduced ? 100 : fast ? 420 : 650));
      if (epoch.current !== currentEpoch) return;
      if (die !== null) setGame(applyRoll(state, die));
    } catch (err: any) { setError(err.message || "Unable to roll. Try again."); }
    finally { if (epoch.current === currentEpoch) { setRolling(false); setBusy(false); busyRef.current = false; } }
  }, [fast, reduced, roomAction]);
  const move = useCallback(async (piece: number) => {
    const state = gameRef.current; if (!state || state.phase !== "move" || busyRef.current || !state.legal.includes(piece)) return;
    if (sessionRef.current && state.players[state.current].id !== sessionRef.current.playerId) return;
    busyRef.current = true; setBusy(true); setError(""); audio.unlock(); const currentEpoch = epoch.current;
    try {
      if (sessionRef.current) await roomAction("move", { piece }); else setGame(applyMove(state, piece));
      await new Promise(resolve => setTimeout(resolve, reduced ? 50 : fast ? 320 : 650));
    } catch (err: any) { setError(err.message || "That piece can't move."); }
    finally { if (epoch.current === currentEpoch) { busyRef.current = false; setBusy(false); } }
  }, [fast, reduced, roomAction]);
  useEffect(() => { if (!rolling) return; let n = 0; const t = setInterval(() => setVisualFace([2,5,3,1,6,4][n++ % 6]), 75); return () => clearInterval(t); }, [rolling]);
  useEffect(() => {
    if (screen !== "game" || session || !game || busy || modal || game.phase === "finished") return;
    const player = game.players[game.current]; if (player.type !== "ai") return;
    const t = setTimeout(() => { if (game.phase === "roll") roll(); else { const chosen = chooseMove(game, player.difficulty); if (chosen !== null) move(chosen); } }, fast ? 360 : 800);
    return () => clearTimeout(t);
  }, [game, screen, session, busy, modal, fast, roll, move]);
  useEffect(() => {
    if (!game?.lastAction) return; const a = game.lastAction;
    const key = JSON.stringify([game.turn, a, game.players.map((p: any) => p.pieces)]);
    if (lastSound.current === key) return; lastSound.current = key;
    if (a.type === "move") { if (a.captured?.length) audio.capture(); else if (a.to === 56) audio.home(); else audio.move(); }
    if (game.phase === "finished" && !winRecorded.current) {
      winRecorded.current = true; audio.win(); const winner = game.players[game.winner];
      if (winner?.type === "human" && (!session || winner.id === session.playerId)) setWins(previous => { const next = previous + 1; try { localStorage.setItem("ludo-wins", String(next)); } catch {} return next; });
    }
  }, [game, session]);
  const current = game?.players[game.current];
  const isMine = !!current && current.type === "human" && (!session || current.id === session.playerId);
  const canRoll = screen === "game" && isMine && game?.phase === "roll" && !busy && !modal;
  const canMove = screen === "game" && isMine && game?.phase === "move" && !busy && !modal;
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if ((e.target as HTMLElement).matches("input,select,textarea") || modal) return; if (e.code === "Space" && canRoll) { e.preventDefault(); roll(); } if (/^[1-4]$/.test(e.key) && canMove) { e.preventDefault(); move(Number(e.key) - 1); } };
    window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key);
  }, [canRoll, canMove, modal, roll, move]);
  useEffect(() => {
    if (!modal) return; const previous = document.activeElement as HTMLElement; const node = modalRef.current;
    node?.querySelector<HTMLElement>("button,input,select")?.focus();
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setModal(null); if (e.key === "Tab") { const els = node?.querySelectorAll<HTMLElement>("button:not([disabled]),input,select,[tabindex='0']"); if (!els?.length) return; if (e.shiftKey && document.activeElement === els[0]) { e.preventDefault(); els[els.length - 1].focus(); } else if (!e.shiftKey && document.activeElement === els[els.length - 1]) { e.preventDefault(); els[0].focus(); } } };
    document.addEventListener("keydown", key); return () => { document.removeEventListener("keydown", key); previous?.focus(); };
  }, [modal]);
  function resetInteraction() { epoch.current++; busyRef.current = false; setBusy(false); setRolling(false); setError(""); winRecorded.current = false; }
  function startLocal() {
    resetInteraction(); audio.unlock(); audio.start();
    const count = mode === "solo" ? opponents + 1 : totalSeats; const colors = count === 2 ? [3,1] : count === 3 ? [3,0,1] : [3,0,1,2];
    const players: any = colors.map((color, i) => { const human = mode === "solo" ? i === 0 : i < humans; return { id: `local-${i}`, name: human ? (mode === "solo" ? name.trim() || "You" : names[i]?.trim() || (i === 0 ? name.trim() || "Player 1" : `Player ${i + 1}`)) : BOT_NAMES[(i - (mode === "solo" ? 1 : humans) + 3) % 3], color, type: human ? "human" : "ai", difficulty }; });
    setGame(createGame(players, rules)); setScreen("game"); setResume(null); setSession(null); setRoom(null);
  }
  async function connectRoom() {
    if (busyRef.current) return; busyRef.current = true; setBusy(true); setError(""); audio.unlock();
    try {
      const joining = onlineTab === "join"; if (joining && !/^[A-Z2-9]{6}$/.test(code)) throw new Error("Enter the six-character room code.");
      const seats = JSON.parse(localStorage.getItem("ludo-seats") || "{}");
      if (joining && seats[code]?.token) { setSession(seats[code]); setScreen("lobby"); localStorage.setItem("ludo-session", JSON.stringify(seats[code])); return; }
      let response: Response;
      try { response = await fetch(joining ? `/api/rooms/${code}` : "/api/rooms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(joining ? { action: "join", name: name.trim() || "Guest" } : { action: "create", name: name.trim() || "Host", rules, difficulty, maxPlayers: totalSeats }) }); } catch { throw new Error("Connection failed. Please try again."); }
      const data: any = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error || "Couldn't open that room.");
      const next = { code: data.room.code, token: data.token, playerId: data.playerId }; resetInteraction(); setSession(next); acceptRoom(data);
      try { localStorage.setItem("ludo-session", JSON.stringify(next)); seats[next.code] = next; localStorage.setItem("ludo-seats", JSON.stringify(seats)); history.replaceState(null, "", `?room=${next.code}`); } catch {}
      audio.start();
    } catch (err: any) { setError(err.message || "Connection failed. Please try again."); }
    finally { busyRef.current = false; setBusy(false); }
  }
  async function hostedAction(action: string, extra: any = {}) { if (busyRef.current) return; busyRef.current = true; setBusy(true); setError(""); audio.unlock(); try { if (action === "rematch") winRecorded.current = false; await roomAction(action, extra); } catch (err: any) { setError(err.message); } finally { busyRef.current = false; setBusy(false); } }
  async function leave() {
    if (session && room?.phase === "lobby") { try { await roomAction("leave"); const seats = JSON.parse(localStorage.getItem("ludo-seats") || "{}"); delete seats[session.code]; localStorage.setItem("ludo-seats", JSON.stringify(seats)); } catch {} }
    resetInteraction(); setSession(null); setRoom(null); setScreen("setup"); setModal(null);
    if (game && !session && mode !== "online" && game.phase !== "finished") setResume({ game, mode });
    if (session) { setGame(null); gameRef.current = null; }
    sessionRef.current = null; roomRef.current = null;
    try { localStorage.removeItem("ludo-session"); history.replaceState(null, "", location.pathname); } catch {}
  }
  function rematchLocal() { resetInteraction(); setGame(createGame(game.players.map((p: any) => ({ id:p.id, name:p.name, color:p.color, type:p.type, difficulty:p.difficulty })), game.rules)); audio.start(); }
  async function copyInvite() { try { await navigator.clipboard.writeText(`${location.origin}/?room=${session?.code || room?.code}`); notify("Invite link copied."); } catch { notify(`Room code: ${session?.code || room?.code}`); } }
  async function toggleFullscreen() { try { if (!document.fullscreenElement) { await document.documentElement.requestFullscreen(); setFull(true); } else { await document.exitFullscreen(); setFull(false); } } catch { notify("Fullscreen isn't available in this browser."); } }
  const displayGame = screen === "game" && game ? game : { ...EMPTY_PREVIEW, players: EMPTY_PREVIEW.players.map(p => ({ ...p, pieces: rules.mode === "quick" ? [-1,-1] : [-1,-1,-1,-1] })), rules };
  const activeRules = screen === "game" ? game?.rules || rules : room?.rules || rules;
  const finished = screen === "game" && game?.phase === "finished", winner = finished ? game.players[game.winner] : null;
  const activeColor = current ? PALETTE[current.color] : PALETTE[3], host = room && session && room.hostId === session.playerId;
  const hostAbsent = !!room && room.players.find((p: any) => p.id === room.hostId)?.connected === false;
  const disconnectedPlayers = room?.players.filter((p: any) => p.type === "human" && p.id !== session?.playerId && !p.connected) || [];
  const recoveryControls = session && room && ((hostAbsent && !host) || (host && disconnectedPlayers.length > 0 && room.phase === "playing")) ? <div className="room-recovery">{hostAbsent && !host && <button className="secondary-button" disabled={busy} onClick={() => hostedAction("claim-host")}>Host disconnected · take over</button>}{host && room.phase === "playing" && disconnectedPlayers.map((p: any) => <div key={p.id}><span>{p.name} disconnected</span><button disabled={busy} onClick={() => hostedAction("replace", { playerId: p.id })}>Use a bot</button></div>)}</div> : null;
  const actionMessage = game?.events?.at(-1)?.text || "";
  return <div className={`app ${reduced ? "reduce-motion" : ""}`}>
    <header className="site-header">
      <button className="brand" onClick={() => screen !== "setup" && setModal("leave")} aria-label="Ludo home"><span className="brand-mark"><i/><i/><i/><i/></span><span>Ludo</span></button>
      
      <div className="header-actions">{canFullscreen && screen === "setup" && <button className="icon-button header-fullscreen" onClick={toggleFullscreen} aria-label={full ? "Exit fullscreen" : "Enter fullscreen"}>{full ? <Minimize2/> : <Maximize2/>}</button>}<button className={`icon-button ${sound || music ? "" : "muted"}`} onClick={() => { audio.unlock(); if (sound || music) { setSound(false); setMusic(false); } else setSound(true); }} aria-label={sound || music ? "Mute audio" : "Enable sound"}>{sound || music ? <Volume2/> : <VolumeX/>}</button><button className="icon-button" onClick={() => setModal("rules")} aria-label="How to play"><HelpCircle/></button><button className="icon-button" onClick={() => setModal("settings")} aria-label="Settings"><Settings2/></button></div>
    </header>
    <main className={`main ${screen !== "setup" ? "playing" : ""}`}>
      <h1 className="sr-only">Ludo</h1>
      <div className="table-layout">
        <section className="board-area" aria-label="Ludo game board">
          <div className="board-meta"><span className="table-name">{session && <><span className="live-dot"/>{`ROOM ${session.code}`}</>}</span>{canFullscreen && <button className="text-icon-button" onClick={toggleFullscreen} aria-label={full ? "Exit fullscreen" : "Enter fullscreen"}>{full ? <Minimize2 size={15}/> : <Maximize2 size={15}/>}</button>}</div>
          <div className="board-stage"><Board game={displayGame} onPiece={move} interactive={canMove} preview={screen !== "game"} reducedMotion={reduced}/>{finished && <div className="board-celebration" aria-hidden="true">{Array.from({ length: 28 }, (_, i) => <i key={i} style={{ "--x": `${(i * 37) % 100}%`, "--delay": `${(i % 7) * .12}s`, "--c": PALETTE[i % 4], "--r": `${i * 53}deg` } as React.CSSProperties}/>)}</div>}</div>
          {screen === "game" && <div className="board-caption"><span aria-live="polite" aria-atomic="true">{actionMessage}</span></div>}
        </section>
        <aside className="game-panel" aria-label={screen === "setup" ? "Set up your game" : "Game controls"}>
          {screen === "setup" && <>
                        <div className="mode-tabs" role="tablist" aria-label="Game mode">{([{ id:"solo", icon:<House/>, label:"Solo" }, { id:"local", icon:<Users/>, label:"Local" }, { id:"online", icon:<Globe2/>, label:"Online" }] as const).map(tab => <button role="tab" aria-selected={mode === tab.id} key={tab.id} className={mode === tab.id ? "selected" : ""} onClick={() => { setMode(tab.id); setError(""); }}>{tab.icon}{tab.label}</button>)}</div>
            {mode === "solo" && <>
              <div className="setting-block"><div className="field-label">OPPONENTS</div><div className="opponent-options">{[1,2,3].map(n => <button className={`opponent-option ${opponents === n ? "selected" : ""}`} key={n} onClick={() => setOpponents(n)} aria-pressed={opponents === n} aria-label={`Play against ${n} ${n === 1 ? "bot" : "bots"}`}><span className="avatar-stack">{Array.from({ length:n }, (_, i) => <Face key={i} color={[0,1,2][i]} kind={i}/>)}</span><span>{n === 1 ? "One rival" : n === 2 ? "Two rivals" : "Full table"}</span>{opponents === n && <span className="option-check"><Check size={10}/></span>}</button>)}</div></div>
              <div className="setting-block"><div className="field-label">DIFFICULTY</div><div className="difficulty-options">{DIFFICULTIES.map(d => <button key={d} aria-pressed={difficulty === d} className={difficulty === d ? "selected" : ""} onClick={() => setDifficulty(d)}>{d === "expert" && <Sparkles size={12}/>}<span>{d}</span></button>)}</div></div>
            </>}
            {mode === "local" && <div className="local-setup"><div className="setting-block"><div className="field-label">PLAYERS</div><div className="seat-counter"><label>Humans</label><div className="step-options">{[2,3,4].map(n => <button key={n} className={humans === n ? "selected" : ""} onClick={() => { setHumans(n); setTotalSeats(Math.max(n,totalSeats)); }}>{n}</button>)}</div></div><div className="seat-counter"><label>Total with bots</label><div className="step-options">{[2,3,4].map(n => <button key={n} disabled={n < humans} className={totalSeats === n ? "selected" : ""} onClick={() => setTotalSeats(n)}>{n}</button>)}</div></div></div><div className="name-grid">{Array.from({ length:humans }, (_,i) => <label key={i}><span style={{ background:PALETTE[(totalSeats === 2 ? [3,1] : [3,0,1,2])[i]] }}/><input maxLength={20} aria-label={`Player ${i + 1} name`} placeholder={`Player ${i + 1}`} value={names[i]} onChange={e => setNames(prev => prev.map((n,j) => j === i ? e.target.value : n))}/></label>)}</div>{totalSeats > humans && <label className="inline-select">Bot difficulty<select value={difficulty} onChange={e => setDifficulty(e.target.value)}>{DIFFICULTIES.map(d => <option key={d} value={d}>{d[0].toUpperCase()+d.slice(1)}</option>)}</select></label>}</div>}
            {mode === "online" && <div className="online-setup"><div className="sub-tabs"><button className={onlineTab === "create" ? "selected" : ""} onClick={() => setOnlineTab("create")}>Create a room</button><button className={onlineTab === "join" ? "selected" : ""} onClick={() => setOnlineTab("join")}>Join a room</button></div><label className="input-label">Your name<input maxLength={20} value={name} placeholder="What should we call you?" onChange={e => setName(e.target.value)} autoComplete="nickname"/></label>{onlineTab === "join" ? <label className="input-label">Room code<input className="room-code-input" value={code} maxLength={6} placeholder="ABC234" onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z2-9]/g,""))} autoCapitalize="characters" autoComplete="off" onKeyDown={e => e.key === "Enter" && connectRoom()}/></label> : <div className="seat-counter"><label>Seats at the table</label><div className="step-options">{[2,3,4].map(n => <button key={n} className={totalSeats === n ? "selected" : ""} onClick={() => setTotalSeats(n)}>{n}</button>)}</div></div>}</div>}
            {mode === "online" && onlineTab === "create" && <label className="inline-select">Bot difficulty<select value={difficulty} onChange={e => setDifficulty(e.target.value)}>{DIFFICULTIES.map(d => <option key={d} value={d}>{d[0].toUpperCase() + d.slice(1)}</option>)}</select></label>}
            {!(mode === "online" && onlineTab === "join") && <><div className="setting-block format-setting"><div className="field-label">LENGTH <button onClick={() => setModal("rules")} aria-label="Explain game rules"><Settings2 size={13}/></button></div><div className="format-options"><button className={rules.mode === "classic" ? "selected" : ""} onClick={() => setRules(r => ({...r,mode:"classic"}))}><Flag size={18}/><span><b>Classic</b><small>All four pieces</small></span>{rules.mode === "classic" && <Check size={14}/>}</button><button className={rules.mode === "quick" ? "selected" : ""} onClick={() => setRules(r => ({...r,mode:"quick"}))}><Zap size={18}/><span><b>Quick</b><small>Two to get home</small></span>{rules.mode === "quick" && <Check size={14}/>}</button></div></div><div className="compact-rules"><button aria-pressed={rules.safeSquares} onClick={() => setRules(r => ({...r,safeSquares:!r.safeSquares}))}><span className={`checkbox ${rules.safeSquares ? "checked" : ""}`}>{rules.safeSquares && <Check size={10}/>}</span>Safe squares</button><button aria-pressed={rules.threeSixes} onClick={() => setRules(r => ({...r,threeSixes:!r.threeSixes}))}><span className={`checkbox ${rules.threeSixes ? "checked" : ""}`}>{rules.threeSixes && <Check size={10}/>}</span>Three sixes rule</button></div></>}
            {error && <p className="error-message" role="alert">{error}</p>}
            <button className="primary-button start-button" disabled={busy} onClick={mode === "online" ? connectRoom : startLocal}><span>{busy ? <LoaderCircle className="spin" size={18}/> : mode === "online" ? <Link2 size={18}/> : <Dice5 size={20}/>} {mode === "online" ? onlineTab === "create" ? "Create room" : "Join the table" : "Let’s roll"}</span><ArrowRight size={18}/></button>
                        {resume && <button className="resume-button" onClick={() => { resetInteraction(); setGame(resume.game); setMode(resume.mode); setScreen("game"); setResume(null); audio.unlock(); }}><RotateCcw size={14}/>Continue your last game<ChevronRight size={14}/></button>}
          </>}
          {screen === "lobby" && <>
            {!room && <div className="panel-heading"><h2>Finding your seat…</h2></div>}
            {room ? <><button className="invite-code" onClick={copyInvite} aria-label="Copy room invite link"><span>ROOM CODE</span><b>{room.code}</b><Copy size={18}/></button><button className="secondary-button invite-button" onClick={copyInvite}><Link2 size={16}/>Copy invite link</button><div className="lobby-seats">{Array.from({length:room.maxPlayers}, (_,i) => { const p = room.players[i]; return <div className="lobby-seat" key={i}>{p ? <Face color={p.color} kind={i}/> : <span className="empty-avatar"><Plus size={17}/></span>}<span><b>{p ? p.name : "An open seat"}</b><small>{p ? p.connected === false ? "Away" : p.id === room.hostId ? "Host" : "Ready to play" : fillAI ? "A bot can fill in" : "Waiting for a friend"}</small></span>{p && p.connected !== false && <span className="ready-dot"/>}</div>; })}</div>{host && <><Toggle checked={fillAI} onChange={setFillAI} label="Fill empty seats with bots"/><button className="primary-button" disabled={busy || (!fillAI && room.players.filter((p:any) => p.type === "human").length < 2)} onClick={() => hostedAction("start",{fillAI})}><span>{busy ? <LoaderCircle size={18} className="spin"/> : <Dice5 size={18}/>}Start the game</span><ArrowRight size={18}/></button></>}{!host && <div className="waiting-label"><LoaderCircle size={16} className="spin"/>Waiting for the host</div>}<button className="back-button" onClick={leave}><ArrowLeft size={14}/>Leave room</button></> : <div className="connecting"><LoaderCircle className="spin" size={28}/></div>}
            {recoveryControls}{connection === "reconnecting" && <div className="connection-warning">Reconnecting… your seat is saved.</div>}{error && <p className="error-message" role="alert">{error}</p>}
          </>}
          {screen === "game" && game && <>
            {finished ? <div className="victory-panel"><span className="trophy-wrap" style={{"--seat":PALETTE[winner.color]} as React.CSSProperties}><Trophy size={34}/></span><h2>{winner.name} {winner.name === "You" ? "win" : "wins"}<span>!</span></h2><button className="primary-button" disabled={busy || (!!session && !host)} onClick={session ? () => hostedAction("rematch") : rematchLocal}><span><RotateCcw size={17}/>{session && !host ? "Waiting for a rematch" : "One more round"}</span><ArrowRight size={18}/></button><button className="back-button" onClick={leave}>Leave table</button></div> : <>
              <div className="turn-heading"><div className="eyebrow"><span className="turn-dot" style={{background:activeColor}}/>{isMine ? mode === "local" ? `${current.name.toUpperCase()}’S TURN` : "YOUR TURN" : `${current.name.toUpperCase()}’S TURN`}</div><p>{rolling ? "" : isMine ? game.phase === "move" ? "Tap a glowing piece to move it." : current.pieces.every((p:number) => p === -1) ? "Roll a six to make your entrance." : "" : `${current.name} ${current.type === "ai" ? "is thinking" : "is up"}.`}</p></div>
              <div className="dice-stage" style={{"--seat":activeColor} as React.CSSProperties}><div className="dice-halo"/><button className={`dice-trigger ${canRoll ? "can-roll" : ""}`} onClick={roll} disabled={!canRoll} aria-label={rolling ? "Rolling dice" : `Dice ${game.dice || 5}. ${canRoll ? "Roll dice" : "Waiting"}`}><Dice value={rolling ? visualFace : game.dice || 5} rolling={rolling} large/></button>{game.sixes > 0 && game.phase === "roll" && <span className="extra-turn">A SIX! GO AGAIN <Sparkles size={12}/></span>}</div>
              <button className="primary-button roll-button" style={{"--active":activeColor} as React.CSSProperties} disabled={!canRoll} onClick={roll}><span>{rolling ? <LoaderCircle size={18} className="spin"/> : <Dice5 size={19}/>} {rolling ? "Rolling…" : game.phase === "move" ? isMine ? "Choose a piece" : "Choosing a piece…" : isMine ? "Roll the dice" : `${current.name} is rolling…`}</span>{canRoll && <kbd>SPACE</kbd>}</button>
              {canMove && <div className="piece-choices" aria-label="Choose a piece">{game.legal.map((i:number) => <button key={i} onClick={() => move(i)} style={{"--seat":activeColor} as React.CSSProperties}><span className="mini-pawn"/><span>Piece {i+1}</span><kbd>{i+1}</kbd></button>)}</div>}
            </>}
            <div className="scoreboard"><div className="field-label">PLAYERS <span>{activeRules.mode === "quick" ? "QUICK" : "CLASSIC"}</span></div>{game.players.map((p:any,i:number) => <div key={p.id} className={`score-row ${i === game.current && !finished ? "active" : ""}`} style={{"--seat":PALETTE[p.color]} as React.CSSProperties}><Face color={p.color} kind={i} small/><div className="score-name"><b>{p.name}{((!session && mode === "solo" && i === 0) || session?.playerId === p.id) && p.name !== "You" && <small>you</small>}</b><span>{p.type === "ai" ? `${p.difficulty || difficulty} bot` : i === game.current && !finished ? (!session || p.id === session.playerId ? "Your turn" : "Playing") : "At the table"}</span></div><span className="home-dots" aria-label={`${p.pieces.filter((v:number) => v === 56).length} of ${p.pieces.length} pieces home`}>{p.pieces.map((v:number,k:number) => <i className={v === 56 ? "home" : ""} key={k}/>)}</span>{finished && i === game.winner && <Trophy size={14}/>}</div>)}</div>
            {recoveryControls}{session && <div className={`connection-state ${connection}`}><span role="img" aria-label={connection === "connected" ? "Connected" : "Reconnecting"}/>{connection === "connected" ? "" : "Reconnecting… your seat is saved"}<button onClick={copyInvite} aria-label="Copy room link"><Link2 size={13}/></button></div>}
            {error && <p className="error-message" role="alert">{error}</p>}{!finished && <div className="in-game-links"><button onClick={() => setModal("rules")}>House rules</button><button onClick={() => setModal("leave")}>Leave table <ArrowRight size={12}/></button></div>}
          </>}
        </aside>
      </div>
    </main>
    {toast && <div className="toast" role="status"><Check size={16}/>{toast}</div>}
    {modal && <div className="modal-backdrop" onMouseDown={e => e.target === e.currentTarget && setModal(null)}><div className={`modal ${modal === "rules" ? "rules-modal" : ""}`} ref={modalRef} role="dialog" aria-modal="true" aria-labelledby="modal-title"><button className="modal-close icon-button" onClick={() => setModal(null)} aria-label="Close dialog"><X size={20}/></button>
      {modal === "rules" && <><h2 id="modal-title">How to play</h2><p className="modal-intro">Get every piece home before your rivals do.</p><div className="rule-list"><div><span className="rule-number">01</span><span><b>Roll a six. You’re in.</b><p>A six moves a piece from base to its start square, or moves a piece already out. You also get another roll.</p></span><Dice value={6}/></div><div><span className="rule-number">02</span><span><b>Go around. Send them back.</b><p>Move clockwise. Land on a rival to send their piece back to base. {activeRules.safeSquares ? "Starred squares are safe for everyone." : "Safe squares are off: captures are allowed on every shared square."}</p></span><Flag size={24}/></div><div><span className="rule-number">03</span><span><b>Bring them home.</b><p>After a lap, enter your own colored lane. You need an exact roll to finish. First to bring {activeRules.mode === "quick" ? "two" : "all four"} pieces home wins.</p></span><House size={24}/></div></div><div className="rules-detail"><b>This table’s rules</b><p>{activeRules.threeSixes ? "Three sixes in a row: the third roll ends your turn. Earlier moves stay." : "Three-sixes penalty is off."} No bonus rolls for captures or finishing. Pieces can share squares and never block the path. One roll per turn when you can’t move.</p><p><b>Quick:</b> two pieces each. <b>Classic:</b> four. Everything else stays the same.</p></div><button className="primary-button" onClick={() => setModal(null)}><span>Got it</span><ArrowRight size={18}/></button></>}
      {modal === "settings" && <><h2 id="modal-title">Settings</h2><div className="settings-list"><Toggle checked={sound} onChange={v => { audio.unlock(); setSound(v); }} label="Sound effects"/><Toggle checked={music} onChange={v => { audio.unlock(); setMusic(v); }} label="Table music"/><Toggle checked={fast} onChange={setFast} label="Faster bot turns" hint="Quicker turns in solo and local games."/><Toggle checked={reduced} onChange={setReduced} label="Reduce motion"/><label className="input-label">Your name<input value={name} maxLength={20} placeholder="You" onChange={e => setName(e.target.value)}/></label></div><button className="primary-button" onClick={() => setModal(null)}><span>Done</span><Check size={18}/></button></>}
      {modal === "leave" && <><h2 id="modal-title">Leave the table?</h2><p className="modal-intro">{session ? (room?.phase === "lobby" ? "Your seat in this lobby will be released. You can join again while there is room." : "Your online seat will wait for you. Keep the invite link and return in this browser to reconnect.") : "Your game is saved on this device. Pick it up from the home screen."}</p><div className="dialog-actions"><button className="secondary-button" onClick={() => setModal(null)}>Keep playing</button><button className="primary-button" onClick={leave}>Leave table</button></div></>}
    </div></div>}
  </div>;
}
