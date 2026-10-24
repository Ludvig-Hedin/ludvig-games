import test from "node:test";
import assert from "node:assert/strict";
import {
  act,
  advance,
  createRoom,
  GameError,
  joinRoom,
  publicRoom,
} from "../lib/engine";
import type { InternalRoom, NewPlayer } from "../lib/engine";

const T = 1_700_000_000_000;
const players: NewPlayer[] = [
  {
    id: "ada",
    nickname: "Ada",
    avatar: 0,
    tokenHash: "ada-private-token-hash",
  },
  { id: "bo", nickname: "Bo", avatar: 1, tokenHash: "bo-private-token-hash" },
  {
    id: "cleo",
    nickname: "Cleo",
    avatar: 2,
    tokenHash: "cleo-private-token-hash",
  },
  {
    id: "dan",
    nickname: "Dan",
    avatar: 3,
    tokenHash: "dan-private-token-hash",
  },
];
function roomWith(count = 2) {
  const room = createRoom("ABCDEF", players[0], T);
  for (let i = 1; i < count; i++) joinRoom(room, players[i], T);
  return room;
}
function touch(room: InternalRoom, now: number) {
  room.players
    .filter((p) => !p.left)
    .forEach((p) => {
      p.lastSeen = now;
    });
}
function playing(count = 2, word = "BANAN") {
  const room = roomWith(count);
  act(
    room,
    "ada",
    { type: "settings", settings: { rounds: 2, roundSeconds: 60 } },
    T,
  );
  act(room, "ada", { type: "start" }, T);
  act(
    room,
    "ada",
    { type: "word", word, clue: "Frukt till mellanmål" },
    T + 100,
  );
  const now = T + 3_100;
  touch(room, now);
  advance(room, now);
  assert.equal(room.phase, "playing");
  return { room, now };
}
function throws(code: string, fn: () => unknown) {
  assert.throws(fn, (e) => e instanceof GameError && e.code === code);
}

test("a private room needs two connected players and only the host may start", () => {
  const room = createRoom("ABCDEF", players[0], T);
  throws("NEED_PLAYERS", () => act(room, "ada", { type: "start" }, T));
  joinRoom(room, players[1], T);
  throws("HOST_ONLY", () => act(room, "bo", { type: "start" }, T));
  act(room, "ada", { type: "start" }, T);
  assert.equal(room.phase, "choosing");
  assert.equal(room.masterId, "ada");
});

test("duplicate nicknames, room capacity and forged reconnection are rejected", () => {
  const room = roomWith();
  throws("NAME_TAKEN", () =>
    joinRoom(room, { ...players[2], nickname: "aDA" }, T),
  );
  throws("UNAUTHORIZED", () =>
    joinRoom(room, { ...players[0], tokenHash: "wrong" }, T),
  );
  for (let i = 2; i < 10; i++)
    joinRoom(
      room,
      {
        id: `p${i}`,
        nickname: `Friend ${i}`,
        avatar: i % 8,
        tokenHash: `token-${i}`,
      },
      T,
    );
  throws("ROOM_FULL", () => joinRoom(room, players[2], T));
});

test("non-master network views contain no answer, suggestions, tokens or internal state", () => {
  const { room, now } = playing(3, "KÖTTBULLE");
  const view = publicRoom(room, "bo", now),
    json = JSON.stringify(view);
  assert.deepEqual(view.maskedWord, Array(9).fill("_"));
  for (const forbidden of [
    "KÖTTBULLE",
    "tokenHash",
    "private-token",
    "usedWords",
    "sabotageChecks",
    "wrongGuesses",
    "secretWord",
    "suggestions",
  ])
    assert.ok(!json.includes(forbidden), forbidden);
  assert.equal(publicRoom(room, "ada", now).secretWord, "KÖTTBULLE");
});

test("word selection validates alphabet, length, repeated words and disguised clue leakage", () => {
  const room = roomWith();
  act(room, "ada", { type: "start" }, T);
  throws("ANSWER_IN_CLUE", () =>
    act(
      room,
      "ada",
      { type: "word", word: "banan", clue: "B A N A N är gott" },
      T,
    ),
  );
  throws("INVALID_WORD", () =>
    act(room, "ada", { type: "word", word: "BANAN123", clue: "En frukt" }, T),
  );
  throws("UNFAIR_WORD", () =>
    act(room, "ada", { type: "word", word: "ZZZZZ", clue: "En frukt" }, T),
  );
  throws("UNSUITABLE_TEXT", () =>
    act(
      room,
      "ada",
      { type: "word", word: "BANAN", clue: "<script>alert(1)</script>" },
      T,
    ),
  );
  room.usedWords.push("BANAN");
  throws("REPEATED_WORD", () =>
    act(room, "ada", { type: "word", word: "BANAN", clue: "En frukt" }, T),
  );
  room.usedWords = [];
  room.settings.language = "en";
  throws("INVALID_WORD", () =>
    act(
      room,
      "ada",
      { type: "word", word: "KÖTTBULLE", clue: "Swedish food" },
      T,
    ),
  );
});

test("settings are server validated and locked when a match starts", () => {
  const room = roomWith();
  throws("INVALID_ROUNDS", () =>
    act(room, "ada", { type: "settings", settings: { rounds: 999 } }, T),
  );
  throws("INVALID_TIME", () =>
    act(room, "ada", { type: "settings", settings: { roundSeconds: -1 } }, T),
  );
  throws("HOST_ONLY", () =>
    act(room, "bo", { type: "settings", settings: { rounds: 3 } }, T),
  );
  act(
    room,
    "ada",
    { type: "settings", settings: { difficulty: "hard", sabotage: false } },
    T,
  );
  assert.equal(publicRoom(room, "bo", T).maxMistakes, 6);
  act(room, "ada", { type: "start" }, T);
  throws("MATCH_STARTED", () =>
    act(room, "ada", { type: "settings", settings: { rounds: 3 } }, T),
  );
});

test("correct guesses reveal every matching letter and award points exactly once", () => {
  const { room, now } = playing(3);
  act(room, "bo", { type: "letter", letter: "a" }, now);
  assert.deepEqual(publicRoom(room, "cleo", now).maskedWord, [
    "_",
    "A",
    "_",
    "A",
    "_",
  ]);
  assert.equal(room.players[1].score, 10);
  throws("ALREADY_GUESSED", () =>
    act(room, "cleo", { type: "letter", letter: "A" }, now),
  );
  throws("LETTER_COOLDOWN", () =>
    act(room, "bo", { type: "letter", letter: "N" }, now + 100),
  );
  act(room, "bo", { type: "letter", letter: "N" }, now + 700);
  assert.equal(room.players[1].score, 23);
  assert.equal(room.players[1].streak, 2);
});

test("incorrect shared letters synchronize mistakes and reset streak", () => {
  const { room, now } = playing(3);
  act(room, "bo", { type: "letter", letter: "A" }, now);
  act(room, "bo", { type: "letter", letter: "Z" }, now + 700);
  assert.equal(room.mistakes, 1);
  assert.equal(room.players[1].streak, 0);
  assert.equal(
    publicRoom(room, "cleo", now + 700).guessedLetters.Z.correct,
    false,
  );
  assert.equal(room.players[1].score, 10);
});

test("a full solution stays private until everybody solves, and cannot score twice", () => {
  const { room, now } = playing(3);
  act(room, "bo", { type: "solve", word: "BANAN" }, now + 1_000);
  assert.equal(room.phase, "playing");
  assert.equal(room.players[1].solved, true);
  assert.equal(publicRoom(room, "cleo", now + 1_000).result, undefined);
  assert.ok(
    !JSON.stringify(publicRoom(room, "cleo", now + 1_000)).includes("BANAN"),
  );
  const score = room.players[1].score;
  throws("CANNOT_GUESS", () =>
    act(room, "bo", { type: "solve", word: "BANAN" }, now + 6_000),
  );
  assert.equal(room.players[1].score, score);
  act(room, "cleo", { type: "solve", word: "BANAN" }, now + 7_000);
  assert.equal(room.phase, "results");
  assert.equal(room.result!.answer, "BANAN");
  assert.deepEqual(room.result!.winners, ["bo", "cleo"]);
  assert.ok(room.players[1].score > room.players[2].score);
});

test("wrong full-word guesses are rate limited and remain hidden until results", () => {
  const { room, now } = playing(3);
  act(room, "bo", { type: "solve", word: "MELON" }, now);
  assert.equal(room.players[1].score, -10);
  assert.equal(room.mistakes, 0);
  assert.ok(!JSON.stringify(publicRoom(room, "cleo", now)).includes("MELON"));
  throws("SOLVE_COOLDOWN", () =>
    act(room, "bo", { type: "solve", word: "BANAN" }, now + 100),
  );
  touch(room, room.deadlineAt);
  advance(room, room.deadlineAt);
  assert.equal(room.result!.funnyGuesses[0].text, "MELON");
});

test("a letter that completes the board finishes the round and awards a solver", () => {
  const { room, now } = playing(3);
  ["B", "A", "N"].forEach((letter, i) =>
    act(room, "bo", { type: "letter", letter }, now + i * 700),
  );
  assert.equal(room.phase, "results");
  assert.deepEqual(room.result!.winners, ["bo"]);
  assert.ok(room.result!.masterBonus >= 35);
});

test("deadline adjudication wins over a late answer, and impossible rounds reward no master", () => {
  const { room } = playing();
  const end = room.deadlineAt;
  touch(room, end);
  throws("NOT_PLAYING", () =>
    act(room, "bo", { type: "solve", word: "BANAN" }, end),
  );
  assert.equal(room.phase, "results");
  assert.equal(room.result!.reason, "time");
  assert.equal(room.result!.masterBonus, 0);
  assert.equal(room.players[0].score, 0);
});

test("exhausting mistakes finishes with a non-graphic loss and no master reward", () => {
  const { room, now } = playing();
  "CDEFGHIJ"
    .split("")
    .forEach((letter, i) =>
      act(room, "bo", { type: "letter", letter }, now + i * 700),
    );
  assert.equal(room.phase, "results");
  assert.equal(room.result!.reason, "mistakes");
  assert.equal(room.result!.masterBonus, 0);
});

test("sabotage is master-only, respects room settings, cooldown and limited uses", () => {
  const { room, now } = playing(3);
  throws("MASTER_ONLY", () =>
    act(room, "bo", { type: "sabotage", card: "chaos" }, now),
  );
  room.settings.sabotage = false;
  throws("SABOTAGE_OFF", () =>
    act(room, "ada", { type: "sabotage", card: "chaos" }, now),
  );
  room.settings.sabotage = true;
  act(room, "ada", { type: "sabotage", card: "chaos" }, now);
  throws("CARD_USED", () =>
    act(room, "ada", { type: "sabotage", card: "chaos" }, now + 8_000),
  );
  throws("CARD_COOLDOWN", () =>
    act(room, "ada", { type: "sabotage", card: "panic" }, now + 1_000),
  );
  act(room, "ada", { type: "sabotage", card: "panic" }, now + 8_000);
  act(room, "ada", { type: "sabotage", card: "double" }, now + 16_000);
  assert.equal(publicRoom(room, "ada", now + 16_000).cardsRemaining, 0);
  touch(room, now + 24_000);
  throws("CARD_USED", () =>
    act(
      room,
      "ada",
      { type: "sabotage", card: "bluff", text: "Grön frukt", truth: false },
      now + 24_000,
    ),
  );
});

test("fog hides one revealed tile temporarily, then restores it without altering the puzzle", () => {
  const { room, now } = playing(3);
  throws("NOTHING_TO_HIDE", () =>
    act(room, "ada", { type: "sabotage", card: "fog" }, now),
  );
  assert.equal(room.usedCards.length, 0);
  act(room, "bo", { type: "letter", letter: "A" }, now);
  act(room, "ada", { type: "sabotage", card: "fog" }, now + 100);
  assert.deepEqual(publicRoom(room, "cleo", now + 100).maskedWord, [
    "_",
    "_",
    "_",
    "A",
    "_",
  ]);
  advance(room, now + 6_100);
  assert.deepEqual(publicRoom(room, "cleo", now + 6_100).maskedWord, [
    "_",
    "A",
    "_",
    "A",
    "_",
  ]);
});

test("panic reduces the displayed deadline temporarily and can never terminate the round early", () => {
  const { room, now } = playing(3);
  const deadline = room.deadlineAt;
  act(room, "ada", { type: "sabotage", card: "panic" }, now);
  assert.equal(publicRoom(room, "bo", now).deadlineAt, deadline - 8_000);
  assert.equal(room.deadlineAt, deadline);
  advance(room, now + 5_000);
  assert.equal(publicRoom(room, "bo", now + 5_000).deadlineAt, deadline);
  assert.equal(room.phase, "playing");
  const late = playing(3);
  touch(late.room, late.room.deadlineAt - 15_000);
  throws("TOO_LATE", () =>
    act(
      late.room,
      "ada",
      { type: "sabotage", card: "panic" },
      late.room.deadlineAt - 15_000,
    ),
  );
});

test("bluff truth and other votes are hidden, one vote per player, evaluated only at results", () => {
  const { room, now } = playing(3);
  act(
    room,
    "ada",
    { type: "sabotage", card: "bluff", text: "Den är blå", truth: false },
    now,
  );
  assert.equal(publicRoom(room, "bo", now).effects.bluff!.truth, undefined);
  act(room, "bo", { type: "bluffVote", vote: "bluff" }, now + 10);
  assert.equal(publicRoom(room, "bo", now).effects.bluff!.yourVote, "bluff");
  assert.equal(
    publicRoom(room, "cleo", now).effects.bluff!.yourVote,
    undefined,
  );
  assert.equal(room.players[1].score, 0);
  throws("ALREADY_VOTED", () =>
    act(room, "bo", { type: "bluffVote", vote: "truth" }, now + 20),
  );
  act(room, "cleo", { type: "bluffVote", vote: "truth" }, now + 20);
  touch(room, room.deadlineAt);
  advance(room, room.deadlineAt);
  assert.equal(room.players[1].score, 25);
  assert.equal(room.players[2].score, -10);
  assert.equal(
    publicRoom(room, "bo", room.deadlineAt).effects.bluff!.truth,
    false,
  );
});

test("double or nothing is opt-in, doubles a full solution and penalizes only failed participants once", () => {
  const { room, now } = playing(4);
  act(room, "ada", { type: "sabotage", card: "double" }, now);
  act(room, "bo", { type: "doubleAccept" }, now + 1);
  act(room, "cleo", { type: "doubleAccept" }, now + 1);
  act(room, "bo", { type: "solve", word: "BANAN" }, now + 1_000);
  assert.equal(room.players[1].score, (100 + 69 + 25) * 2);
  advance(room, now + 10_000);
  assert.equal(room.players[2].score, -30);
  assert.equal(room.players[3].score, 0);
  advance(room, now + 10_001);
  assert.equal(room.players[2].score, -30);
});

test("master and solved-player chat cannot leak the answer; ordinary chat is escaped data and bounded", () => {
  const { room, now } = playing(3);
  throws("CHAT_LOCKED", () =>
    act(room, "ada", { type: "chat", text: "It starts with B" }, now),
  );
  throws("ANSWER_IN_CHAT", () =>
    act(room, "bo", { type: "chat", text: "B A N A N" }, now),
  );
  act(room, "bo", { type: "chat", text: "Svårt det här!" }, now);
  assert.equal(
    publicRoom(room, "cleo", now).chat.at(-1)!.text,
    "Svårt det här!",
  );
  throws("CHAT_COOLDOWN", () =>
    act(room, "bo", { type: "chat", text: "Igen!" }, now + 1),
  );
  act(room, "bo", { type: "solve", word: "BANAN" }, now + 1_000);
  throws("CHAT_LOCKED", () =>
    act(room, "bo", { type: "chat", text: "Jag vet svaret" }, now + 2_000),
  );
});

test("late joiners spectate this round and become eligible at the next round", () => {
  const { room, now } = playing();
  joinRoom(room, players[2], now + 1_000);
  assert.equal(publicRoom(room, "cleo", now).canGuess, false);
  throws("CANNOT_GUESS", () =>
    act(room, "cleo", { type: "letter", letter: "A" }, now + 1_001),
  );
  act(room, "bo", { type: "solve", word: "BANAN" }, now + 2_000);
  act(room, "ada", { type: "next" }, now + 3_000);
  assert.equal(room.masterId, "bo");
  assert.equal(room.players[2].spectator, false);
});

test("host transfers after the grace period and refreshing a session preserves score", () => {
  const { room, now } = playing(3);
  act(room, "bo", { type: "letter", letter: "A" }, now);
  act(room, "bo", { type: "heartbeat" }, now + 21_000);
  assert.equal(room.hostId, "bo");
  assert.equal(room.players[0].connected, false);
  const score = room.players[1].score;
  act(room, "bo", { type: "heartbeat" }, now + 45_000);
  assert.equal(room.players[1].score, score);
  assert.equal(room.players[1].connected, true);
  assert.equal(room.phase, "playing");
});

test("a disconnected Word Master cannot strand selection; a fair fallback starts automatically", () => {
  const room = roomWith();
  act(room, "ada", { type: "start" }, T);
  act(room, "bo", { type: "heartbeat" }, T + 45_000);
  assert.equal(room.phase, "countdown");
  assert.ok(room.secretWord.length >= 3);
  assert.equal(room.hostId, "bo");
  assert.ok(
    !JSON.stringify(publicRoom(room, "bo", T + 45_000)).includes(
      room.secretWord,
    ),
  );
  act(room, "bo", { type: "heartbeat" }, T + 48_000);
  assert.equal(room.phase, "playing");
});

test("all guessers leaving ends a round gracefully and a master leaving does not expose the answer", () => {
  const { room, now } = playing();
  act(room, "bo", { type: "leave" }, now);
  assert.equal(room.phase, "results");
  assert.equal(room.result!.reason, "abandoned");
  const other = playing(3);
  act(other.room, "ada", { type: "leave" }, other.now);
  assert.equal(other.room.phase, "playing");
  assert.equal(other.room.hostId, "bo");
  assert.ok(
    !JSON.stringify(publicRoom(other.room, "bo", other.now)).includes("BANAN"),
  );
});

test("a complete match rotates masters, reaches final results and rematches with fresh scores", () => {
  const { room, now } = playing();
  act(room, "bo", { type: "solve", word: "BANAN" }, now + 1_000);
  touch(room, now + 13_000);
  advance(room, now + 13_000);
  assert.equal(room.phase, "choosing");
  assert.equal(room.roundNo, 2);
  assert.equal(room.masterId, "bo");
  act(
    room,
    "bo",
    { type: "word", word: "APELSIN", clue: "En citrusfrukt" },
    now + 13_001,
  );
  touch(room, now + 16_001);
  advance(room, now + 16_001);
  act(room, "ada", { type: "solve", word: "APELSIN" }, now + 17_001);
  touch(room, now + 29_001);
  advance(room, now + 29_001);
  assert.equal(room.phase, "finished");
  act(room, "ada", { type: "rematch" }, now + 29_100);
  assert.equal(room.phase, "finished");
  act(room, "bo", { type: "rematch" }, now + 29_101);
  assert.equal(room.phase, "choosing");
  assert.equal(room.roundNo, 1);
  assert.deepEqual(
    room.players.map((p) => p.score),
    [0, 0],
  );
  assert.equal(room.usedWords.length, 0);
});

test("a rematch requires a strict majority, with at least two votes", () => {
  const room = roomWith(4);
  room.phase = "finished";
  act(room, "ada", { type: "rematch" }, T);
  act(room, "bo", { type: "rematch" }, T);
  assert.equal(room.phase, "finished");
  act(room, "cleo", { type: "rematch" }, T);
  assert.equal(room.phase, "choosing");
});

test("normal repeated advancement is a true no-op and views cannot mutate internal state", () => {
  const { room, now } = playing(3);
  const before = JSON.stringify(room);
  assert.equal(advance(room, now + 10), false);
  assert.equal(JSON.stringify(room), before);
  const view = publicRoom(room, "bo", now);
  view.settings.rounds = 999;
  view.players[0].score = 99_999;
  view.events[0].type = "forged";
  assert.equal(room.settings.rounds, 2);
  assert.equal(room.players[0].score, 0);
  assert.notEqual(room.events[0].type, "forged");
});
