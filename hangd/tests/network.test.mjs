import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";

// Real authenticated HTTP clients + an independent 1.5 s poller.
// This suite never simulates room state or opens a second server.
const base = (process.env.HANGD_TEST_URL || "http://127.0.0.1:4173").replace(
  /\/$/,
  "",
);
const run = Date.now().toString(36).slice(-5);
const deadline = AbortSignal.timeout(120_000);
const active = new Set();
const allClients = [];
const streams = [];
const passed = [];
const latency = [];
let heartbeat;
const sleep = (ms) =>
  new Promise((resolve, reject) => {
    if (deadline.aborted)
      return reject(new Error("Integration test exceeded 120 seconds"));
    const timer = setTimeout(resolve, ms);
    deadline.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new Error("Integration test exceeded 120 seconds"));
      },
      { once: true },
    );
  });
function pass(name) {
  passed.push(name);
  console.log(`PASS ${name}`);
}
async function request(path, { token, method = "GET", data } = {}) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(data !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    ...(data !== undefined ? { body: JSON.stringify(data) } : {}),
    signal: deadline,
    redirect: "error",
  });
  assert.ok(
    response.headers.get("content-type")?.includes("application/json"),
    `Expected JSON from ${method} ${path}; received ${response.status}`,
  );
  return { status: response.status, body: await response.json() };
}
async function ok(path, options, status = 200) {
  const result = await request(path, options);
  assert.equal(
    result.status,
    status,
    `${options?.method || "GET"} ${path}: ${result.body.code || "unexpected response"} (${result.body.error || ""})`,
  );
  return result.body;
}
async function expectError(path, options, status, code) {
  const result = await request(path, options);
  assert.equal(
    result.status,
    status,
    `Expected ${status} for ${path}, got ${result.status}`,
  );
  if (code) assert.equal(result.body.code, code);
  return result.body;
}
function client(data, keepAlive = true) {
  assert.match(data.token, /^[a-f0-9]{64}$/);
  const c = {
    token: data.token,
    id: data.playerId,
    code: data.room.code,
    room: data.room,
  };
  assert.equal(c.id, data.room.selfId);
  allClients.push(c);
  if (keepAlive) active.add(c);
  return c;
}
const snapshot = async (c) => {
  const data = await ok(`/api/rooms/${c.code}`, { token: c.token });
  c.room = data.room;
  return c.room;
};
const action = async (c, data) => {
  const result = await ok(`/api/rooms/${c.code}/actions`, {
    method: "POST",
    token: c.token,
    data,
  });
  if (result.room) c.room = result.room;
  return result;
};
const actionError = (c, data, status, code) =>
  expectError(
    `/api/rooms/${c.code}/actions`,
    { method: "POST", token: c.token, data },
    status,
    code,
  );
async function waitFor(check, label, max = 8_000) {
  const start = performance.now();
  while (performance.now() - start < max) {
    const value = await check();
    if (value) return value;
    await sleep(100);
  }
  throw new Error(`Timed out waiting for ${label}`);
}
// The game polls GET /api/rooms/:code every 1.5 s (no SSE on Workers Free); this observer does the same.
async function startSSE(c) {
  const abort = new AbortController();
  const state = {
    latest: undefined,
    arrivals: [],
    error: undefined,
    stop: () => abort.abort(),
    task: undefined,
  };
  state.task = (async () => {
    try {
      while (!abort.signal.aborted && !deadline.aborted) {
        const response = await fetch(`${base}/api/rooms/${c.code}`, {
          headers: { Authorization: `Bearer ${c.token}` },
          signal: AbortSignal.any([abort.signal, deadline]),
        });
        assert.equal(response.status, 200);
        const { room } = await response.json();
        if (!state.latest || room.version !== state.latest.version) {
          state.latest = room;
          state.arrivals.push({ at: performance.now(), room });
          if (state.arrivals.length > 150) state.arrivals.shift();
        }
        if (!abort.signal.aborted) await sleep(1500);
      }
    } catch (error) {
      if (!abort.signal.aborted && !deadline.aborted) state.error = error;
    }
  })();
  streams.push(state);
  await waitFor(() => {
    if (state.error) throw state.error;
    return state.latest;
  }, "initial polled room");
  return state;
}
function assertSecret(room, answer) {
  const serialized = JSON.stringify(room);
  for (const forbidden of [
    answer,
    "tokenHash",
    "secretWord",
    "suggestions",
    "wrongGuesses",
    "usedWords",
  ])
    assert.ok(
      !serialized.includes(forbidden),
      `Guest payload leaked ${forbidden}`,
    );
  for (const c of allClients)
    assert.ok(
      !serialized.includes(c.token),
      "A session token leaked into room state",
    );
}

try {
  const health = await ok("/api/health");
  assert.equal(health.game, "Hängd");
  assert.equal(health.status, "ok");
  assert.equal(health.storage, "D1");
  pass("healthy HÄNGD server with D1 storage");

  heartbeat = setInterval(() => {
    void Promise.allSettled(
      [...active].map((c) => action(c, { type: "heartbeat" })),
    );
  }, 5_000);

  const ada = client(
    await ok(
      "/api/rooms",
      {
        method: "POST",
        data: { nickname: `Ada ${run}`, avatar: 0, language: "sv" },
      },
      201,
    ),
  );
  const bo = client(
    await ok(`/api/rooms/${ada.code}/join`, {
      method: "POST",
      data: { nickname: `Bo ${run}`, avatar: 1 },
    }),
  );
  const cleo = client(
    await ok(`/api/rooms/${ada.code}/join`, {
      method: "POST",
      data: { nickname: `Cleo ${run}`, avatar: 2 },
    }),
  );
  const joined = await snapshot(ada);
  assert.equal(joined.players.length, 3);
  assert.equal(new Set([ada.token, bo.token, cleo.token]).size, 3);
  pass(
    "three separately authenticated HTTP clients join the same persisted room",
  );

  await expectError(
    `/api/rooms/${ada.code}/join`,
    { method: "POST", data: { nickname: `ada ${run}`, avatar: 3 } },
    409,
    "NAME_TAKEN",
  );
  await expectError("/api/rooms/BAD", { token: bo.token }, 400, "room_code");
  await expectError(
    "/api/rooms/ZZZZZZ",
    { token: bo.token },
    404,
    "room_not_found",
  );
  await expectError(`/api/rooms/${ada.code}`, {}, 401, "unauthorized");
  await expectError(
    `/api/rooms/${ada.code}`,
    { token: "f".repeat(64) },
    401,
    "unauthorized",
  );
  pass(
    "duplicate names, invalid/missing rooms, missing auth and forged sessions rejected",
  );

  // Leave one host without any requests. A different client keeps this second room alive.
  const away = client(
    await ok(
      "/api/rooms",
      { method: "POST", data: { nickname: `Away ${run}`, avatar: 4 } },
      201,
    ),
    false,
  );
  const watcher = client(
    await ok(`/api/rooms/${away.code}/join`, {
      method: "POST",
      data: { nickname: `Stay ${run}`, avatar: 5 },
    }),
  );
  const disconnectAt = performance.now();
  await expectError(
    `/api/rooms/${away.code}`,
    { token: bo.token },
    401,
    "unauthorized",
  );
  pass("room tokens cannot authorize a different room");

  await actionError(
    bo,
    { type: "settings", settings: { rounds: 2 } },
    403,
    "HOST_ONLY",
  );
  await action(ada, {
    type: "settings",
    settings: {
      rounds: 2,
      roundSeconds: 75,
      language: "sv",
      difficulty: "normal",
      sabotage: true,
    },
  });
  await action(ada, { type: "start" });
  assert.equal((await snapshot(bo)).masterId, ada.id);
  const sse = await startSSE(cleo);
  await action(ada, {
    type: "word",
    word: "KÖTTBULLE",
    clue: "Svensk klassiker på tallriken",
  });
  const hidden = await snapshot(bo);
  assert.equal(hidden.phase, "countdown");
  assertSecret(hidden, "KÖTTBULLE");
  await waitFor(
    async () => (await snapshot(bo)).phase === "playing",
    "network round countdown",
  );
  const [timerA, timerB] = await Promise.all([snapshot(ada), snapshot(bo)]);
  assert.equal(timerA.deadlineAt, timerB.deadlineAt);
  assert.equal(timerB.maskedWord.length, 9);
  pass(
    "host settings, master word submission, synchronized countdown and secret guest payloads",
  );

  const began = performance.now();
  await action(bo, { type: "letter", letter: "K" });
  await waitFor(
    () => sse.latest?.guessedLetters?.K,
    "correct letter through independent SSE",
    4_000,
  );
  const observed =
    sse.arrivals.find((x) => x.room.guessedLetters.K)?.at - began;
  latency.push(Math.round(observed));
  assert.ok(observed >= 0 && observed < 4_000);
  assert.equal(sse.latest.maskedWord[0], "K");
  assert.equal(sse.latest.players.find((p) => p.id === bo.id).score, 10);
  pass(
    `correct letter arrives via real SSE (${Math.round(observed)} ms observed)`,
  );

  await sleep(750);
  const simultaneous = await Promise.all(
    [bo, cleo].map((c) =>
      request(`/api/rooms/${c.code}/actions`, {
        method: "POST",
        token: c.token,
        data: { type: "letter", letter: "Ö" },
      }),
    ),
  );
  assert.deepEqual(simultaneous.map((x) => x.status).sort(), [200, 409]);
  assert.equal(
    simultaneous.find((x) => x.status === 409).body.code,
    "ALREADY_GUESSED",
  );
  const once = await snapshot(ada),
    letterWinner = once.guessedLetters["Ö"].playerId;
  const total = once.players.reduce((sum, p) => sum + p.score, 0);
  assert.equal(total, 10 + (letterWinner === bo.id ? 13 : 10));
  pass("concurrent duplicate letter commands award points exactly once");

  await sleep(750);
  await action(cleo, { type: "letter", letter: "Z" });
  await waitFor(
    () => sse.latest?.mistakes === 1,
    "incorrect letter through SSE",
  );
  assert.equal((await snapshot(bo)).guessedLetters.Z.correct, false);
  await action(bo, { type: "solve", word: "SKUMTOMTE" });
  assert.ok(!JSON.stringify(await snapshot(cleo)).includes("SKUMTOMTE"));
  await actionError(
    bo,
    { type: "solve", word: "KÖTTBULLE" },
    429,
    "SOLVE_COOLDOWN",
  );
  pass(
    "wrong letter synchronizes, full guesses stay private and spam is rate limited",
  );

  await actionError(
    bo,
    { type: "sabotage", card: "chaos" },
    403,
    "MASTER_ONLY",
  );
  const sabotageAt = performance.now();
  await action(ada, { type: "sabotage", card: "chaos" });
  await waitFor(
    () => sse.latest?.effects.chaosUntil > sse.latest.serverNow,
    "chaos sabotage over SSE",
  );
  assert.equal(
    (await snapshot(bo)).effects.chaosUntil,
    sse.latest.effects.chaosUntil,
  );
  await actionError(
    ada,
    { type: "sabotage", card: "panic" },
    429,
    "CARD_COOLDOWN",
  );
  await actionError(
    ada,
    { type: "chat", text: "Jag vet svaret" },
    403,
    "CHAT_LOCKED",
  );
  pass("sabotage synchronizes to opponents and enforces ownership/cooldown");

  const dan = client(
    await ok(`/api/rooms/${ada.code}/join`, {
      method: "POST",
      data: { nickname: `Dan ${run}`, avatar: 3 },
    }),
  );
  assert.equal(dan.room.players.find((p) => p.id === dan.id).spectator, true);
  assert.equal(dan.room.canGuess, false);
  await actionError(dan, { type: "letter", letter: "A" }, 403, "CANNOT_GUESS");
  const preserved = (await snapshot(bo)).players.find(
    (p) => p.id === bo.id,
  ).score;
  const refreshed = { ...bo };
  const reconnected = await snapshot(refreshed);
  assert.equal(reconnected.selfId, bo.id);
  assert.equal(
    reconnected.players.find((p) => p.id === bo.id).score,
    preserved,
  );
  pass(
    "late arrivals spectate and a fresh client with the persisted token restores its identity/score",
  );

  await action(cleo, { type: "chat", text: "Den här är knepig!" });
  await action(bo, { type: "reaction", emoji: "😈" });
  await action(cleo, { type: "typing", active: true });
  const social = await snapshot(dan);
  assert.equal(social.chat.at(-1).text, "Den här är knepig!");
  assert.equal(social.players.find((p) => p.id === bo.id).reaction, "😈");
  assert.ok(
    social.players.find((p) => p.id === cleo.id).typingUntil > social.serverNow,
  );
  pass("chat, emoji reactions and typing indicators reach another client");

  await sleep(Math.max(0, 8_150 - (performance.now() - sabotageAt)));
  await action(ada, {
    type: "sabotage",
    card: "bluff",
    text: "Det är blått",
    truth: false,
  });
  assert.equal((await snapshot(bo)).effects.bluff.truth, undefined);
  await action(bo, { type: "bluffVote", vote: "bluff" });
  await action(cleo, { type: "bluffVote", vote: "truth" });
  assert.equal((await snapshot(cleo)).effects.bluff.yourVote, "truth");
  await actionError(
    bo,
    { type: "bluffVote", vote: "truth" },
    409,
    "ALREADY_VOTED",
  );
  await action(bo, { type: "solve", word: "KÖTTBULLE" });
  const stillHidden = await snapshot(cleo);
  assert.equal(stillHidden.phase, "playing");
  assertSecret(stillHidden, "KÖTTBULLE");
  await actionError(
    bo,
    { type: "solve", word: "KÖTTBULLE" },
    403,
    "CANNOT_GUESS",
  );
  await action(cleo, { type: "solve", word: "KÖTTBULLE" });
  const result = await snapshot(dan);
  assert.equal(result.phase, "results");
  assert.equal(result.result.answer, "KÖTTBULLE");
  assert.deepEqual(result.result.winners, [bo.id, cleo.id]);
  assert.ok(result.result.masterBonus >= 35);
  assert.equal(result.effects.bluff.truth, false);
  assert.equal(result.result.funnyGuesses[0].text, "SKUMTOMTE");
  pass(
    "bluff truth stays private, votes are unique, full solves stay secret until round results",
  );

  await action(ada, { type: "next" });
  const second = await snapshot(dan);
  assert.equal(second.roundNo, 2);
  assert.equal(second.masterId, bo.id);
  assert.equal(second.players.find((p) => p.id === dan.id).spectator, false);
  await action(bo, { type: "word", word: "BANAN", clue: "En gul frukt" });
  await waitFor(
    async () => (await snapshot(dan)).phase === "playing",
    "second network countdown",
  );
  assert.equal(dan.room.canGuess, true);
  for (const letter of ["B", "A", "N"]) {
    await action(ada, { type: "letter", letter });
    await sleep(700);
  }
  assert.equal(ada.room.phase, "results");
  assert.equal(ada.room.result.answer, "BANAN");
  await action(ada, { type: "next" });
  assert.equal(ada.room.phase, "finished");
  await action(ada, { type: "rematch" });
  await action(bo, { type: "rematch" });
  assert.equal(bo.room.phase, "finished");
  await action(cleo, { type: "rematch" });
  assert.equal(cleo.room.phase, "choosing");
  assert.equal(cleo.room.roundNo, 1);
  assert.ok(cleo.room.players.every((p) => p.score === 0));
  pass(
    "complete two-round match, master rotation, late-player participation, final and majority rematch",
  );

  if (performance.now() - disconnectAt < 21_000)
    await sleep(21_000 - (performance.now() - disconnectAt));
  const absent = await snapshot(watcher);
  assert.equal(absent.hostId, watcher.id);
  assert.equal(absent.players.find((p) => p.id === away.id).connected, false);
  const restored = await snapshot(away);
  active.add(away);
  assert.equal(restored.selfId, away.id);
  assert.equal(restored.players.find((p) => p.id === away.id).connected, true);
  assert.equal(restored.hostId, watcher.id);
  active.delete(watcher);
  await action(watcher, { type: "leave" });
  assert.equal((await snapshot(away)).hostId, away.id);
  pass(
    "actual 20-second inactivity transfers host; token reconnect and explicit host leave recover cleanly",
  );

  assert.equal(sse.error, undefined);
  assert.ok(sse.arrivals.length >= 5);
  pass(
    `1.5 s polling observed ${sse.arrivals.length} real state changes without an error`,
  );
  console.log(
    JSON.stringify({
      passed: passed.length,
      failed: 0,
      roomsCreated: 2,
      clientsCreated: allClients.length,
      sseObservedLatencyMs: latency,
      note: "Executed against real HTTP/SSE endpoints and D1. These are independent network clients, not physical-device or cross-network tests.",
    }),
  );
} catch (error) {
  console.error(
    `FAIL ${error instanceof Error ? error.message : "Unknown integration error"}`,
  );
  console.error(JSON.stringify({ passed: passed.length, failed: 1 }));
  process.exitCode = 1;
} finally {
  clearInterval(heartbeat);
  active.clear();
  for (const s of streams) s.stop();
  await Promise.allSettled(streams.map((s) => s.task));
  // Leave successfully created test sessions, making these test-only rooms eligible for cleanup.
  if (!deadline.aborted)
    await Promise.allSettled(
      allClients.map((c) => action(c, { type: "leave" })),
    );
}
