import { DEFAULT_SETTINGS } from "./protocol";
import type {
  ChatMessage,
  GameAction,
  GameEvent,
  Phase,
  PublicEffects,
  PublicRoom,
  RoundResult,
  Sabotage,
  Settings,
} from "./protocol";
import { WORDS } from "./words";

export class GameError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "GameError";
    this.code = code;
    this.status = status;
  }
}

export interface NewPlayer {
  id: string;
  nickname: string;
  avatar: number;
  tokenHash: string;
}
export interface InternalPlayer extends NewPlayer {
  score: number;
  lastSeen: number;
  left: boolean;
  connected: boolean;
  joinedAt: number;
  solved: boolean;
  solvedAt: number;
  solvedBy: "word" | "letters" | null;
  roundStartScore: number;
  streak: number;
  spectator: boolean;
  typingUntil: number;
  reaction?: string;
  reactionUntil: number;
  rematch: boolean;
  lastLetterAt: number;
  lastSolveAt: number;
  lastChatAt: number;
  lastReactionAt: number;
  lastTypingAt: number;
  turns: number;
}
interface InternalBluff {
  id: string;
  text: string;
  expiresAt: number;
  truth: boolean;
  votes: Record<string, "truth" | "bluff">;
  settled: boolean;
}
interface InternalEffects extends Omit<PublicEffects, "bluff"> {
  bluff?: InternalBluff;
  panicOffset: number;
  doubleSettled: boolean;
}
export interface InternalRoom {
  code: string;
  version: number;
  phase: Phase;
  players: InternalPlayer[];
  settings: Settings;
  hostId: string;
  createdAt: number;
  updatedAt: number;
  roundNo: number;
  masterId: string | null;
  deadlineAt: number;
  playingStartedAt: number;
  secretWord: string;
  clue: string;
  guessedLetters: Record<string, { correct: boolean; playerId: string }>;
  mistakes: number;
  effects: InternalEffects;
  usedCards: Sabotage[];
  cooldownUntil: number;
  chat: ChatMessage[];
  events: GameEvent[];
  result?: RoundResult;
  usedWords: string[];
  wrongGuesses: { nickname: string; text: string }[];
  eventSeq: number;
  sabotageChecks: { at: number; progressAt: number; credited: boolean }[];
  lastProgressAt: number;
  sabotageDelayBonus: number;
}

const PRESENCE_MS = 20_000;
const LETTER_MS = 650;
const SOLVE_MS = 4_000;
const CARD_MS = 8_000;
const MAX_PLAYERS = 10;
const REACTIONS = ["😈", "😂", "👏", "😱", "🔥", "💀"];
const WORD_LIMITS = { easy: 20, normal: 28, hard: 36 };
const MISTAKE_LIMITS = { easy: 10, normal: 8, hard: 6 };
const CARDS: Sabotage[] = ["bluff", "panic", "chaos", "fog", "double"];
const BAD_WORDS =
  /(?:^|\s)(?:nigger|nigga|faggot|kike|nazi|hitler|neger|hora|horunge|bögjävel)(?:$|\s)/iu;
const LINK = /(?:https?:|www\.|[<>])/i;

function fail(code: string, message: string, status = 400): never {
  throw new GameError(code, message, status);
}
const compact = (value: string) =>
  value
    .normalize("NFC")
    .toLocaleUpperCase("sv")
    .replace(/[^A-ZÅÄÖ]/g, "");
const normalize = (value: string) =>
  value.normalize("NFC").trim().toLocaleUpperCase("sv").replace(/\s+/g, " ");
const eligible = (room: InternalRoom) =>
  room.players.filter((p) => !p.left && p.connected);
const guessers = (room: InternalRoom) =>
  room.players.filter((p) => !p.left && !p.spectator && p.id !== room.masterId);
const isRound = (phase: Phase) =>
  ["choosing", "countdown", "playing"].includes(phase);
const blankEffects = (): InternalEffects => ({
  chaosUntil: 0,
  fogUntil: 0,
  fogIndex: -1,
  panicUntil: 0,
  panicOffset: 0,
  doubleUntil: 0,
  doubleParticipants: [],
  doubleSettled: false,
});
const maxWordLength = (room: InternalRoom) =>
  WORD_LIMITS[room.settings.difficulty];
function event(
  room: InternalRoom,
  type: string,
  now: number,
  playerId?: string,
  text?: string,
) {
  room.events.push({
    id: `${room.roundNo}-${++room.eventSeq}`,
    type,
    at: now,
    ...(playerId ? { playerId } : {}),
    ...(text ? { text } : {}),
  });
  room.events = room.events.slice(-40);
}
function assertText(
  value: unknown,
  label: string,
  min: number,
  max: number,
): string {
  if (typeof value !== "string")
    fail("INVALID_TEXT", `${label} måste vara text. / ${label} must be text.`);
  const text = (value as string).normalize("NFC").trim().replace(/\s+/g, " ");
  if (text.length < min || text.length > max)
    fail("INVALID_LENGTH", `${label}: ${min}–${max} tecken / characters.`);
  if (LINK.test(text) || BAD_WORDS.test(text))
    fail(
      "UNSUITABLE_TEXT",
      "Välj en vänligare text utan länkar. / Choose friendly text without links.",
    );
  return text;
}
function nickname(value: unknown) {
  const name = assertText(value, "Namn / Nickname", 2, 18);
  if (!/^[\p{L}\p{N} _.-]+$/u.test(name))
    fail(
      "INVALID_NICKNAME",
      "Använd bokstäver och siffror i namnet. / Use letters and numbers in your nickname.",
    );
  return name;
}
function newPlayer(player: NewPlayer, now: number): InternalPlayer {
  return {
    ...player,
    nickname: nickname(player.nickname),
    avatar: Number.isInteger(player.avatar)
      ? Math.max(0, Math.min(7, player.avatar))
      : 0,
    score: 0,
    lastSeen: now,
    left: false,
    connected: true,
    joinedAt: now,
    solved: false,
    solvedAt: 0,
    solvedBy: null,
    roundStartScore: 0,
    streak: 0,
    spectator: false,
    typingUntil: 0,
    reactionUntil: 0,
    rematch: false,
    lastLetterAt: -1e12,
    lastSolveAt: -1e12,
    lastChatAt: -1e12,
    lastReactionAt: -1e12,
    lastTypingAt: -1e12,
    turns: 0,
  };
}
export function createRoom(
  code: string,
  player: NewPlayer,
  now: number,
): InternalRoom {
  const first = newPlayer(player, now);
  return {
    code,
    version: 0,
    phase: "lobby",
    players: [first],
    settings: { ...DEFAULT_SETTINGS },
    hostId: first.id,
    createdAt: now,
    updatedAt: now,
    roundNo: 0,
    masterId: null,
    deadlineAt: 0,
    playingStartedAt: 0,
    secretWord: "",
    clue: "",
    guessedLetters: {},
    mistakes: 0,
    effects: blankEffects(),
    usedCards: [],
    cooldownUntil: 0,
    chat: [],
    events: [],
    usedWords: [],
    wrongGuesses: [],
    eventSeq: 0,
    sabotageChecks: [],
    lastProgressAt: 0,
    sabotageDelayBonus: 0,
  };
}
export function joinRoom(
  room: InternalRoom,
  player: NewPlayer,
  now: number,
): void {
  const existing = room.players.find((p) => p.id === player.id);
  if (existing) {
    if (existing.tokenHash !== player.tokenHash)
      fail("UNAUTHORIZED", "Ogiltig spelsession. / Invalid session.", 401);
    if (
      existing.left &&
      room.players.filter((p) => !p.left).length >= MAX_PLAYERS
    )
      fail("ROOM_FULL", "Rummet är fullt. / The room is full.", 409);
    if (existing.left && isRound(room.phase)) existing.spectator = true;
    existing.left = false;
    existing.connected = true;
    existing.lastSeen = now;
    event(room, "join", now, existing.id);
    room.updatedAt = now;
    advance(room, now);
    return;
  }
  const name = nickname(player.nickname);
  if (room.players.filter((p) => !p.left).length >= MAX_PLAYERS)
    fail(
      "ROOM_FULL",
      "Rummet är fullt. Max 10 spelare. / Maximum 10 players.",
      409,
    );
  if (
    room.players.some(
      (p) =>
        !p.left &&
        p.nickname.toLocaleLowerCase("sv") === name.toLocaleLowerCase("sv"),
    )
  )
    fail(
      "NAME_TAKEN",
      "Namnet används redan. Välj ett annat. / That nickname is taken.",
      409,
    );
  // Discard old departed guests without removing anyone still in this round's result.
  if (room.players.length >= 30)
    room.players = room.players.filter(
      (p) => !p.left || p.id === room.masterId,
    );
  const joined = newPlayer({ ...player, nickname: name }, now);
  joined.spectator = room.phase !== "lobby" && room.phase !== "finished";
  room.players.push(joined);
  event(room, "join", now, joined.id);
  room.updatedAt = now;
  advance(room, now);
}
function suggestions(room: InternalRoom) {
  const options = WORDS[room.settings.language].filter(
    (w) =>
      w.word.length <= maxWordLength(room) &&
      !room.usedWords.includes(compact(w.word)),
  );
  if (!options.length) return WORDS[room.settings.language].slice(0, 3);
  const seed =
    room.code.split("").reduce((n, c) => n + c.charCodeAt(0), 0) +
    room.roundNo * 11;
  return [0, 1, 2]
    .slice(0, options.length)
    .map((_, i) => options[(seed + i * 7) % options.length]);
}
function validateWord(room: InternalRoom, input: unknown) {
  const word = normalize(
    assertText(input, "Ord / Word", 3, maxWordLength(room)),
  );
  const pattern =
    room.settings.language === "sv"
      ? /^[A-ZÅÄÖ]+(?:[ -][A-ZÅÄÖ]+)*$/
      : /^[A-Z]+(?:[ -][A-Z]+)*$/;
  if (!pattern.test(word))
    fail(
      "INVALID_WORD",
      "Använd språkets bokstäver, blanksteg eller bindestreck. / Use the selected language’s letters, spaces or hyphens.",
    );
  const letters = compact(word);
  if (
    letters.length < 3 ||
    new Set(letters).size < 2 ||
    !/[AEIOUYÅÄÖ]/.test(letters) ||
    word.split(/[ -]/).length > 5
  )
    fail(
      "UNFAIR_WORD",
      "Välj ett riktigt, gissningsbart ord. / Choose a real, guessable word.",
    );
  if (room.usedWords.includes(letters))
    fail(
      "REPEATED_WORD",
      "Det ordet har redan spelats. / That word has already been played.",
    );
  return word;
}
function safeClue(
  room: InternalRoom,
  input: unknown,
  answer = room.secretWord,
) {
  const clue = assertText(input, "Ledtråd / Clue", 3, 90);
  if (answer && compact(clue).includes(compact(answer)))
    fail(
      "ANSWER_IN_CLUE",
      "Ledtråden avslöjar svaret. / The clue contains the answer.",
    );
  return clue;
}
function beginRound(room: InternalRoom, now: number) {
  const connected = eligible(room);
  if (connected.length < 2)
    fail(
      "NEED_PLAYERS",
      "Minst två spelare måste vara anslutna. / At least two players must be connected.",
      409,
    );
  const minTurns = Math.min(...connected.map((p) => p.turns));
  const master = connected.find((p) => p.turns === minTurns)!;
  master.turns++;
  room.roundNo++;
  room.phase = "choosing";
  room.masterId = master.id;
  room.deadlineAt = now + 45_000;
  room.secretWord = "";
  room.clue = "";
  room.guessedLetters = {};
  room.mistakes = 0;
  room.effects = blankEffects();
  room.usedCards = [];
  room.cooldownUntil = 0;
  room.playingStartedAt = 0;
  room.wrongGuesses = [];
  delete room.result;
  room.sabotageChecks = [];
  room.lastProgressAt = now;
  room.sabotageDelayBonus = 0;
  for (const p of room.players) {
    p.solved = false;
    p.solvedAt = 0;
    p.solvedBy = null;
    p.streak = 0;
    p.roundStartScore = p.score;
    p.spectator = p.left || !p.connected;
    p.lastLetterAt = -1e12;
    p.lastSolveAt = -1e12;
    p.typingUntil = 0;
  }
  event(room, "roundStart", now, master.id);
}
function chooseWord(
  room: InternalRoom,
  word: string,
  clue: string,
  now: number,
) {
  room.secretWord = word;
  room.clue = clue;
  room.usedWords.push(compact(word));
  room.phase = "countdown";
  room.deadlineAt = now + 3_000;
  room.players.forEach((p) => {
    p.typingUntil = 0;
  });
  event(room, "wordReady", now, room.masterId || undefined);
}
function settleDouble(room: InternalRoom) {
  if (!room.effects.doubleUntil || room.effects.doubleSettled) return;
  for (const id of room.effects.doubleParticipants) {
    const p = room.players.find((x) => x.id === id);
    if (
      p &&
      !(
        p.solved &&
        p.solvedBy === "word" &&
        p.solvedAt <= room.effects.doubleUntil
      )
    )
      p.score -= 30;
  }
  room.effects.doubleSettled = true;
}
function finishRound(
  room: InternalRoom,
  reason: RoundResult["reason"],
  now: number,
) {
  if (
    room.phase !== "playing" &&
    room.phase !== "countdown" &&
    room.phase !== "choosing"
  )
    return;
  settleDouble(room);
  const bluff = room.effects.bluff;
  if (bluff && !bluff.settled) {
    for (const [id, vote] of Object.entries(bluff.votes)) {
      const p = room.players.find((x) => x.id === id);
      if (p) p.score += (vote === "truth") === bluff.truth ? 25 : -10;
    }
    bluff.settled = true;
  }
  const winners = room.players
    .filter((p) => p.solved)
    .sort((a, b) => a.solvedAt - b.solvedAt)
    .map((p) => p.id);
  const elapsed = Math.max(
    0,
    Math.min(room.settings.roundSeconds, (now - room.playingStartedAt) / 1000),
  );
  // No points for an impossible/stalled word; rewards require a real solver.
  const masterBonus =
    winners.length && reason !== "abandoned"
      ? 35 + Math.min(35, Math.floor(elapsed / 2)) + room.sabotageDelayBonus
      : 0;
  const master = room.players.find((p) => p.id === room.masterId);
  if (master) master.score += masterBonus;
  room.result = {
    answer: room.secretWord,
    reason,
    winners,
    deltas: Object.fromEntries(
      room.players.map((p) => [p.id, p.score - p.roundStartScore]),
    ),
    funnyGuesses: room.wrongGuesses.slice(-5),
    masterBonus,
  };
  room.phase = "results";
  room.deadlineAt = now + 12_000;
  room.effects.panicUntil = 0;
  room.effects.panicOffset = 0;
  room.effects.fogUntil = 0;
  room.effects.chaosUntil = 0;
  event(room, "roundEnd", now, winners[0], reason);
}
function revealComplete(room: InternalRoom) {
  return (
    !!room.secretWord &&
    [...room.secretWord].every(
      (c) => /[ -]/.test(c) || room.guessedLetters[c]?.correct,
    )
  );
}
function solve(
  room: InternalRoom,
  player: InternalPlayer,
  now: number,
  fullWord = true,
) {
  if (player.solved) return;
  const first = !room.players.some((p) => p.solved);
  const remaining = Math.max(0, room.deadlineAt - now);
  const speed = Math.round(
    70 * Math.min(1, remaining / (room.settings.roundSeconds * 1000)),
  );
  let points = 100 + speed + (first ? 25 : 0);
  if (
    fullWord &&
    room.effects.doubleUntil > now &&
    room.effects.doubleParticipants.includes(player.id)
  )
    points *= 2;
  player.score += points;
  player.solved = true;
  player.solvedAt = now;
  player.solvedBy = fullWord ? "word" : "letters";
  player.typingUntil = 0;
  room.lastProgressAt = now;
  event(room, "solved", now, player.id);
}
function completeIfNeeded(room: InternalRoom, now: number) {
  const activeGuessers = guessers(room).filter((p) => p.connected);
  if (
    revealComplete(room) ||
    (activeGuessers.length > 0 && activeGuessers.every((p) => p.solved))
  )
    finishRound(room, "solved", now);
  else if (room.mistakes >= MISTAKE_LIMITS[room.settings.difficulty])
    finishRound(room, "mistakes", now);
}
function restart(room: InternalRoom, now: number) {
  room.players = room.players.filter((p) => !p.left);
  for (const p of room.players) {
    p.score = 0;
    p.turns = 0;
    p.rematch = false;
    p.roundStartScore = 0;
  }
  room.roundNo = 0;
  room.usedWords = [];
  room.chat = [];
  event(room, "rematch", now);
  beginRound(room, now);
}
function checkRematch(room: InternalRoom, now: number) {
  if (room.phase !== "finished") return;
  const online = eligible(room);
  const votes = online.filter((p) => p.rematch).length;
  if (
    online.length >= 2 &&
    votes >= Math.max(2, Math.floor(online.length / 2) + 1)
  )
    restart(room, now);
}

/** All deadlines are absolute server timestamps, so suspended tabs cannot pause the game. */
export function advance(room: InternalRoom, now: number): boolean {
  let changed = false;
  for (const p of room.players) {
    const connected = !p.left && now - p.lastSeen <= PRESENCE_MS;
    if (p.connected !== connected) {
      p.connected = connected;
      changed = true;
    }
  }
  const online = eligible(room);
  if (!online.some((p) => p.id === room.hostId) && online.length) {
    room.hostId = online[0].id;
    event(room, "host", now, room.hostId);
    changed = true;
  }
  if (room.phase === "choosing" && now >= room.deadlineAt) {
    const fallback = suggestions(room)[0];
    chooseWord(room, fallback.word, fallback.clue, now);
    changed = true;
  } else if (room.phase === "countdown" && now >= room.deadlineAt) {
    const start = room.deadlineAt;
    room.phase = "playing";
    room.playingStartedAt = start;
    room.deadlineAt = start + room.settings.roundSeconds * 1000;
    room.lastProgressAt = start;
    event(room, "playing", now);
    changed = true;
  }
  if (room.phase === "playing") {
    if (room.effects.panicUntil && now >= room.effects.panicUntil) {
      room.effects.panicUntil = 0;
      room.effects.panicOffset = 0;
      changed = true;
    }
    if (room.effects.chaosUntil && now >= room.effects.chaosUntil) {
      room.effects.chaosUntil = 0;
      changed = true;
    }
    if (room.effects.fogUntil && now >= room.effects.fogUntil) {
      room.effects.fogUntil = 0;
      room.effects.fogIndex = -1;
      changed = true;
    }
    if (
      room.effects.doubleUntil &&
      !room.effects.doubleSettled &&
      now >= room.effects.doubleUntil
    ) {
      settleDouble(room);
      changed = true;
    }
    for (const check of room.sabotageChecks) {
      if (!check.credited && now >= check.at + 6_000) {
        check.credited = true;
        if (room.lastProgressAt === check.progressAt)
          room.sabotageDelayBonus += 5;
        changed = true;
      }
    }
    if (now >= room.deadlineAt) {
      finishRound(room, "time", now);
      changed = true;
    } else if (online.length && !guessers(room).some((p) => p.connected)) {
      finishRound(room, "abandoned", now);
      changed = true;
    } else {
      const previous = room.phase;
      completeIfNeeded(room, now);
      if (room.phase !== previous) changed = true;
    }
  }
  if (
    room.phase === "results" &&
    room.deadlineAt !== 0 &&
    now >= room.deadlineAt
  ) {
    if (room.roundNo >= room.settings.rounds) {
      room.phase = "finished";
      room.deadlineAt = 0;
      event(room, "finished", now);
    } else if (online.length >= 2) beginRound(room, now);
    else room.deadlineAt = 0;
    changed = true;
  } else if (
    room.phase === "results" &&
    room.deadlineAt === 0 &&
    online.length >= 2
  ) {
    room.deadlineAt = now + 3_000;
    changed = true;
  }
  if (room.phase === "finished") {
    const phase = room.phase;
    checkRematch(room, now);
    if (room.phase !== phase) changed = true;
  }
  if (changed) room.updatedAt = now;
  return changed;
}

function requireHost(room: InternalRoom, player: InternalPlayer) {
  if (room.hostId !== player.id)
    fail(
      "HOST_ONLY",
      "Bara värden kan göra det. / Only the host can do that.",
      403,
    );
}
function requireGuesser(room: InternalRoom, player: InternalPlayer) {
  if (room.phase !== "playing")
    fail(
      "NOT_PLAYING",
      "Vänta tills rundan börjar. / Wait for the round to start.",
      409,
    );
  if (player.id === room.masterId || player.spectator || player.solved)
    fail(
      "CANNOT_GUESS",
      "Du kan inte gissa just nu. / You cannot guess right now.",
      403,
    );
}
function updateSettings(room: InternalRoom, input: Partial<Settings>) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    fail("INVALID_SETTINGS", "Ogiltiga inställningar. / Invalid settings.");
  const next = { ...room.settings };
  if ("rounds" in input) {
    if (
      !Number.isInteger(input.rounds) ||
      input.rounds! < 2 ||
      input.rounds! > 20
    )
      fail("INVALID_ROUNDS", "Välj 2–20 rundor. / Choose 2–20 rounds.");
    next.rounds = input.rounds!;
  }
  if ("roundSeconds" in input) {
    if (![30, 45, 60, 75, 90, 120].includes(input.roundSeconds!))
      fail("INVALID_TIME", "Ogiltig rundtid. / Invalid round duration.");
    next.roundSeconds = input.roundSeconds!;
  }
  if ("language" in input) {
    if (input.language !== "sv" && input.language !== "en")
      fail(
        "INVALID_LANGUAGE",
        "Välj svenska eller engelska. / Choose Swedish or English.",
      );
    next.language = input.language;
  }
  if ("difficulty" in input) {
    if (!["easy", "normal", "hard"].includes(input.difficulty!))
      fail(
        "INVALID_DIFFICULTY",
        "Ogiltig svårighetsgrad. / Invalid difficulty.",
      );
    next.difficulty = input.difficulty!;
  }
  if ("sabotage" in input) {
    if (typeof input.sabotage !== "boolean")
      fail(
        "INVALID_SABOTAGE",
        "Ogiltig sabotageinställning. / Invalid sabotage setting.",
      );
    next.sabotage = input.sabotage;
  }
  room.settings = next;
}

export function act(
  room: InternalRoom,
  playerId: string,
  action: GameAction,
  now: number,
): void {
  const player = room.players.find((p) => p.id === playerId);
  if (!player || player.left)
    fail(
      "NOT_IN_ROOM",
      "Du är inte med i rummet. / You are not in this room.",
      403,
    );
  // Refresh presence before evaluating missing-player transitions, but never before deadline adjudication.
  player.lastSeen = now;
  player.connected = true;
  advance(room, now);
  if (!action || typeof action !== "object" || typeof action.type !== "string")
    fail("INVALID_ACTION", "Ogiltig handling. / Invalid action.");
  switch (action.type) {
    case "heartbeat":
      break;
    case "settings":
      requireHost(room, player);
      if (room.phase !== "lobby")
        fail(
          "MATCH_STARTED",
          "Inställningarna låses när matchen börjar. / Settings are locked during the match.",
          409,
        );
      updateSettings(room, action.settings);
      break;
    case "start":
      requireHost(room, player);
      if (room.phase !== "lobby")
        fail(
          "MATCH_STARTED",
          "Matchen har redan startat. / The match has started.",
          409,
        );
      beginRound(room, now);
      break;
    case "word": {
      if (room.phase !== "choosing" || room.masterId !== player.id)
        fail(
          "MASTER_ONLY",
          "Bara ordmästaren väljer ord. / Only the Word Master chooses the word.",
          403,
        );
      const word = validateWord(room, action.word),
        clue = safeClue(room, action.clue, word);
      chooseWord(room, word, clue, now);
      break;
    }
    case "letter": {
      requireGuesser(room, player);
      if (now - player.lastLetterAt < LETTER_MS)
        fail(
          "LETTER_COOLDOWN",
          "En bokstav i taget. / One letter at a time.",
          429,
        );
      if (typeof action.letter !== "string")
        fail("INVALID_LETTER", "Ogiltig bokstav. / Invalid letter.");
      const letter = normalize(action.letter);
      if (
        !(room.settings.language === "sv" ? /^[A-ZÅÄÖ]$/ : /^[A-Z]$/).test(
          letter,
        )
      )
        fail("INVALID_LETTER", "Ogiltig bokstav. / Invalid letter.");
      if (room.guessedLetters[letter])
        fail(
          "ALREADY_GUESSED",
          "Bokstaven har redan gissats. / That letter has already been guessed.",
          409,
        );
      player.lastLetterAt = now;
      const correct = room.secretWord.includes(letter);
      room.guessedLetters[letter] = { correct, playerId: player.id };
      if (correct) {
        player.streak++;
        player.score += 10 + Math.min(15, Math.max(0, player.streak - 1) * 3);
        room.lastProgressAt = now;
        event(room, "correct", now, player.id, letter);
        if (revealComplete(room)) solve(room, player, now, false);
      } else {
        player.streak = 0;
        room.mistakes++;
        event(room, "wrong", now, player.id, letter);
      }
      completeIfNeeded(room, now);
      break;
    }
    case "solve": {
      requireGuesser(room, player);
      if (now - player.lastSolveAt < SOLVE_MS)
        fail(
          "SOLVE_COOLDOWN",
          "Vänta fyra sekunder mellan hela ord. / Wait four seconds between full-word guesses.",
          429,
        );
      const word = normalize(
        assertText(action.word, "Gissning / Guess", 2, 40),
      );
      if (
        !(
          room.settings.language === "sv" ? /^[A-ZÅÄÖ -]+$/ : /^[A-Z -]+$/
        ).test(word)
      )
        fail("INVALID_WORD", "Använd bara bokstäver. / Use letters only.");
      player.lastSolveAt = now;
      if (word === room.secretWord) {
        solve(room, player, now);
        completeIfNeeded(room, now);
      } else {
        player.score -= 10;
        player.streak = 0;
        room.wrongGuesses.push({ nickname: player.nickname, text: word });
        room.wrongGuesses = room.wrongGuesses.slice(-20);
        event(room, "wrong", now, player.id);
      }
      break;
    }
    case "sabotage": {
      if (room.phase !== "playing" || player.id !== room.masterId)
        fail(
          "MASTER_ONLY",
          "Bara ordmästaren får sabotera. / Only the Word Master can sabotage.",
          403,
        );
      if (!room.settings.sabotage)
        fail("SABOTAGE_OFF", "Sabotage är avstängt. / Sabotage is disabled.");
      if (!CARDS.includes(action.card))
        fail("INVALID_CARD", "Ogiltigt kort. / Invalid card.");
      if (room.usedCards.length >= 3 || room.usedCards.includes(action.card))
        fail(
          "CARD_USED",
          "Kortet är använt eller slut. / That card is used or your hand is empty.",
          409,
        );
      if (now < room.cooldownUntil)
        fail(
          "CARD_COOLDOWN",
          "Vänta mellan sabotage. / Wait between sabotage cards.",
          429,
        );
      if (action.card === "bluff") {
        const text = safeClue(room, action.text);
        if (typeof action.truth !== "boolean")
          fail(
            "INVALID_BLUFF",
            "Markera sant eller bluff. / Mark the clue as true or a bluff.",
          );
        room.effects.bluff = {
          id: `${room.roundNo}-bluff`,
          text,
          truth: action.truth,
          expiresAt: Math.min(room.deadlineAt, now + 15_000),
          votes: {},
          settled: false,
        };
      } else if (action.card === "panic") {
        if (room.deadlineAt - now <= 16_000)
          fail(
            "TOO_LATE",
            "Panik kräver mer än 16 sekunder kvar. / Panic needs more than 16 seconds remaining.",
          );
        room.effects.panicUntil = now + 5_000;
        room.effects.panicOffset = 8_000;
      } else if (action.card === "chaos") room.effects.chaosUntil = now + 8_000;
      else if (action.card === "fog") {
        const index = [...room.secretWord].findIndex(
          (c) => room.guessedLetters[c]?.correct,
        );
        if (index < 0)
          fail(
            "NOTHING_TO_HIDE",
            "Avslöja en bokstav först. / A letter must be revealed first.",
          );
        room.effects.fogIndex = index;
        room.effects.fogUntil = now + 6_000;
      } else if (action.card === "double") {
        if (room.deadlineAt - now < 11_000)
          fail(
            "TOO_LATE",
            "Utmaningen behöver minst 11 sekunder kvar. / The challenge needs at least 11 seconds remaining.",
          );
        room.effects.doubleUntil = now + 10_000;
        room.effects.doubleParticipants = [];
        room.effects.doubleSettled = false;
      }
      room.usedCards.push(action.card);
      room.cooldownUntil = now + CARD_MS;
      room.sabotageChecks.push({
        at: now,
        progressAt: room.lastProgressAt,
        credited: false,
      });
      event(room, "sabotage", now, player.id, action.card);
      break;
    }
    case "bluffVote": {
      requireGuesser(room, player);
      const bluff = room.effects.bluff;
      if (!bluff || now >= bluff.expiresAt)
        fail(
          "NO_BLUFF",
          "Bluffomröstningen är stängd. / The bluff vote is closed.",
          409,
        );
      if (action.vote !== "truth" && action.vote !== "bluff")
        fail("INVALID_VOTE", "Ogiltig röst. / Invalid vote.");
      if (bluff.votes[player.id])
        fail(
          "ALREADY_VOTED",
          "Du har redan röstat. / You have already voted.",
          409,
        );
      bluff.votes[player.id] = action.vote;
      break;
    }
    case "doubleAccept":
      requireGuesser(room, player);
      if (room.effects.doubleUntil <= now || room.effects.doubleSettled)
        fail(
          "NO_CHALLENGE",
          "Utmaningen är stängd. / The challenge is closed.",
          409,
        );
      if (room.effects.doubleParticipants.includes(player.id))
        fail(
          "ALREADY_ACCEPTED",
          "Du är redan med. / You already accepted.",
          409,
        );
      room.effects.doubleParticipants.push(player.id);
      break;
    case "chat": {
      if (now - player.lastChatAt < 1_200)
        fail(
          "CHAT_COOLDOWN",
          "Ta ett andetag mellan meddelanden. / Give chat a moment.",
          429,
        );
      if (isRound(room.phase) && (player.id === room.masterId || player.solved))
        fail(
          "CHAT_LOCKED",
          "Chatten öppnas efter rundan för dig som vet svaret. / Chat reopens after the round for players who know the answer.",
          403,
        );
      const text = assertText(action.text, "Meddelande / Message", 1, 180);
      if (
        isRound(room.phase) &&
        room.secretWord &&
        compact(text).includes(compact(room.secretWord))
      )
        fail(
          "ANSWER_IN_CHAT",
          "Skicka svaret som en ordgissning. / Submit the answer as a full-word guess.",
        );
      player.lastChatAt = now;
      player.typingUntil = 0;
      room.chat.push({
        id: `m-${++room.eventSeq}`,
        playerId: player.id,
        nickname: player.nickname,
        text,
        at: now,
      });
      room.chat = room.chat.slice(-60);
      event(room, "chat", now, player.id);
      break;
    }
    case "typing":
      if (now - player.lastTypingAt < 1_000) break;
      player.lastTypingAt = now;
      player.typingUntil =
        action.active === true &&
        !(isRound(room.phase) && (player.id === room.masterId || player.solved))
          ? now + 3_500
          : 0;
      break;
    case "reaction":
      if (now - player.lastReactionAt < 1_500)
        fail(
          "REACTION_COOLDOWN",
          "En reaktion i taget. / One reaction at a time.",
          429,
        );
      if (!REACTIONS.includes(action.emoji))
        fail("INVALID_REACTION", "Ogiltig reaktion. / Invalid reaction.");
      player.lastReactionAt = now;
      player.reaction = action.emoji;
      player.reactionUntil = now + 3_000;
      event(room, "reaction", now, player.id, action.emoji);
      break;
    case "next":
      requireHost(room, player);
      if (room.phase !== "results")
        fail(
          "NOT_RESULTS",
          "Vänta tills rundan är slut. / Wait for the round results.",
          409,
        );
      if (room.roundNo >= room.settings.rounds) {
        room.phase = "finished";
        room.deadlineAt = 0;
        event(room, "finished", now);
      } else beginRound(room, now);
      break;
    case "rematch":
      if (room.phase !== "finished")
        fail(
          "NOT_FINISHED",
          "Matchen är inte slut. / The match is not over.",
          409,
        );
      player.rematch = true;
      checkRematch(room, now);
      break;
    case "leave":
      player.left = true;
      player.connected = false;
      player.typingUntil = 0;
      player.rematch = false;
      event(room, "leave", now, player.id);
      advance(room, now);
      break;
    default:
      fail("INVALID_ACTION", "Okänd handling. / Unknown action.");
  }
  room.updatedAt = now;
}

/** Explicit allowlist: never serialize the internal room, tokens, wrong guesses, or other players' choices. */
export function publicRoom(
  room: InternalRoom,
  playerId: string,
  now: number,
): PublicRoom {
  const self = room.players.find((p) => p.id === playerId && !p.left);
  if (!self)
    fail(
      "NOT_IN_ROOM",
      "Du är inte med i rummet. / You are not in this room.",
      403,
    );
  const revealing = room.phase === "results" || room.phase === "finished";
  const bluff = room.effects.bluff;
  const maskedWord = [...room.secretWord].map((c, i) => {
    if (revealing || /[ -]/.test(c)) return c;
    if (
      room.effects.fogUntil > now &&
      i === room.effects.fogIndex &&
      self.id !== room.masterId
    )
      return "_";
    return room.guessedLetters[c]?.correct ? c : "_";
  });
  const effects: PublicEffects = {
    chaosUntil: room.effects.chaosUntil,
    fogUntil: room.effects.fogUntil,
    fogIndex: room.effects.fogIndex,
    panicUntil: room.effects.panicUntil,
    doubleUntil: room.effects.doubleUntil,
    doubleParticipants: [...room.effects.doubleParticipants],
    ...(bluff
      ? {
          bluff: {
            id: bluff.id,
            text: bluff.text,
            expiresAt: bluff.expiresAt,
            ...(bluff.votes[playerId]
              ? { yourVote: bluff.votes[playerId] }
              : {}),
            ...(revealing || room.masterId === playerId
              ? { truth: bluff.truth }
              : {}),
          },
        }
      : {}),
  };
  const view: PublicRoom = {
    code: room.code,
    version: room.version,
    phase: room.phase,
    hostId: room.hostId,
    selfId: playerId,
    players: room.players
      .filter(
        (p) =>
          !p.left ||
          (isRound(room.phase) && !p.spectator) ||
          !!room.result?.deltas[p.id],
      )
      .map((p) => ({
        id: p.id,
        nickname: p.nickname,
        avatar: p.avatar,
        score: p.score,
        connected: p.connected && !p.left,
        isHost: p.id === room.hostId,
        isMaster: p.id === room.masterId,
        solved: p.solved,
        delta: p.score - p.roundStartScore,
        streak: p.streak,
        spectator: p.spectator || p.left,
        typingUntil: p.typingUntil,
        reaction: p.reaction,
        reactionUntil: p.reactionUntil,
        rematch: p.rematch,
      })),
    settings: { ...room.settings },
    roundNo: room.roundNo,
    masterId: room.masterId,
    deadlineAt:
      room.deadlineAt -
      (room.phase === "playing" && room.effects.panicUntil > now
        ? room.effects.panicOffset
        : 0),
    serverNow: now,
    maskedWord,
    clue: room.phase === "choosing" ? "" : room.clue,
    guessedLetters: Object.fromEntries(
      Object.entries(room.guessedLetters).map(([letter, info]) => [
        letter,
        { correct: info.correct, playerId: info.playerId },
      ]),
    ),
    mistakes: room.mistakes,
    maxMistakes: MISTAKE_LIMITS[room.settings.difficulty],
    effects,
    usedCards: [...room.usedCards],
    cardsRemaining: room.settings.sabotage
      ? Math.max(0, 3 - room.usedCards.length)
      : 0,
    cooldownUntil: room.cooldownUntil,
    chat: room.chat.map((m) => ({ ...m })),
    events: room.events.map((e) => ({ ...e })),
    ...(revealing && room.result
      ? {
          result: {
            ...room.result,
            winners: [...room.result.winners],
            deltas: { ...room.result.deltas },
            funnyGuesses: room.result.funnyGuesses.map((g) => ({ ...g })),
          },
        }
      : {}),
    fullGuessAvailableAt: self.lastSolveAt + SOLVE_MS,
    letterAvailableAt: self.lastLetterAt + LETTER_MS,
    canGuess:
      room.phase === "playing" &&
      !self.spectator &&
      !self.solved &&
      room.masterId !== playerId,
    maxWordLength: maxWordLength(room),
    rematchVotes: eligible(room).filter((p) => p.rematch).length,
  };
  if (room.masterId === playerId && isRound(room.phase))
    view.secretWord = room.secretWord;
  if (room.masterId === playerId && room.phase === "choosing")
    view.suggestions = suggestions(room).map((w) => ({ ...w }));
  return view;
}
