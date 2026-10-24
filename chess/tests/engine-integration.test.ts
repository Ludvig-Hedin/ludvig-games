import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { test } from "node:test";
import { Chess } from "chess.js";
import { ChessEngine, DIFFICULTIES, type EnginePort } from "../lib/engine";

const require = createRequire(import.meta.url);
const stockfish = require("stockfish") as { findEngine: (flavor: string) => string };

/** Run the unmodified WASM build in a separate process, like a browser Worker. */
function nativePort(): EnginePort {
  const process = spawn(globalThis.process.execPath, [stockfish.findEngine("lite-single")], { stdio: ["pipe", "pipe", "pipe"] });
  let closed = false;
  let buffer = "";
  let errors = "";
  const port: EnginePort = {
    onmessage: null,
    onerror: null,
    postMessage(command) { if (!closed) process.stdin.write(command + "\n"); },
    terminate() { closed = true; process.kill("SIGTERM"); },
  };
  process.stdout.setEncoding("utf8");
  process.stderr.setEncoding("utf8");
  process.stdout.on("data", (data: string) => {
    buffer += data;
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";
    for (const line of lines) port.onmessage?.({ data: line });
  });
  process.stderr.on("data", (data: string) => { errors += data; });
  process.on("error", (error) => { if (!closed) port.onerror?.({ message: error.message }); });
  process.on("exit", (code) => { if (!closed) port.onerror?.({ message: errors || `Stockfish exited unexpectedly with ${code}` }); });
  return port;
}

test("real Stockfish WASM returns legal moves at all seven difficulties", { timeout: 30000 }, async () => {
  const engine = new ChessEngine({ workerFactory: nativePort });
  try {
    const chess = new Chess();
    for (const level of DIFFICULTIES) {
      const result = await engine.bestMove(chess.fen(), { difficulty: level.id, thinkMs: 120 });
      assert.match(result.move, /^[a-h][1-8][a-h][1-8][qrbn]?$/);
      const move = chess.move({ from: result.move.slice(0, 2), to: result.move.slice(2, 4), promotion: result.move[4] });
      assert.ok(move, `${level.label} must return a legal move`);
      assert.ok(Number.isFinite(result.evaluation));
      assert.ok(result.depth > 0);
    }
    const analysis = await engine.evaluate(chess.fen(), 150);
    assert.ok(analysis.depth > 0);
    assert.ok(analysis.pv.length > 0);
    assert.ok(chess.move({ from: analysis.move.slice(0, 2), to: analysis.move.slice(2, 4), promotion: analysis.move[4] }));
  } finally { engine.destroy(); }
});

test("real Stockfish resolves a forced mate and correctly signs evaluation", { timeout: 30000 }, async () => {
  const engine = new ChessEngine({ workerFactory: nativePort });
  try {
    const chess = new Chess();
    ["f3", "e5", "g4"].forEach((move) => chess.move(move));
    const result = await engine.evaluate(chess.fen(), 200);
    assert.equal(result.move, "d8h4");
    assert.equal(result.mate, -1);
    assert.ok(result.evaluation < 0);
  } finally { engine.destroy(); }
});
