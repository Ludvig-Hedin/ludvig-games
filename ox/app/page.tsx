"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { Board } from "./components/Board";
import { Mark } from "./components/Mark";
import { useGame, other, capitalize, DIFFICULTIES, type Mode, type Symbol } from "./useGame";
import { playSound, unlockAudio } from "../lib/sound";

function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const paths: Record<string, ReactNode> = {
    arrow: <path d="M5 12h14m-6-6 6 6-6 6" />,
    back: <path d="m14 6-6 6 6 6" />,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    settings: <><path d="M4 7h6m4 0h6M4 17h10m4 0h2" /><circle cx="12" cy="7" r="2" /><circle cx="16" cy="17" r="2" /></>,
    volume: <><path d="m11 4-5 4H3v8h3l5 4V4Z" /><path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14" /></>,
    muted: <><path d="m11 4-5 4H3v8h3l5 4V4Z" /><path d="m16 9 5 6m0-6-5 6" /></>,
    sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" /></>,
    moon: <path d="M20 14a8.5 8.5 0 0 1-10-10A8.5 8.5 0 1 0 20 14Z" />,
    system: <><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M8 21h8m-4-4v4" /></>,
    computer: <><rect x="3" y="4" width="18" height="13" rx="3" /><path d="M8 21h8m-4-4v4m-4-7 2 2 4-4" /></>,
    friend: <><path d="M8.5 15H7a5 5 0 0 1 0-10h4m2 14h4a5 5 0 0 0 0-10h-1.5M8 12h8" /></>,
    local: <><circle cx="9" cy="7" r="3" /><path d="M3 21v-2a6 6 0 0 1 12 0v2m1-17a3 3 0 0 1 0 6m2 5a5 5 0 0 1 3 4v2" /></>,
    restart: <path d="M3 10a9 9 0 1 1 2 8M3 4v6h6" />,
    copy: <><rect x="8" y="8" width="12" height="13" rx="2" /><path d="M15 5V3H4v13h1" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    chart: <path d="M4 20h16M7 16v-5m5 5V4m5 12V8" />,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] ?? paths.arrow}</svg>;
}
function Sheet({ title, children, onClose, compact = false }: { title: string; children: ReactNode; onClose: () => void; compact?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current; const focused = document.activeElement as HTMLElement; dialog?.showModal(); return () => { dialog?.close(); focused?.focus(); }; }, []);
  return <dialog ref={ref} className={`sheet ${compact ? "sheet-compact" : ""}`} aria-labelledby="sheet-title" onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { if (event.target === ref.current) { const rect = ref.current!.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose(); } }}>
    <div className="sheet-handle" aria-hidden="true" /><header className="sheet-header"><h2 id="sheet-title">{title}</h2><button className="icon-button" aria-label="Close" onClick={onClose}><Icon name="close" /></button></header>{children}
  </dialog>;
}
export default function Home() {
  const g = useGame();
  const { preferences, draft, game, mode, screen, room } = g;
  const stats = g.statistics[g.statsMode];
  return <div className="app-shell">
    <header className="app-header">
      <button className="wordmark" aria-label="OX home" onClick={g.goHome}><span className="wordmark-symbol">o<span>/</span>x</span><span className="wordmark-description">tic tac toe</span></button>
      <div className="header-actions"><button className="icon-button sound-button" aria-label={preferences.sound ? "Mute sounds" : "Enable sounds"} aria-pressed={preferences.sound} onClick={g.toggleSound}><Icon name={preferences.sound ? "volume" : "muted"} /></button><button className="icon-button" aria-label={g.resolvedDark ? "Switch to light mode" : "Switch to dark mode"} onClick={g.toggleTheme}><Icon name={g.resolvedDark ? "sun" : "moon"} /></button><span className="header-divider" /><button className="icon-button" aria-label="Settings" onClick={g.openSettings}><Icon name="settings" /></button></div>
    </header>
    {screen === "home" ? <main className="home-screen" key="home">
      <div className="home-content">
        <div className="hero-marks" aria-hidden="true"><div className="hero-x"><Mark mark="X" animated={false} /></div><div className="hero-o"><Mark mark="O" animated={false} /></div><span className="hero-ground" /></div>
        <h1 className="sr-only">OX</h1>
        <div className="mode-buttons"><button className="mode-button primary" onClick={() => g.startGame("computer")}><Icon name="computer" /><span>Play Computer</span><Icon name="arrow" size={18} /></button><button className="mode-button secondary" onClick={g.openFriend}><Icon name="friend" /><span>Play Friend</span><Icon name="arrow" size={18} /></button><button className="mode-button tertiary" onClick={() => g.startGame("local")}><Icon name="local" /><span>Play Locally</span><Icon name="arrow" size={18} /></button></div>
        <button className="quiet-link game-defaults" onClick={g.openSettings}>{preferences.size} × {preferences.size}<span>·</span>{preferences.length ? `Best of ${preferences.length}` : "Endless"}<Icon name="settings" size={14} /></button>
        {g.lastRoom ? <button className="resume-link" disabled={g.busy} onClick={() => void g.joinRoom(g.lastRoom)}>Resume room {g.lastRoom}<Icon name="arrow" size={14} /></button> : null}
      </div>
      <footer className="home-footer"><span aria-hidden="true" /><button className="quiet-link" onClick={g.openStats}><Icon name="chart" size={16} />Your stats</button></footer>
    </main> : <main className={`game-screen ${g.finished ? "is-finished" : ""}`} key="game">
      <div className="game-meta"><span className="back-link" aria-hidden="true" /><span>{mode === "computer" ? capitalize(preferences.difficulty) : mode === "local" ? "Side by side" : <><span className={`connection-dot ${g.connection !== "online" ? "disconnected" : ""}`} />{room?.code || g.session?.code}</>}</span><button className="quiet-link rules-link" onClick={g.openSettings}>{game.size} × {game.size}<span className="meta-dot">·</span>{game.matchLength ? `Best of ${game.matchLength}` : "Endless"}</button></div>
      <section className="play-area" aria-label="Tic tac toe game">
        <div className="game-heading" aria-live="polite" aria-atomic="true"><h1>{g.title}{g.thinking && !g.finished ? <span className="thinking-dots" aria-label="thinking"><i /><i /><i /></span> : null}</h1><p>{g.subtitle}</p></div>
        <div className="scoreboard" aria-label={`Score: ${g.nameFor("X")} ${game.scores.X}, ${g.nameFor("O")} ${game.scores.O}, draws ${game.scores.draw}`}>
          <div className={`player player-x ${!g.finished && game.turn === "X" && !g.isWaiting ? "active" : ""}`}><span className="player-mark"><Mark mark="X" animated={false} small /></span><span className="player-name">{g.nameFor("X")}</span><span className="score-number" key={`x-${game.scores.X}`}>{game.scores.X}</span></div>
          <div className="score-middle"><span>:</span></div>
          <div className={`player player-o ${!g.finished && game.turn === "O" && !g.isWaiting ? "active" : ""}`}><span className="score-number" key={`o-${game.scores.O}`}>{game.scores.O}</span><span className="player-name">{g.nameFor("O")}</span><span className="player-mark"><Mark mark="O" animated={false} small /></span></div>
        </div>
        <div className={`board-stage ${g.resetting ? "board-resetting" : ""}`}><Board board={game.board} size={game.size} turn={game.turn} disabled={!g.canPlay} line={game.line} winner={game.winner} onMove={g.move} roundKey={`${g.localId}-${room?.matchNumber ?? 0}-${game.round}-${game.size}`} waiting={g.isWaiting} />{g.isWaiting && !room?.closed && g.connection !== "ended" ? <div className="waiting-content"><div className="waiting-rings" aria-hidden="true"><span /><span /></div><span>Waiting for a friend</span><button className="button primary invite-button" onClick={g.copyInvite}><Icon name={g.copied ? "check" : "copy"} size={17} />{g.copied ? "Link copied" : "Copy invite link"}</button><span className="room-code-label">Room <strong>{room?.code}</strong></span></div> : null}</div>
        <div className="board-caption"><span>{g.finished ? game.matchWinner ? "Match complete" : `Round ${game.round} complete` : `Round ${game.round}`}</span><span>{game.scores.draw ? `${game.scores.draw} ${game.scores.draw === 1 ? "draw" : "draws"}` : ""}</span><span>{game.target ? `First to ${game.target}` : "Endless"}</span></div>
        <div className="game-bottom">{mode === "online" && g.connection === "ended" ? <button className="button primary next-round" onClick={g.openFriend}>New room<Icon name="arrow" size={18} /></button> : g.finished ? <div className="round-result"><button className="button primary next-round" onClick={() => void g.rematch()} disabled={g.busy || g.onlineReady}>{g.onlineReady ? "Waiting for your friend…" : game.matchWinner ? "Play again" : "Next round"}{!g.onlineReady ? <Icon name="arrow" size={18} /> : <span className="small-spinner" />}</button><span className="result-note">{mode === "online" && room?.ready[other(g.yourMark)] && !g.onlineReady ? "Your friend is ready." : game.draw ? "No points. The match continues." : ""}</span></div> : mode === "online" ? <button className="quiet-link" onClick={g.copyInvite}><Icon name={g.copied ? "check" : "friend"} size={16} />{g.copied ? "Copied" : "Invite link"}</button> : <button className="quiet-link restart-button" onClick={() => void g.rematch()} disabled={g.resetting}><Icon name="restart" size={16} />New match</button>}</div>
      </section>
      <footer className="game-footer"><span className="desktop-hint">{game.size === 3 ? "1–9 with board focused" : "Arrow keys to navigate"}<span>·</span>Enter to select</span><button className="quiet-link" onClick={g.openStats}><Icon name="chart" size={16} />Stats</button></footer>
    </main>}

    {g.sheet === "friend" ? <Sheet title="Play Friend" onClose={() => { if (!g.busy) { g.setSheet(null); g.setFriendError(""); } }} compact>
      <div className="friend-sheet-content">{!g.invited ? <><button className="button primary wide-button" disabled={g.busy} onClick={() => void g.createRoom()}>{g.busy ? <span className="small-spinner" /> : <Icon name="friend" size={19} />}Create a private room<Icon name="arrow" size={17} /></button><p className="room-rules">{preferences.size} × {preferences.size}<span>·</span>{preferences.length ? `Best of ${preferences.length}` : "Endless"}<button className="quiet-link" onClick={g.openSettings}>Change</button></p><div className="or-divider"><span>or join a room</span></div></> : null}<form onSubmit={event => { event.preventDefault(); void g.joinRoom(); }}><label htmlFor="room-code" className="field-label">Room code</label><div className="code-input-row"><input id="room-code" name="room" autoComplete="off" autoCapitalize="characters" spellCheck={false} placeholder="ABCD1234" value={g.code} onChange={event => { let value = event.target.value; try { if (value.includes("room=")) value = new URL(value).searchParams.get("room") ?? value; } catch {} g.setCode(value.replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, 8)); g.setFriendError(""); }} maxLength={150} aria-describedby={g.friendError ? "friend-error" : undefined} /><button className="button primary" type="submit" disabled={g.busy || g.code.length !== 8}>{g.busy ? <span className="small-spinner" /> : "Join"}</button></div></form>{g.friendError ? <p className="form-error" role="alert" id="friend-error">{g.friendError}</p> : null}{g.lastRoom && !g.invited ? <button className="quiet-link friend-resume" disabled={g.busy} onClick={() => void g.joinRoom(g.lastRoom)}>Rejoin {g.lastRoom}<Icon name="arrow" size={14} /></button> : null}</div>
    </Sheet> : null}

    {g.sheet === "settings" ? <Sheet title="Settings" onClose={() => g.setSheet(null)}>
      <div className="settings-body"><section className="setting-section"><div className="setting-label"><h3>Board</h3><span>{draft.size === 3 ? "3" : "4"} in a row wins</span></div><div className="segmented board-options" role="group" aria-label="Board size">{[3, 4, 5].map(size => <button key={size} aria-pressed={draft.size === size} disabled={screen === "game" && mode === "online"} className={draft.size === size ? "selected" : ""} onClick={() => g.setDraft(d => ({ ...d, size }))}><span className={`mini-grid grid-${size}`} aria-hidden="true">{Array.from({ length: size * size }, (_, i) => <i key={i} />)}</span>{size} × {size}</button>)}</div></section>
      <section className="setting-section"><div className="setting-label"><h3>Match length</h3><span>Draws don’t count</span></div><div className="segmented" role="group" aria-label="Match length">{[3, 5, 7, 0].map(length => <button key={length} aria-pressed={draft.length === length} disabled={screen === "game" && mode === "online"} className={draft.length === length ? "selected" : ""} onClick={() => g.setDraft(d => ({ ...d, length }))}>{length ? `Best of ${length}` : "Endless"}</button>)}</div></section>
      {screen === "home" || mode === "computer" ? <><section className="setting-section"><div className="setting-label"><h3>Computer</h3><span>{draft.difficulty === "impossible" && draft.size > 3 ? "Strongest opponent" : draft.difficulty === "impossible" ? "Unbeatable on 3 × 3" : ""}</span></div><div className="segmented difficulty-options" role="group" aria-label="Computer difficulty">{DIFFICULTIES.map(difficulty => <button key={difficulty} aria-pressed={draft.difficulty === difficulty} className={draft.difficulty === difficulty ? "selected" : ""} onClick={() => g.setDraft(d => ({ ...d, difficulty }))}>{capitalize(difficulty)}</button>)}</div></section><section className="setting-row"><h3>You play</h3><div className="segmented symbol-options" role="group" aria-label="Your symbol">{(["X", "O"] as Symbol[]).map(mark => <button key={mark} aria-label={`Play as ${mark}`} aria-pressed={draft.mark === mark} className={draft.mark === mark ? "selected" : ""} onClick={() => g.setDraft(d => ({ ...d, mark }))}><Mark mark={mark} small animated={false} /></button>)}</div></section></> : null}
      <div className="settings-divider" /><section className="setting-row"><h3>Appearance</h3><div className="segmented appearance-options" role="group" aria-label="Color theme">{(["light", "dark", "system"] as const).map(theme => <button key={theme} aria-label={`${capitalize(theme)} theme`} aria-pressed={draft.theme === theme} className={draft.theme === theme ? "selected" : ""} onClick={() => g.setDraft(d => ({ ...d, theme }))}><Icon name={theme === "light" ? "sun" : theme === "dark" ? "moon" : "system"} size={18} /></button>)}</div></section><section className="setting-row"><h3>Sound</h3><button className={`switch ${draft.sound ? "on" : ""}`} role="switch" aria-checked={draft.sound} aria-label="Sound effects" onClick={() => { unlockAudio(); if (!draft.sound) playSound("tap"); g.setDraft(d => ({ ...d, sound: !d.sound })); }}><span /></button></section>
      {mode === "online" && screen === "game" ? <div className="room-setting-info"><span>Room settings stay the same for both players.</span><button className="quiet-link danger-link" disabled={g.busy} onClick={() => void g.quitRoom()}>Leave room</button></div> : null}</div><div className="sheet-bottom"><button className="button primary wide-button" onClick={g.applySettings}>{g.settingsChanged ? "Apply & start new match" : "Done"}<Icon name={g.settingsChanged ? "restart" : "check"} size={17} /></button></div>
    </Sheet> : null}

    {g.sheet === "stats" ? <Sheet title="Stats" onClose={() => g.setSheet(null)} compact><div className="statistics-body"><div className="segmented" role="group" aria-label="Statistics mode">{(["computer", "local", "online"] as Mode[]).map(item => <button key={item} className={g.statsMode === item ? "selected" : ""} aria-pressed={g.statsMode === item} onClick={() => g.setStatsMode(item)}>{capitalize(item)}</button>)}</div><div className="stat-hero"><span>{stats.rounds}</span><p>{stats.rounds === 1 ? "round played" : "rounds played"}</p></div><div className="stat-columns"><div><strong>{stats.wins}</strong><span>{g.statsMode === "local" ? "X wins" : "Wins"}</span></div><div><strong>{stats.draws}</strong><span>Draws</span></div><div><strong>{stats.losses}</strong><span>{g.statsMode === "local" ? "O wins" : "Losses"}</span></div></div><div className="stat-details"><div><span>{g.statsMode === "local" ? "Longest X win streak" : "Best win streak"}</span><strong>{stats.best}</strong></div><div><span>Moves played</span><strong>{stats.moves}</strong></div>{g.statsMode !== "local" ? <div><span>Win rate</span><strong>{stats.rounds ? Math.round(stats.wins / stats.rounds * 100) : 0}%</strong></div> : null}</div></div></Sheet> : null}
    {g.notice ? <div className="toast" role="status">{g.notice}</div> : null}
  </div>;
}
