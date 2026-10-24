"use client";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
} from "react";
import {
  ArrowRight,
  Check,
  ChevronDown,
  Copy,
  Crown,
  Eye,
  HelpCircle,
  Link2,
  LogOut,
  MessageCircle,
  Music2,
  Plus,
  RotateCcw,
  Send,
  Settings2,
  Shuffle,
  Sparkles,
  Timer,
  Trophy,
  Users,
  Volume2,
  VolumeX,
  X,
  Zap,
  Cloud,
  ShieldQuestion,
} from "lucide-react";
import { Mascot } from "@/components/mascot";
import { audio } from "@/lib/audio";
import { useRoom } from "@/lib/use-room";
import type {
  GameAction,
  Language,
  PublicRoom,
  Sabotage,
  Settings,
} from "@/lib/protocol";
type SendAction = (action: GameAction) => Promise<boolean>;
const say = (l: Language, sv: string, en: string) => (l === "sv" ? sv : en);
// Server errors are Swedish; engine errors are "sv / en". Show them in the player's language.
const SERVER_ERRORS_EN: Record<string, string> = {
  "Rummet finns inte eller har stängt. Kontrollera koden.": "That room does not exist or has closed. Check the code.",
  "Gå med i rummet igen.": "Join the room again.",
  "Rumskoden ska ha sex tecken.": "The room code has six characters.",
  "Lite för snabbt. Vänta en stund och försök igen.": "A bit too fast. Wait a moment and try again.",
  "Rummet är upptaget. Försök igen.": "The room is busy. Try again.",
  "Det gick inte att skapa rummet. Försök igen.": "Could not create the room. Try again.",
  "Spelets databas är inte tillgänglig. Försök igen.": "The game server is unavailable. Try again.",
  "Anslutningen kunde inte skapas.": "Could not connect.",
  "Anslutningen avbröts. Vi försöker ansluta igen.": "The connection dropped. Reconnecting.",
  "Anslutningen avbröts.": "The connection dropped.",
  "Rummet har stängt.": "The room has closed.",
  "Det gick inte att ansluta.": "Could not connect.",
  "Försök igen.": "Try again.",
};
const localError = (l: Language, message: string) => {
  const parts = message.split(" / ");
  if (parts.length === 2) {
    if (l === "sv") return parts[0];
    return parts[1].includes(" ") ? parts[1] : parts[0].replace(/\S+$/, parts[1]);
  }
  return l === "sv" ? message : SERVER_ERRORS_EN[message] ?? message;
};
const COLORS = [
  "#d5f55b",
  "#a6a0ee",
  "#f3a17e",
  "#8ec9b3",
  "#e8a9cb",
  "#edc96b",
  "#a5c4e8",
  "#c4b39c",
];
const EMOJIS = ["😈", "😂", "👏", "😱", "🔥", "💀"];
const CARDS: {
  id: Sabotage;
  sv: string;
  en: string;
  svText: string;
  enText: string;
  icon: typeof Zap;
}[] = [
  {
    id: "bluff",
    sv: "BLUFF",
    en: "BLUFF",
    svText: "En ledtråd. Kanske sann.",
    enText: "A clue. Possibly true.",
    icon: ShieldQuestion,
  },
  {
    id: "panic",
    sv: "PANIK",
    en: "PANIC",
    svText: "Låna 8 sekunder. I 5 sekunder.",
    enText: "Borrow 8 seconds. For 5 seconds.",
    icon: Timer,
  },
  {
    id: "chaos",
    sv: "KAOS",
    en: "CHAOS",
    svText: "Rör om tangentbordet i 8 sek.",
    enText: "Shuffle their keys for 8 sec.",
    icon: Shuffle,
  },
  {
    id: "fog",
    sv: "DIMMA",
    en: "FOG",
    svText: "Göm en bokstav i 6 sekunder.",
    enText: "Hide a letter for 6 seconds.",
    icon: Cloud,
  },
  {
    id: "double",
    sv: "DUBBELT",
    en: "DOUBLE",
    svText: "10 sekunder. Dubbel vinst eller −30.",
    enText: "10 seconds. Double points or −30.",
    icon: Zap,
  },
];
function Avatar({
  index,
  size = "normal",
}: {
  index: number;
  size?: "small" | "normal" | "big";
}) {
  const i = Math.abs(index || 0) % COLORS.length;
  return (
    <span
      className={`avatar avatar-${size}`}
      style={{ "--avatar-color": COLORS[i] } as CSSProperties}
      aria-hidden="true"
    >
      <svg viewBox="0 0 48 48" fill="none">
        <path
          d={
            i % 2
              ? "M9 25C9 11 16 7 25 9C37 5 41 19 38 30C35 42 16 42 10 33Z"
              : "M9 23C9 12 16 7 25 8C36 8 40 17 38 29C37 39 26 42 17 37C11 35 9 29 9 23Z"
          }
          fill="var(--avatar-color)"
          stroke="currentColor"
          strokeWidth="1.8"
        />
        <path
          d={i % 3 === 0 ? "M17 20L21 22M30 20L26 22" : "M18 20V24M29 20V24"}
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
        <path
          d={i % 2 ? "M20 29Q25 33 29 28" : "M20 29Q24 32 28 29"}
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        {i > 3 && (
          <path
            d="M14 12L11 5M29 9L32 3"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        )}
      </svg>
    </span>
  );
}
function HowTo({
  open,
  onClose,
  language: l,
}: {
  open: boolean;
  onClose: () => void;
  language: Language;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (open && !ref.current?.open) ref.current?.showModal();
    if (!open && ref.current?.open) ref.current?.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className="how-dialog"
      onCancel={onClose}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="how-content">
        <button
          className="icon-button modal-close"
          onClick={onClose}
          aria-label={say(l, "Stäng", "Close")}
        >
          <X size={21} />
        </button>
        <h2>{say(l, "Så funkar det", "How to play")}</h2>
        <div className="how-steps">
          {[
            [
              say(l, "Ett hemligt ord.", "One secret word."),
              say(
                l,
                "En av er väljer ett ord och en ledtråd. Alla andra gissar tillsammans — men tävlar om poängen.",
                "One of you picks a word and a clue. Everyone shares the letter board, but competes for points.",
              ),
            ],
            [
              say(l, "Gissa snabbt.", "Guess fast."),
              say(
                l,
                "Rätt bokstav ger poäng och en svit ger bonus. Skriv hela ordet privat för fler poäng. Fel ord kostar 10 poäng.",
                "Correct letters score points, with a streak bonus. Solve the whole word privately for more. A wrong full word costs 10 points.",
              ),
            ],
            [
              say(l, "Sabotage.", "Sabotage."),
              say(
                l,
                "Ordmästaren har tre sabotage. Bluffa, blanda tangenterna eller göm en bokstav. Dubbelutmaningen är frivillig: dubbla lösningspoängen eller förlora 30.",
                "The Word Master gets three sabotages. Bluff, shuffle keys, or hide a letter. The double challenge is optional: double solve points or lose 30.",
              ),
            ],
          ].map((x, i) => (
            <div key={i}>
              <span>0{i + 1}</span>
              <div>
                <h3>{x[0]}</h3>
                <p>{x[1]}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="rules-note">
          <Sparkles size={19} />
          <p>
            {say(
              l,
              "Alla får turas om. En omöjlig gåta ger ingen mästarbonus. Välj något dina vänner faktiskt kan lösa.",
              "Everyone takes a turn. An impossible puzzle earns no master bonus. Pick something your friends can actually solve.",
            )}
          </p>
        </div>
        <button className="button button-primary full" onClick={onClose}>
          {say(l, "Okej", "Got it")}
          <ArrowRight size={19} />
        </button>
      </div>
    </dialog>
  );
}
function Scoreboard({
  room,
  now,
  language: l,
  full = false,
}: {
  room: PublicRoom;
  now: number;
  language: Language;
  full?: boolean;
}) {
  const sorted = [...room.players].sort(
    (a, b) => b.score - a.score || a.nickname.localeCompare(b.nickname),
  );
  const listRef = useRef<HTMLDivElement>(null);
  const positions = useRef(new Map<string, number>());
  const order = sorted.map((p) => `${p.id}:${p.score}`).join(",");
  useLayoutEffect(() => {
    const next = new Map<string, number>();
    listRef.current
      ?.querySelectorAll<HTMLElement>("[data-player]")
      .forEach((el) => {
        const id = el.dataset.player!;
        const top = el.getBoundingClientRect().top;
        next.set(id, top);
        const old = positions.current.get(id);
        if (
          old !== undefined &&
          Math.abs(old - top) > 1 &&
          !window.matchMedia("(prefers-reduced-motion: reduce)").matches
        )
          el.animate(
            [
              { transform: `translateY(${old - top}px)` },
              { transform: "translateY(0)" },
            ],
            { duration: 420, easing: "cubic-bezier(.22,1,.36,1)" },
          );
      });
    positions.current = next;
  }, [order]);
  return (
    <div className={`roster ${full ? "roster-full" : ""}`}>
      <div className="section-heading">
        <span>
          <Users size={16} />
          {say(l, "Gänget", "The crew")}
        </span>
        <span className="muted">{room.players.length}/10</span>
      </div>
      <div className="roster-list" ref={listRef}>
        {sorted.map((p, index) => (
          <div
            className={`player-row ${p.id === room.selfId ? "is-you" : ""} ${!p.connected ? "is-disconnected" : ""}`}
            key={p.id}
            data-player={p.id}
          >
            <span className="rank">
              {full ? (
                String(index + 1).padStart(2, "0")
              ) : p.isMaster ? (
                <Crown size={15} />
              ) : null}
            </span>
            <div className="avatar-wrap">
              <Avatar index={p.avatar} />
              <span className={`presence-dot ${p.connected ? "online" : ""}`} />
              {p.reaction && p.reactionUntil > now && (
                <span className="player-reaction">{p.reaction}</span>
              )}
            </div>
            <div className="player-name">
              <strong>
                {p.nickname}
                {p.id === room.selfId && (
                  <small> {say(l, "(du)", "(you)")}</small>
                )}
              </strong>
              <span>
                {p.isMaster && room.phase !== "lobby"
                  ? say(l, "Ordmästare", "Word Master")
                  : p.solved
                    ? say(l, "Löste ordet!", "Solved it!")
                    : p.spectator
                      ? say(l, "Med nästa runda", "In next round")
                      : !p.connected
                        ? say(l, "Återansluter…", "Reconnecting…")
                        : p.isHost
                          ? say(l, "Värd", "Host")
                          : room.phase === "lobby"
                            ? say(l, "Redo", "Ready")
                            : p.typingUntil > now
                              ? say(l, "Skriver…", "Typing…")
                              : say(l, "Gissar", "Guessing")}
              </span>
            </div>
            <div className="player-score">
              <strong>{p.score}</strong>
              {full && p.delta !== 0 && (
                <span className={p.delta > 0 ? "positive" : "negative"}>
                  {p.delta > 0 ? "+" : ""}
                  {p.delta}
                </span>
              )}
            </div>
            {p.solved && <Check className="solved-check" size={15} />}
          </div>
        ))}
      </div>
    </div>
  );
}
function Chat({
  room,
  send,
  now,
  language: l,
}: {
  room: PublicRoom;
  send: SendAction;
  now: number;
  language: Language;
}) {
  const [text, setText] = useState("");
  const end = useRef<HTMLDivElement>(null);
  const lastTyping = useRef(0);
  const self = room.players.find((p) => p.id === room.selfId);
  const secretKeeper =
    (room.phase === "choosing" ||
      room.phase === "playing" ||
      room.phase === "countdown") &&
    (self?.isMaster || self?.solved);
  useEffect(() => {
    const log = end.current?.parentElement;
    if (log) log.scrollTop = log.scrollHeight;
  }, [room.chat.length]);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    if (await send({ type: "chat", text: text.trim() })) {
      setText("");
      void send({ type: "typing", active: false });
    }
  };
  const typing = room.players
    .filter((p) => p.id !== room.selfId && p.typingUntil > now)
    .map((p) => p.nickname);
  return (
    <section className="chat-panel">
      <div className="section-heading">
        <span>
          <MessageCircle size={16} />
          {say(l, "Snacket", "The chat")}
        </span>
        <span className="tiny-dot" />
      </div>
      <div
        className="chat-messages"
        role="log"
        aria-live="polite"
        aria-label={say(l, "Rumschatt", "Room chat")}
      >
        {room.chat.map((m) => (
          <div
            key={m.id}
            className={`chat-message ${m.system ? "system-message" : ""}`}
          >
            <strong>{m.system ? "" : m.nickname}</strong>
            <span>{m.text}</span>
          </div>
        ))}
        <div ref={end} />
      </div>
      <div className="typing-status" aria-live="polite">
        {typing.length
          ? `${typing.slice(0, 2).join(", ")} ${say(l, "skriver", "typing")}…`
          : "\u00a0"}
      </div>
      <div className="reactions" aria-label={say(l, "Reaktioner", "Reactions")}>
        {EMOJIS.map((emoji) => (
          <button
            key={emoji}
            onClick={() => {
              audio.play("click");
              void send({ type: "reaction", emoji });
            }}
            aria-label={`${say(l, "Reagera", "React")} ${emoji}`}
          >
            {emoji}
          </button>
        ))}
      </div>
      <form className="chat-form" onSubmit={submit}>
        <input
          aria-label={say(l, "Chattmeddelande", "Chat message")}
          placeholder={
            secretKeeper
              ? say(
                  l,
                  "Du vet ordet. Reagera i stället.",
                  "You know it. Use reactions.",
                )
              : say(l, "Säg något…", "Say something…")
          }
          maxLength={180}
          value={text}
          disabled={!!secretKeeper}
          onChange={(e) => {
            setText(e.target.value);
            if (Date.now() - lastTyping.current > 2500) {
              lastTyping.current = Date.now();
              void send({ type: "typing", active: true });
            }
          }}
          onBlur={() => {
            if (lastTyping.current) {
              lastTyping.current = 0;
              void send({ type: "typing", active: false });
            }
          }}
        />
        <button
          type="submit"
          className="icon-button"
          disabled={!text.trim() || !!secretKeeper}
          aria-label={say(l, "Skicka meddelande", "Send message")}
        >
          <Send size={17} />
        </button>
      </form>
    </section>
  );
}
function Lobby({
  room,
  send,
  language: l,
  copy,
  copied,
}: {
  room: PublicRoom;
  send: SendAction;
  language: Language;
  copy: () => void;
  copied: boolean;
}) {
  const host = room.selfId === room.hostId;
  const online = room.players.filter((p) => p.connected).length;
  const set = (settings: Partial<Settings>) =>
    void send({ type: "settings", settings });
  return (
    <section className="lobby-main">
      <div className="invite-panel">
        <div>
          <span className="field-label">
            {say(l, "ER RUMSKOD", "YOUR ROOM CODE")}
          </span>
          <button
            className="room-code"
            onClick={copy}
            title={say(l, "Kopiera inbjudningslänk", "Copy invite link")}
          >
            {room.code}
            <Copy size={20} />
          </button>
        </div>
        <button className="button button-dark" onClick={copy}>
          {copied ? <Check size={17} /> : <Link2 size={17} />}{" "}
          {copied
            ? say(l, "Kopierad!", "Copied!")
            : say(l, "Bjud in vänner", "Invite friends")}
        </button>
      </div>
      <div className="lobby-lower">
        <div className="settings-section">
          <div className="section-heading">
            <span>
              <Settings2 size={17} />
              {say(l, "Regler", "Rules")}
            </span>
            {!host && (
              <span className="muted">
                {say(l, "Värden bestämmer", "Host’s choice")}
              </span>
            )}
          </div>
          <div className="settings-grid">
            <label>
              <span>{say(l, "Rundor", "Rounds")}</span>
              <div className="select-wrap">
                <select
                  aria-label={say(l, "Antal rundor", "Number of rounds")}
                  value={room.settings.rounds}
                  disabled={!host}
                  onChange={(e) => set({ rounds: Number(e.target.value) })}
                >
                  {[2, 4, 6, 8, 10, 12, 16, 20].map((x) => (
                    <option key={x} value={x}>
                      {x} {say(l, "rundor", "rounds")}
                    </option>
                  ))}
                </select>
                <ChevronDown size={15} />
              </div>
            </label>
            <label>
              <span>{say(l, "Tid per ord", "Time per word")}</span>
              <div className="select-wrap">
                <select
                  aria-label={say(l, "Tid per runda", "Round duration")}
                  value={room.settings.roundSeconds}
                  disabled={!host}
                  onChange={(e) =>
                    set({ roundSeconds: Number(e.target.value) })
                  }
                >
                  {[30, 45, 60, 75, 90, 120].map((x) => (
                    <option key={x} value={x}>
                      {x} {say(l, "sekunder", "seconds")}
                    </option>
                  ))}
                </select>
                <ChevronDown size={15} />
              </div>
            </label>
            <label>
              <span>{say(l, "Språk", "Language")}</span>
              <div className="select-wrap">
                <select
                  aria-label={say(l, "Spelets språk", "Game language")}
                  value={room.settings.language}
                  disabled={!host}
                  onChange={(e) =>
                    set({ language: e.target.value as Language })
                  }
                >
                  <option value="sv">Svenska · Å Ä Ö</option>
                  <option value="en">English · A–Z</option>
                </select>
                <ChevronDown size={15} />
              </div>
            </label>
            <label>
              <span>{say(l, "Svårighet", "Difficulty")}</span>
              <div className="select-wrap">
                <select
                  aria-label={say(l, "Svårighetsgrad", "Difficulty")}
                  value={room.settings.difficulty}
                  disabled={!host}
                  onChange={(e) =>
                    set({
                      difficulty: e.target.value as Settings["difficulty"],
                    })
                  }
                >
                  <option value="easy">
                    {say(l, "Snäll · 10 fel", "Easy · 10 mistakes")}
                  </option>
                  <option value="normal">
                    {say(l, "Lagom · 8 fel", "Normal · 8 mistakes")}
                  </option>
                  <option value="hard">
                    {say(l, "Hård · 6 fel", "Hard · 6 mistakes")}
                  </option>
                </select>
                <ChevronDown size={15} />
              </div>
            </label>
          </div>
          <label className="sabotage-switch">
            <div>
              <strong>
                <Zap size={16} />
                {say(l, "Sabotage", "Sabotage")}
              </strong>
            </div>
            <input
              type="checkbox"
              checked={room.settings.sabotage}
              disabled={!host}
              onChange={(e) => set({ sabotage: e.target.checked })}
              aria-label={say(l, "Aktivera sabotage", "Enable sabotage")}
            />
            <span className="switch-track" aria-hidden="true" />
          </label>
        </div>
        <div className="lobby-mascot">
          <Mascot mood="idle" compact />
        </div>
      </div>
      <div className="lobby-start">
        <button
          className="button button-primary start-button"
          disabled={!host || online < 2}
          onClick={() => void send({ type: "start" })}
        >
          {host
            ? say(l, "Starta", "Start")
            : say(l, "Väntar på värden", "Waiting for the host")}
          <ArrowRight size={20} />
        </button>
        <span>
          {online < 2
            ? say(
                l,
                "Minst två behövs. Skicka länken!",
                "It takes two. Send the link!",
              )
            : `${online} ${say(l, "spelare redo.", "players ready.")}`}
        </span>
      </div>
    </section>
  );
}
function WordSelection({
  room,
  send,
  language: l,
  now,
}: {
  room: PublicRoom;
  send: SendAction;
  language: Language;
  now: number;
}) {
  const [word, setWord] = useState("");
  const [clue, setClue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const master = room.players.find((p) => p.id === room.masterId);
  const isMaster = room.selfId === room.masterId;
  const time = Math.max(0, Math.ceil((room.deadlineAt - now) / 1000));
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    await send({ type: "word", word, clue });
    setSubmitting(false);
  };
  if (!isMaster)
    return (
      <div className="waiting-scene phase-scene">
        <div className="waiting-avatar">
          <Avatar index={master?.avatar || 0} size="big" />
          <span className="thinking-dots">
            <i />
            <i />
            <i />
          </span>
        </div>
        <h1>
          {master?.nickname || "…"}
          <br />
          <span className="serif-emphasis">
            {say(l, "väljer ord.", "is choosing a word.")}
          </span>
        </h1>
        <div className="waiting-timer">
          <Timer size={16} />
          {time}s
        </div>
        <span className="small muted">
          {say(
            l,
            "Ett färdigt ord väljs automatiskt om tiden tar slut.",
            "A ready-made word is picked if time runs out.",
          )}
        </span>
        <Mascot mood="idle" compact className="waiting-mascot" />
      </div>
    );
  return (
    <section className="selection-scene phase-scene">
      <div className="section-heading">
        <span className="eyebrow">
          {say(l, "DIN TUR ATT VARA ORDMÄSTARE", "YOUR TURN TO BE WORD MASTER")}
        </span>
        <span className="time-pill">
          <Timer size={15} />
          {time}s
        </span>
      </div>
      <p>
        {say(
          l,
          "Gör det klurigt, inte omöjligt. Du får mästarbonus när någon lyckas lösa ordet.",
          "Make it tricky, not impossible. You earn a master bonus when someone solves it.",
        )}
      </p>
      <form onSubmit={submit} className="word-form">
        <label className="field">
          <span>
            {say(l, "Ditt hemliga ord", "Your secret word")}
            <span className="muted">
              {word.length}/{room.maxWordLength}
            </span>
          </span>
          <input
            autoComplete="off"
            autoFocus
            value={word}
            maxLength={room.maxWordLength}
            onChange={(e) => setWord(e.target.value.toLocaleUpperCase(l))}
            placeholder={say(
              l,
              "Till exempel KÖTTBULLE",
              "For example MEATBALL",
            )}
            required
            minLength={3}
          />
        </label>
        <label className="field">
          <span>
            {say(l, "En ärlig första ledtråd", "An honest first clue")}
          </span>
          <input
            value={clue}
            maxLength={90}
            onChange={(e) => setClue(e.target.value)}
            placeholder={say(l, "Svensk klassiker", "A Swedish classic")}
            required
            minLength={3}
          />
        </label>
        <button
          className="button button-primary full"
          disabled={
            submitting || word.trim().length < 3 || clue.trim().length < 3
          }
          type="submit"
        >
          {submitting
            ? say(l, "Gömmer ordet…", "Hiding the word…")
            : say(l, "Lås ordet & börja", "Lock it in & start")}
          <ArrowRight size={19} />
        </button>
      </form>
      {!!room.suggestions?.length && (
        <div className="word-suggestions">
          <span className="field-label">
            <Sparkles size={15} />
            {say(l, "FÖRSLAG", "SUGGESTIONS")}
          </span>
          <div>
            {room.suggestions.slice(0, 4).map((s) => (
              <button
                key={s.word}
                onClick={() => {
                  setWord(s.word);
                  setClue(s.clue);
                  audio.play("click");
                }}
              >
                {s.word}
                <Plus size={14} />
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
function WordTiles({
  letters,
  secret = false,
}: {
  letters: string[];
  secret?: boolean;
}) {
  const groups: string[][] = [[]];
  letters.forEach((l) => {
    if (l === " ") groups.push([]);
    else groups[groups.length - 1].push(l);
  });
  return (
    <div
      className={`word-tiles ${secret ? "secret-tiles" : ""}`}
      aria-label={letters.map((l) => (l === "_" ? "blank" : l)).join(" ")}
    >
      {groups.map((g, i) => (
        <div className="word-group" key={i}>
          {g.map((letter, j) => (
            <span
              key={`${i}-${j}`}
              className={`letter-tile ${letter !== "_" && letter !== "" ? "revealed" : ""} ${letter === "-" ? "hyphen-tile" : ""}`}
            >
              {letter === "_" ? <span className="letter-line" /> : letter}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}
function SabotageCards({
  room,
  send,
  language: l,
  now,
}: {
  room: PublicRoom;
  send: SendAction;
  language: Language;
  now: number;
}) {
  const [bluffOpen, setBluffOpen] = useState(false);
  const [bluff, setBluff] = useState("");
  const [truth, setTruth] = useState(false);
  const cd = Math.max(0, Math.ceil((room.cooldownUntil - now) / 1000));
  const disabled =
    cd > 0 || room.cardsRemaining === 0 || room.phase !== "playing";
  return (
    <section className="sabotage-section">
      <div className="section-heading">
        <span>
          <Zap size={16} />
          {say(l, "Sabotage", "Sabotage")}
        </span>
        <span>
          {cd
            ? `${cd}s ${say(l, "paus", "cooldown")}`
            : `${room.cardsRemaining}/3 ${say(l, "kort kvar", "cards left")}`}
        </span>
      </div>
      <div className="sabotage-cards">
        {CARDS.map((c, i) => {
          const used = room.usedCards.includes(c.id);
          const unavailable =
            (c.id === "fog" &&
              !Object.values(room.guessedLetters).some((g) => g.correct)) ||
            (c.id === "panic" && room.deadlineAt - now <= 16000);
          const Icon = c.icon;
          return (
            <button
              key={c.id}
              className={`sabotage-card card-${c.id} ${used ? "used" : ""}`}
              disabled={disabled || used || unavailable}
              onClick={() => {
                if (c.id === "bluff") setBluffOpen(!bluffOpen);
                else void send({ type: "sabotage", card: c.id });
              }}
              title={say(l, c.svText, c.enText)}
            >
              <span className="card-number">
                0{i + 1}
                {used && <Check size={12} />}
              </span>
              <Icon className="card-icon" size={25} />
              <strong>{say(l, c.sv, c.en)}</strong>
              <span className="card-description">
                {say(l, c.svText, c.enText)}
              </span>
            </button>
          );
        })}
      </div>
      {bluffOpen && !room.usedCards.includes("bluff") && (
        <form
          className="bluff-form"
          onSubmit={async (e) => {
            e.preventDefault();
            if (
              await send({
                type: "sabotage",
                card: "bluff",
                text: bluff,
                truth,
              })
            ) {
              setBluffOpen(false);
              setBluff("");
            }
          }}
        >
          <label className="field">
            <span>{say(l, "En misstänkt ledtråd", "One suspicious clue")}</span>
            <input
              autoFocus
              value={bluff}
              onChange={(e) => setBluff(e.target.value)}
              required
              minLength={3}
              maxLength={90}
              placeholder={say(
                l,
                "Det här kan bli intressant…",
                "This could get interesting…",
              )}
            />
          </label>
          <div className="bluff-options">
            <label>
              <input
                type="radio"
                name="bluffTruth"
                checked={!truth}
                onChange={() => setTruth(false)}
              />
              {say(l, "Jag bluffar", "It’s a bluff")}
            </label>
            <label>
              <input
                type="radio"
                name="bluffTruth"
                checked={truth}
                onChange={() => setTruth(true)}
              />
              {say(l, "Jag talar sanning", "It’s the truth")}
            </label>
            <button
              className="button button-dark"
              type="submit"
              disabled={disabled || bluff.trim().length < 3}
            >
              {say(l, "Skicka", "Send")}
              <Send size={15} />
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
function ActiveGame({
  room,
  send,
  language: l,
  now,
  mood,
}: {
  room: PublicRoom;
  send: SendAction;
  language: Language;
  now: number;
  mood: "idle" | "happy" | "panic" | "sabotage" | "win" | "lose";
}) {
  const [guess, setGuess] = useState("");
  const [sendingGuess, setSendingGuess] = useState(false);
  const isMaster = room.masterId === room.selfId;
  const self = room.players.find((p) => p.id === room.selfId);
  const counting = room.phase === "countdown";
  const time = Math.max(0, Math.ceil((room.deadlineAt - now) / 1000));
  const cd = Math.max(0, Math.ceil((room.fullGuessAvailableAt - now) / 1000));
  const chaos = room.effects.chaosUntil > now;
  const fog = room.effects.fogUntil > now;
  const panic = room.effects.panicUntil > now;
  const double = room.effects.doubleUntil > now;
  const bluff = room.effects.bluff;
  const alphabet =
    l === "sv" ? "ABCDEFGHIJKLMNOPQRSTUVWXYZÅÄÖ" : "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const keys = useMemo(() => {
    const letters = alphabet.split("");
    if (chaos && !isMaster) {
      let seed = room.effects.chaosUntil % 2147483647;
      for (let i = letters.length - 1; i > 0; i--) {
        seed = (seed * 16807) % 2147483647;
        const j = seed % (i + 1);
        [letters[i], letters[j]] = [letters[j], letters[i]];
      }
    }
    return letters;
  }, [alphabet, chaos, room.effects.chaosUntil, isMaster]);
  const canLetter = room.canGuess && !counting && room.letterAvailableAt <= now;
  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.closest(
          'input, textarea, select, [contenteditable="true"], dialog',
        )
      )
        return;
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      const letter = e.key.toLocaleUpperCase(l);
      if (
        letter.length === 1 &&
        alphabet.includes(letter) &&
        canLetter &&
        !room.guessedLetters[letter]
      ) {
        e.preventDefault();
        void send({ type: "letter", letter });
      }
    };
    document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
  }, [canLetter, room.guessedLetters, l, alphabet, send]);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!guess.trim() || cd || !room.canGuess) return;
    setSendingGuess(true);
    if (await send({ type: "solve", word: guess })) setGuess("");
    setSendingGuess(false);
  };
  return (
    <section className={`active-game ${panic ? "panic-active" : ""}`}>
      <div className="board-topline">
        <span className="role-label">
          {isMaster ? <Crown size={16} /> : <Eye size={16} />}{" "}
          {isMaster
            ? say(l, "DU ÄR ORDMÄSTAREN", "YOU’RE THE WORD MASTER")
            : `${say(l, "ORDMÄSTARE", "WORD MASTER")}: ${room.players.find((p) => p.id === room.masterId)?.nickname || "…"}`}
        </span>
        <div
          className={`game-timer ${time <= 15 && !counting ? "urgent" : ""}`}
        >
          <Timer size={18} />
          <span>
            {counting
              ? "—"
              : `${Math.floor(time / 60)}:${String(time % 60).padStart(2, "0")}`}
          </span>
        </div>
      </div>
      <div className="time-track">
        <div
          style={{
            width: `${counting ? 100 : Math.max(0, Math.min(100, (time / room.settings.roundSeconds) * 100))}%`,
          }}
        />
      </div>
      <div className="game-stage">
        <Mascot mood={counting ? "idle" : mood} mistakes={room.mistakes} />
        <div
          className="mistake-meter"
          aria-label={`${room.mistakes} ${say(l, "av", "of")} ${room.maxMistakes} ${say(l, "fel", "mistakes")}`}
        >
          <div>
            {Array.from({ length: room.maxMistakes }, (_, i) => (
              <span
                key={i}
                className={i < room.mistakes ? "mistake-used" : ""}
              />
            ))}
          </div>
          <span>
            {room.mistakes}/{room.maxMistakes} {say(l, "fel", "mistakes")}
          </span>
        </div>
        {counting && (
          <div className="countdown-overlay">
            <span>{say(l, "GÖR DIG REDO", "GET READY")}</span>
            <strong key={time}>{time || 1}</strong>
          </div>
        )}
      </div>
      <div className="puzzle-area">
        <div className="clue-label">{say(l, "LEDTRÅD", "THE CLUE")}</div>
        <p className="clue-text">“{room.clue}”</p>
        <WordTiles
          letters={
            isMaster && room.secretWord
              ? room.secretWord.split("")
              : room.maskedWord
          }
          secret={isMaster}
        />
        {isMaster && (
          <span className="secret-caption">
            <Eye size={12} />
            {say(l, "Bara du ser svaret", "Only you can see the answer")}
          </span>
        )}
        <div className="active-effects">
          {chaos && (
            <span>
              <Shuffle size={13} />
              {say(l, "KAOS", "CHAOS")} ·{" "}
              {Math.ceil((room.effects.chaosUntil - now) / 1000)}s
            </span>
          )}
          {fog && (
            <span>
              <Cloud size={13} />
              {say(l, "DIMMA", "FOG")} ·{" "}
              {Math.ceil((room.effects.fogUntil - now) / 1000)}s
            </span>
          )}
          {panic && (
            <span className="effect-panic">
              <Timer size={13} />
              {say(l, "PANIK · tiden återställs", "PANIC · time will return")}
            </span>
          )}
        </div>
      </div>
      {bluff && (
        <div className="bluff-notice">
          <div>
            <ShieldQuestion size={19} />
            <span className="field-label">
              {say(
                l,
                "MISSTÄNKT LEDTRÅD · KAN VARA EN BLUFF",
                "SUSPICIOUS CLUE · COULD BE A BLUFF",
              )}
            </span>
          </div>
          <p>“{bluff.text}”</p>
          {!isMaster && !self?.spectator && (
            <div className="vote-buttons">
              {bluff.yourVote ? (
                <span>
                  <Check size={15} />
                  {say(l, "Din röst är låst.", "Your vote is locked.")}
                </span>
              ) : (
                <>
                  <button
                    disabled={!room.canGuess || bluff.expiresAt <= now}
                    onClick={() =>
                      void send({ type: "bluffVote", vote: "truth" })
                    }
                  >
                    {say(l, "Jag tror på det", "I believe it")}
                  </button>
                  <button
                    disabled={!room.canGuess || bluff.expiresAt <= now}
                    onClick={() =>
                      void send({ type: "bluffVote", vote: "bluff" })
                    }
                  >
                    {say(l, "Det är en bluff", "That’s a bluff")}
                  </button>
                  <small>+25 / −10</small>
                </>
              )}
            </div>
          )}
        </div>
      )}
      {double && !isMaster && (
        <div className="double-notice">
          <Zap size={21} />
          <div>
            <strong>
              {say(l, "Dubbelt eller inget?", "Double or nothing?")}{" "}
              <span>{Math.ceil((room.effects.doubleUntil - now) / 1000)}s</span>
            </strong>
            <p>
              {say(
                l,
                "Lös hela ordet nu: dubbla poäng. Missa: −30.",
                "Solve the whole word now: double points. Miss: −30.",
              )}
            </p>
          </div>
          <button
            className="button button-dark"
            disabled={
              !room.canGuess ||
              room.effects.doubleParticipants.includes(room.selfId)
            }
            onClick={() => void send({ type: "doubleAccept" })}
          >
            {room.effects.doubleParticipants.includes(room.selfId)
              ? say(l, "Du är med!", "You’re in!")
              : say(l, "Jag vågar", "I’m in")}
          </button>
        </div>
      )}
      {isMaster ? (
        <>
          {room.settings.sabotage ? (
            <SabotageCards room={room} send={send} language={l} now={now} />
          ) : (
            <p className="spectator-message">
              {say(
                l,
                "Inga sabotage den här matchen.",
                "No sabotages this match.",
              )}
            </p>
          )}
        </>
      ) : self?.solved ? (
        <div className="solved-notice">
          <Check size={22} />
          <div>
            <strong>
              {say(l, "Du knäckte det!", "You cracked it!")}
            </strong>
          </div>
        </div>
      ) : self?.spectator ? (
        <div className="spectator-message">
          <Eye size={20} />
          {say(l, "Du hoppar in nästa runda.", "You’re in next round.")}
        </div>
      ) : (
        <div className="guess-controls">
          <div
            className={`letter-keyboard ${chaos ? "keyboard-chaos" : ""}`}
            aria-label={say(l, "Bokstavstangentbord", "Letter keyboard")}
          >
            {keys.map((letter) => {
              const guessed = room.guessedLetters[letter];
              return (
                <button
                  key={letter}
                  className={`letter-key ${guessed ? (guessed.correct ? "key-correct" : "key-wrong") : ""}`}
                  disabled={!!guessed || !canLetter}
                  onClick={() => void send({ type: "letter", letter })}
                  aria-label={`${letter}${guessed ? (guessed.correct ? say(l, ", rätt", ", correct") : say(l, ", fel", ", incorrect")) : ""}`}
                >
                  {letter}
                </button>
              );
            })}
          </div>
          <form className="solve-form" onSubmit={submit}>
            <input
              value={guess}
              onChange={(e) => setGuess(e.target.value)}
              maxLength={room.maxWordLength}
              autoComplete="off"
              disabled={counting || !room.canGuess}
              placeholder={say(
                l,
                "Jag vet hela ordet…",
                "I know the whole word…",
              )}
              aria-label={say(l, "Gissa hela ordet", "Guess the full word")}
            />
            <button
              className="button button-dark"
              type="submit"
              disabled={!guess.trim() || !!cd || !room.canGuess || sendingGuess}
            >
              {cd ? `${cd}s` : say(l, "Gissa", "Guess")}
              <ArrowRight size={17} />
            </button>
          </form>
        </div>
      )}
    </section>
  );
}
function Results({
  room,
  send,
  language: l,
  now,
}: {
  room: PublicRoom;
  send: SendAction;
  language: Language;
  now: number;
}) {
  const final = room.phase === "finished";
  const ranked = [...room.players].sort((a, b) => b.score - a.score);
  const top = ranked[0];
  const self = room.players.find((p) => p.id === room.selfId);
  const winners =
    room.result?.winners
      .map((id) => room.players.find((p) => p.id === id)?.nickname)
      .filter(Boolean) || [];
  const time = Math.max(0, Math.ceil((room.deadlineAt - now) / 1000));
  const winnerNames = ranked
    .filter((p) => p.score === top?.score)
    .map((p) => p.nickname)
    .join(" & ");
  return (
    <section className={`results-scene ${final ? "final-scene" : ""}`}>
      {(final || !!winners.length) && (
        <div className="confetti" aria-hidden="true">
          {Array.from({ length: 28 }, (_, i) => (
            <i
              key={i}
              style={
                {
                  "--i": i,
                  "--color": COLORS[i % COLORS.length],
                } as CSSProperties
              }
            />
          ))}
        </div>
      )}
      {final ? (
        <>
          <div className="winner-medallion">
            <Trophy size={29} />
            <Avatar index={top?.avatar || 0} size="big" />
          </div>
          <h1>
            {winnerNames}
            <br />
            <span className="serif-emphasis">
              {say(l, "äger sista ordet.", "has the last word.")}
            </span>
          </h1>
        </>
      ) : (
        <>
          <div className="result-mascot">
            <Mascot mood={winners.length ? "win" : "lose"} compact />
          </div>
          <h1>
            {winners.length
              ? say(l, "Ni knäckte det.", "You cracked it.")
              : room.result?.reason === "abandoned"
                ? say(l, "Rundan avbröts.", "Round skipped.")
                : say(l, "Ingen klarade det.", "Nobody got it.")}
          </h1>
          <span className="field-label">
            {say(l, "ORDET VAR", "THE WORD WAS")}
          </span>
          <div className="answer-reveal">{room.result?.answer || "—"}</div>
          <p>
            {winners.length
              ? `${winners.join(", ")} ${say(l, "löste ordet.", "solved it.")}`
              : say(
                  l,
                  "Ingen lösning. Ingen mästarbonus.",
                  "No solution. No master bonus.",
                )}
          </p>
          {room.effects.bluff && (
            <div className="bluff-reveal">
              <ShieldQuestion size={17} />
              {room.effects.bluff.truth
                ? say(
                    l,
                    "Den misstänkta ledtråden var sann.",
                    "The suspicious clue was true.",
                  )
                : say(
                    l,
                    "Japp. Ledtråden var en bluff.",
                    "Yep. That clue was a bluff.",
                  )}
            </div>
          )}
        </>
      )}
      <div className="results-scores">
        <Scoreboard room={room} now={now} language={l} full />
      </div>
      {!final && !!room.result?.funnyGuesses.length && (
        <div className="funny-guesses">
          <span className="field-label">
            {say(l, "FELGISSNINGAR", "WRONG GUESSES")}
          </span>
          {room.result.funnyGuesses.slice(0, 3).map((g, i) => (
            <p key={i}>
              <span>{g.nickname}</span>“{g.text}”
            </p>
          ))}
        </div>
      )}
      <div className="results-actions">
        {final ? (
          <>
            <button
              className="button button-primary"
              disabled={!!self?.rematch}
              onClick={() => void send({ type: "rematch" })}
            >
              {self?.rematch ? <Check size={19} /> : <RotateCcw size={19} />}{" "}
              {self?.rematch
                ? say(l, "Du vill ha revansch", "You voted for a rematch")
                : say(l, "Revansch", "Rematch")}
            </button>
            <span>
              {room.rematchVotes}/
              {room.players.filter((p) => p.connected).length}{" "}
              {say(l, "vill spela igen", "want a rematch")}
            </span>
          </>
        ) : (
          <>
            <button
              className="button button-primary"
              disabled={room.selfId !== room.hostId}
              onClick={() => void send({ type: "next" })}
            >
              {room.roundNo >= room.settings.rounds
                ? say(l, "Till finalresultatet", "Show final results")
                : say(l, "Nästa runda", "Next round")}
              <ArrowRight size={19} />
            </button>
            <span>
              {room.deadlineAt === 0
                ? say(l, "Väntar på fler spelare…", "Waiting for more players…")
                : `${say(l, "Fortsätter automatiskt om", "Continuing automatically in")} ${time}s`}
            </span>
          </>
        )}
      </div>
    </section>
  );
}
export function Game() {
  const {
    room,
    connection,
    error,
    busy,
    create,
    join,
    send,
    leave,
    clearError,
    now,
    inviteCode,
    setInviteCode,
  } = useRoom();
  const [language, setLanguage] = useState<Language>("sv");
  const [nickname, setNickname] = useState("");
  const [avatar, setAvatar] = useState(0);
  const [how, setHow] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyFallback, setCopyFallback] = useState("");
  const [volume, setVolume] = useState(0.35);
  const [muted, setMuted] = useState(false);
  const [joinMode, setJoinMode] = useState(false);
  const [eventMood, setEventMood] = useState<{
    mood: "idle" | "happy" | "panic" | "sabotage" | "win" | "lose";
    until: number;
  }>({ mood: "idle", until: 0 });
  const seen = useRef<Set<string>>(new Set());
  const audioInit = useRef(false);
  const lastTick = useRef(0);
  const preferenceReady = useRef(false);
  const l = room?.settings.language || language;
  useEffect(() => {
    try {
      const p = JSON.parse(localStorage.getItem("hangd.preferences") || "{}");
      if (p.nickname) setNickname(p.nickname);
      if (typeof p.avatar === "number") setAvatar(p.avatar);
      if (p.language === "en" || p.language === "sv") setLanguage(p.language);
      else if (!/^(sv|nb|nn|no|da)\b/i.test(navigator.language || "")) setLanguage("en");
      if (typeof p.volume === "number") {
        setVolume(p.volume);
        audio.setVolume(p.volume);
      }
      if (p.muted) {
        setMuted(true);
        audio.setMuted(true);
      }
    } catch {}
    preferenceReady.current = true;
  }, []);
  useEffect(() => {
    if (preferenceReady.current)
      try {
        localStorage.setItem(
          "hangd.preferences",
          JSON.stringify({ nickname, avatar, language, volume, muted }),
        );
      } catch {}
  }, [nickname, avatar, language, volume, muted]);
  useEffect(() => {
    if (inviteCode) setJoinMode(true);
  }, [inviteCode]);
  useEffect(() => {
    audio.setScene(
      room?.phase === "playing" || room?.phase === "countdown"
        ? "game"
        : room?.phase === "results" || room?.phase === "finished"
          ? "results"
          : "menu",
    );
  }, [room?.phase]);
  useEffect(() => {
    if (!room) {
      audioInit.current = false;
      seen.current.clear();
      return;
    }
    if (!audioInit.current) {
      room.events.forEach((e) => seen.current.add(e.id));
      audioInit.current = true;
      return;
    }
    for (const e of room.events) {
      if (seen.current.has(e.id)) continue;
      seen.current.add(e.id);
      if (e.type === "correct") {
        audio.play("correct");
        setEventMood({ mood: "happy", until: Date.now() + 1300 });
      } else if (e.type === "wrong") {
        audio.play("wrong");
        setEventMood({ mood: "panic", until: Date.now() + 1100 });
      } else if (e.type === "sabotage") {
        audio.play("sabotage");
        setEventMood({ mood: "sabotage", until: Date.now() + 1800 });
      } else if (e.type === "solved") {
        audio.play("win");
        setEventMood({ mood: "win", until: Date.now() + 1800 });
      } else if (e.type === "roundEnd")
        audio.play(room.result?.winners.length ? "win" : "lose");
      else if (e.type === "roundStart") audio.play("leaderboard");
    }
    if (seen.current.size > 500)
      seen.current = new Set(room.events.map((e) => e.id));
  }, [room]);
  useEffect(() => {
    if (room?.phase === "playing") {
      const s = Math.ceil((room.deadlineAt - now) / 1000);
      if (s > 0 && s <= 10 && lastTick.current !== s) {
        lastTick.current = s;
        audio.play("tick");
      }
    } else lastTick.current = 0;
  }, [room?.phase, room?.deadlineAt, now]);
  useEffect(() => {
    const unlock = () => {
      void audio.unlock();
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);
  useEffect(() => {
    document.documentElement.lang = l;
  }, [l]);
  const copy = async () => {
    if (!room) return;
    const link = `${location.origin}/?room=${room.code}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopyFallback(link);
    }
  };
  const enter = async (e: FormEvent) => {
    e.preventDefault();
    await audio.unlock();
    audio.play("click");
    if (joinMode) await join(inviteCode, nickname.trim(), avatar);
    else await create(nickname.trim(), avatar, language);
  };
  const remaining = room ? Math.ceil((room.deadlineAt - now) / 1000) : 100;
  const mood =
    eventMood.until > Date.now()
      ? eventMood.mood
      : remaining <= 15 && room?.phase === "playing"
        ? "panic"
        : "idle";
  return (
    <div className="hangd-app">
      <header className="site-header">
        <a
          className={`brand ${room ? "" : "brand-landing"}`}
          href="/"
          onClick={(e) => {
            e.preventDefault();
            if (!room) return;
            if (window.confirm(say(l, "Lämna rummet?", "Leave room?")))
              void leave();
          }}
          aria-label="Hängd"
        >
          <span className="brand-mark">
            <svg viewBox="0 0 28 28" fill="none">
              <path
                d="M4 15C3 5 10 2 17 4C25 6 27 18 21 23C14 29 5 23 4 15Z"
                fill="currentColor"
              />
              <path
                d="M10 11V14M18 11V14M11 19Q14 21 18 18"
                stroke="#f7f5ef"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </span>
          Hängd
        </a>
        <div className="header-right">
          {room && (
            <button className="header-room" onClick={copy}>
              <span className="tiny-dot" />
              {room.code}
              {copied ? <Check size={13} /> : <Copy size={13} />}
            </button>
          )}
          <button
            className="language-button"
            onClick={() => {
              if (!room) setLanguage(language === "sv" ? "en" : "sv");
              else setHow(true);
            }}
            aria-label={
              room ? say(l, "Spelregler", "Game rules") : "Switch language"
            }
          >
            {room ? (
              <HelpCircle size={19} />
            ) : (
              <>
                {language.toUpperCase()}
                <ChevronDown size={12} />
              </>
            )}
          </button>
          <details className="audio-details">
            <summary
              className="icon-button"
              aria-label={say(l, "Ljudinställningar", "Sound settings")}
            >
              {muted || volume === 0 ? (
                <VolumeX size={19} />
              ) : (
                <Volume2 size={19} />
              )}
            </summary>
            <div className="audio-popover">
              <div>
                <Music2 size={16} />
                <button
                  className="icon-button"
                  onClick={() => {
                    const m = !muted;
                    setMuted(m);
                    audio.setMuted(m);
                    void audio.unlock();
                  }}
                  aria-label={
                    muted
                      ? say(l, "Slå på ljud", "Unmute")
                      : say(l, "Stäng av ljud", "Mute")
                  }
                >
                  {muted ? <VolumeX size={17} /> : <Volume2 size={17} />}
                </button>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={volume}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setVolume(v);
                  audio.setVolume(v);
                  void audio.unlock();
                }}
                aria-label={say(l, "Volym", "Volume")}
              />
              <span>
                {muted
                  ? say(l, "Ljud av", "Muted")
                  : `${Math.round(volume * 100)}%`}
              </span>
            </div>
          </details>
          {room ? (
            <button
              className="icon-button leave-button"
              onClick={() => void leave()}
              aria-label={say(l, "Lämna rummet", "Leave room")}
              title={say(l, "Lämna rummet", "Leave room")}
            >
              <LogOut size={18} />
            </button>
          ) : (
            <button
              className="icon-button"
              onClick={() => setHow(true)}
              aria-label={say(l, "Så funkar det", "How to play")}
              title={say(l, "Så funkar det", "How to play")}
            >
              <HelpCircle size={19} />
            </button>
          )}
        </div>
      </header>
      {error && (
        <div className="error-banner" role="alert">
          <span>{localError(l, error)}</span>
          <button
            className="icon-button"
            onClick={clearError}
            aria-label={say(l, "Stäng felmeddelandet", "Dismiss error")}
          >
            <X size={17} />
          </button>
        </div>
      )}
      {room && connection !== "online" && (
        <div className="connection-banner" role="status">
          <span className="loading-dot" />
          {say(
            l,
            "Återansluter… ditt rum och dina poäng finns kvar.",
            "Reconnecting… your room and points are safe.",
          )}
        </div>
      )}
      {copyFallback && (
        <div className="copy-fallback">
          <label>
            {say(l, "Kopiera länken:", "Copy the link:")}
            <input
              value={copyFallback}
              readOnly
              onFocus={(e) => e.target.select()}
              autoFocus
            />
          </label>
          <button
            className="icon-button"
            onClick={() => setCopyFallback("")}
            aria-label={say(l, "Stäng", "Close")}
          >
            <X size={17} />
          </button>
        </div>
      )}
      {!room ? (
        <main className="landing">
          <section className="landing-copy">
            <h1>Hängd</h1>
            <p className="hero-description">
              {say(
                l,
                "Gissa ordet. Genomskåda bluffen.",
                "Guess the word. Call the bluff.",
              )}
            </p>
            <form className="entry-form" onSubmit={enter}>
              <label className="field nickname-field">
                <span>
                  {say(l, "Vad kallar vi dig?", "What do we call you?")}
                </span>
                <div>
                  <Avatar index={avatar} />
                  <input
                    autoComplete="nickname"
                    name="nickname"
                    minLength={2}
                    maxLength={18}
                    required
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    placeholder={say(l, "Ditt smeknamn", "Your nickname")}
                    aria-label={say(l, "Ditt smeknamn", "Your nickname")}
                  />
                </div>
              </label>
              <div
                className="avatar-selector"
                aria-label={say(l, "Välj din avatar", "Choose your avatar")}
              >
                {COLORS.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    className={avatar === i ? "selected" : ""}
                    onClick={() => {
                      setAvatar(i);
                      audio.play("click");
                    }}
                    aria-label={`${say(l, "Avatar", "Avatar")} ${i + 1}`}
                    aria-pressed={avatar === i}
                  >
                    <Avatar index={i} size="small" />
                    {avatar === i && <Check size={10} />}
                  </button>
                ))}
              </div>
              {joinMode && (
                <label className="field code-field">
                  <span>{say(l, "Rumskod", "Room code")}</span>
                  <input
                    value={inviteCode}
                    onChange={(e) =>
                      setInviteCode(
                        e.target.value
                          .toUpperCase()
                          .replace(/[^A-Z0-9]/g, "")
                          .slice(0, 6),
                      )
                    }
                    minLength={6}
                    maxLength={6}
                    required
                    placeholder="ABCDEF"
                    autoCapitalize="characters"
                    spellCheck={false}
                    aria-label={say(l, "Rumskod", "Room code")}
                  />
                </label>
              )}
              <button
                type="submit"
                className="button button-primary entry-submit"
                disabled={
                  busy ||
                  nickname.trim().length < 2 ||
                  (joinMode && inviteCode.length !== 6)
                }
              >
                {busy ? (
                  <span className="button-spinner" />
                ) : joinMode ? (
                  <ArrowRight size={20} />
                ) : (
                  <Plus size={20} />
                )}{" "}
                {busy
                  ? say(l, "Fixar ditt rum…", "Getting you in…")
                  : joinMode
                    ? say(l, "Hoppa in", "Join the room")
                    : say(l, "Skapa ett rum", "Create a room")}
              </button>
              <button
                className="join-toggle"
                type="button"
                onClick={() => {
                  setJoinMode(!joinMode);
                  clearError();
                  audio.play("click");
                }}
              >
                {joinMode
                  ? say(
                      l,
                      "Vill du skapa ett eget rum?",
                      "Want to create your own room?",
                    )
                  : say(
                      l,
                      "Har du en rumskod? Hoppa in",
                      "Have a room code? Join in",
                    )}
                <ArrowRight size={15} />
              </button>
            </form>
          </section>
          <section
            className="hero-illustration"
            aria-label={say(
              l,
              "Vår nervösa maskot väntar på nästa bokstav",
              "Our nervous mascot awaits the next letter",
            )}
          >
            <div className="hero-stage">
              <Mascot mood="idle" large />
              <span className="orbit orbit-one" />
              <span className="orbit orbit-two" />
              <div className="floating-letter letter-a">A</div>
              <div className="floating-letter letter-o">Ö</div>
              <div className="floating-letter letter-x">X</div>
            </div>
          </section>
        </main>
      ) : (
        <main className="room-layout">
          {room.phase !== "lobby" && (
            <div className="room-meta">
              <div>
                {`${say(l, "RUNDA", "ROUND")} ${room.roundNo} / ${room.settings.rounds}`}
              </div>
            </div>
          )}
          <div className="room-main">
            {room.phase === "lobby" ? (
              <Lobby
                room={room}
                send={send}
                language={l}
                copy={copy}
                copied={copied}
              />
            ) : room.phase === "choosing" ? (
              <WordSelection
                key={`${room.code}-${room.roundNo}`}
                room={room}
                send={send}
                language={l}
                now={now}
              />
            ) : room.phase === "playing" || room.phase === "countdown" ? (
              <ActiveGame
                key={`${room.code}-${room.roundNo}`}
                room={room}
                send={send}
                language={l}
                now={now}
                mood={mood}
              />
            ) : (
              <Results room={room} send={send} language={l} now={now} />
            )}
          </div>
          <aside className="room-sidebar">
            <Scoreboard room={room} language={l} now={now} />
            <Chat room={room} send={send} language={l} now={now} />
            <button className="sidebar-invite" onClick={copy}>
              {copied ? <Check size={15} /> : <Link2 size={15} />}{" "}
              {copied
                ? say(l, "Länken kopierad", "Link copied")
                : say(l, "Bjud in en till", "Invite another friend")}
            </button>
          </aside>
        </main>
      )}
      <HowTo open={how} onClose={() => setHow(false)} language={l} />
    </div>
  );
}
