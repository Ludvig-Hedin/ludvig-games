import assert from "node:assert/strict";
import { test } from "node:test";
import { Chess } from "chess.js";
import { ChessEngine, classifyMove, DIFFICULTIES, type EnginePort } from "../lib/engine";

class FakeWorker implements EnginePort {
  onmessage: EnginePort["onmessage"] = null;
  onerror: EnginePort["onerror"] = null;
  commands: string[] = [];
  terminated = false;
  automatic = true;
  best = "e2e4";
  score = 42;
  postMessage(command: string) {
    this.commands.push(command);
    if (command === "uci") queueMicrotask(() => {
      this.emit("option name UCI_Elo type spin default 1320 min 1320 max 3190");
      this.emit("uciok");
    });
    if (command === "isready") queueMicrotask(() => this.emit("readyok"));
    if (command.startsWith("go ") && this.automatic) queueMicrotask(() => this.finish());
  }
  emit(line: string) { this.onmessage?.({ data: line }); }
  finish() {
    this.emit(`info depth 10 multipv 1 score cp ${this.score} nodes 1000 pv ${this.best}`);
    this.emit(`bestmove ${this.best}`);
  }
  terminate() { this.terminated = true; }
}

const fen = new Chess().fen();
const settle = async (predicate: () => boolean) => {
  for (let count = 0; count < 25; count++) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  assert.ok(predicate(), "worker did not reach expected state");
};

test("analysis reports White's perspective for either side to move", async () => {
  const worker = new FakeWorker();
  const engine = new ChessEngine({ workerFactory: () => worker });
  try {
    const white = await engine.evaluate(fen, 100);
    assert.equal(white.evaluation, 42);
    const chess = new Chess();
    chess.move("e4");
    worker.best = "e7e5";
    const black = await engine.evaluate(chess.fen(), 100);
    assert.equal(black.evaluation, -42);
    assert.equal(black.move, "e7e5");
    assert.equal(black.depth, 10);
  } finally { engine.destroy(); }
});

test("each difficulty uses different native engine controls; Elo is clamped to supported range", async () => {
  const worker = new FakeWorker();
  const engine = new ChessEngine({ workerFactory: () => worker });
  try {
    const signatures = [];
    for (const level of DIFFICULTIES) {
      const before = worker.commands.length;
      const result = await engine.bestMove(fen, { difficulty: level.id, thinkMs: 100 });
      assert.equal(result.move, "e2e4");
      const commands = worker.commands.slice(before);
      assert.ok(commands.includes(`setoption name Skill Level value ${level.skill}`));
      if (level.id >= 3) {
        assert.ok(commands.includes(`setoption name UCI_Elo value ${Math.max(1320, level.elo)}`));
        assert.ok(commands.includes("setoption name UCI_LimitStrength value true"));
      } else {
        assert.ok(commands.includes("setoption name UCI_LimitStrength value false"));
      }
      signatures.push(commands.filter((command) => /Skill Level|MultiPV|go |UCI_Elo/.test(command)).join(";"));
    }
    assert.equal(new Set(signatures).size, 7);
    await engine.evaluate(fen, 100);
    assert.ok(worker.commands.slice(-6).includes("setoption name UCI_LimitStrength value false"));
    assert.ok(worker.commands.slice(-6).includes("setoption name Skill Level value 20"));
  } finally { engine.destroy(); }
});

test("cancelling an active search prevents stale bestmove from entering a new game", async () => {
  const workers: FakeWorker[] = [];
  const engine = new ChessEngine({ workerFactory: () => {
    const worker = new FakeWorker();
    worker.automatic = false;
    workers.push(worker);
    return worker;
  } });
  try {
    const old = engine.bestMove(fen);
    const oldRejected = assert.rejects(old, { name: "AbortError" });
    await settle(() => workers[0]?.commands.some((command) => command.startsWith("go ")) ?? false);
    engine.cancel();
    await oldRejected;
    assert.equal(workers[0].terminated, true);
    const fresh = engine.bestMove(fen);
    await settle(() => workers[1]?.commands.some((command) => command.startsWith("go ")) ?? false);
    workers[0].best = "d2d4";
    workers[0].finish();
    workers[1].finish();
    assert.equal((await fresh).move, "e2e4");
  } finally { engine.destroy(); }
});

test("aborting a queued job does not terminate the active search", async () => {
  const worker = new FakeWorker();
  worker.automatic = false;
  const engine = new ChessEngine({ workerFactory: () => worker });
  try {
    const active = engine.bestMove(fen);
    await settle(() => worker.commands.some((command) => command.startsWith("go ")));
    const controller = new AbortController();
    const queued = engine.evaluate(fen, 100, controller.signal);
    const rejected = assert.rejects(queued, { name: "AbortError" });
    controller.abort();
    await rejected;
    assert.equal(worker.terminated, false);
    worker.finish();
    assert.equal((await active).move, "e2e4");
    assert.equal(worker.commands.filter((command) => command.startsWith("go ")).length, 1);
  } finally { engine.destroy(); }
});

test("engine rejects illegal results, malformed positions, and inconsistent history", async () => {
  const worker = new FakeWorker();
  const engine = new ChessEngine({ workerFactory: () => worker });
  try {
    worker.best = "e2e5";
    await assert.rejects(engine.bestMove(fen), /invalid move/i);
    await assert.rejects(engine.bestMove("not a fen"), /fen/i);
    await assert.rejects(engine.bestMove(fen, { initialFen: fen, moves: ["e2e4"] }), /do not match/);
    worker.best = "e2e4";
    assert.equal((await engine.bestMove(fen)).move, "e2e4");
  } finally { engine.destroy(); }
});

test("full move history is sent to preserve repetition context", async () => {
  const worker = new FakeWorker();
  worker.best = "e7e5";
  const engine = new ChessEngine({ workerFactory: () => worker });
  const game = new Chess();
  game.move("e4");
  try {
    await engine.bestMove(game.fen(), { initialFen: fen, moves: ["e2e4"] });
    assert.ok(worker.commands.includes(`position fen ${fen} moves e2e4`));
  } finally { engine.destroy(); }
});

test("terminal positions resolve without requesting a search", async () => {
  const worker = new FakeWorker();
  const engine = new ChessEngine({ workerFactory: () => worker });
  const game = new Chess();
  ["f3", "e5", "g4", "Qh4#"].forEach((move) => game.move(move));
  try {
    const result = await engine.evaluate(game.fen());
    assert.equal(result.move, "(none)");
    assert.equal(result.evaluation, -100000);
    assert.equal(worker.commands.some((command) => command.startsWith("go ")), false);
  } finally { engine.destroy(); }
});

test("centipawn-loss classifications have explicit stable boundaries", () => {
  assert.equal(classifyMove(-20), "best");
  assert.equal(classifyMove(15), "best");
  assert.equal(classifyMove(16), "good");
  assert.equal(classifyMove(50), "inaccuracy");
  assert.equal(classifyMove(100), "mistake");
  assert.equal(classifyMove(250), "blunder");
});
