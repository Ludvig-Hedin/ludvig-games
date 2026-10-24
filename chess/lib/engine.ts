import { Chess } from "chess.js";

/** Display estimates, not measured ratings. See public/engine/NOTICE.md. */
export const DIFFICULTIES = [
  { id: 0, label: "Beginner", elo: 400, skill: 0 },
  { id: 1, label: "Easy", elo: 700, skill: 1 },
  { id: 2, label: "Casual", elo: 1000, skill: 3 },
  { id: 3, label: "Intermediate", elo: 1300, skill: 5 },
  { id: 4, label: "Advanced", elo: 1600, skill: 8 },
  { id: 5, label: "Expert", elo: 1900, skill: 13 },
  { id: 6, label: "Master", elo: 2200, skill: 18 },
] as const;

export const ENGINE_URL = "/engine/stockfish-19-lite-single.js";

export type MoveQuality = "best" | "good" | "inaccuracy" | "mistake" | "blunder";

/** A transparent, consistent centipawn-loss rule, independent of player ratings. */
export function classifyMove(cpLoss: number): MoveQuality {
  const loss = Math.max(0, cpLoss);
  if (loss <= 15) return "best";
  if (loss < 50) return "good";
  if (loss < 100) return "inaccuracy";
  if (loss < 250) return "mistake";
  return "blunder";
}

export interface EngineResult {
  move: string;
  ponder?: string;
  /** Centipawns, always from White's perspective. */
  evaluation: number;
  /** Mate distance, positive for White and negative for Black. */
  mate?: number;
  pv: string[];
  depth: number;
}

export interface SearchOptions {
  difficulty?: number;
  thinkMs?: number;
  signal?: AbortSignal;
  /** Preserve repetitions by passing the starting position and the complete UCI history. */
  moves?: string[];
  initialFen?: string;
}

/** Small injectable boundary: the browser uses a real dedicated Web Worker. */
export interface EnginePort {
  postMessage(message: string): void;
  terminate(): void;
  onmessage: ((event: { data: unknown }) => void) | null;
  onerror: ((event: { message?: string }) => void) | null;
}

interface PrincipalVariation {
  index: number;
  depth: number;
  score: number;
  mate?: number;
  pv: string[];
}

interface SearchJob {
  id: symbol;
  epoch: number;
  legal: Set<string>;
  turn: "w" | "b";
  difficulty: number | null;
  lines: Map<number, Map<number, PrincipalVariation>>;
  multiPV: number;
  resolve: (result: EngineResult) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

function aborted(): Error {
  const error = new Error("Engine calculation cancelled.");
  error.name = "AbortError";
  return error;
}

function uciMove(move: { from: string; to: string; promotion?: string }): string {
  return move.from + move.to + (move.promotion ?? "");
}

function parseInfo(line: string): PrincipalVariation | null {
  if (!line.startsWith("info ") || /\b(?:lowerbound|upperbound)\b/.test(line)) return null;
  const score = /\bscore (cp|mate) (-?\d+)/.exec(line);
  const pv = /\bpv (.+)$/.exec(line);
  if (!score || !pv) return null;
  const amount = Number(score[2]);
  const mate = score[1] === "mate" ? amount : undefined;
  return {
    index: Number(/\bmultipv (\d+)/.exec(line)?.[1] ?? 1),
    depth: Number(/\bdepth (\d+)/.exec(line)?.[1] ?? 0),
    score: mate === undefined ? amount : (amount >= 0 ? 1 : -1) * (100000 - Math.abs(amount) * 100),
    mate,
    pv: pv[1].trim().split(/\s+/),
  };
}

function randomUnit(): number {
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    return crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296;
  }
  return Math.random();
}

/**
 * A serialized UCI session. Cancelling destroys its worker instead of allowing
 * an old `bestmove` to resolve a new request. Pending queue entries carry an
 * epoch and cannot run after a restart. No search runs on the UI thread.
 */
export class ChessEngine {
  private worker: EnginePort | null = null;
  private initialized = false;
  private destroyed = false;
  private epoch = 0;
  private workerEpoch = 0;
  private tail: Promise<unknown> = Promise.resolve();
  private current: SearchJob | null = null;
  private activeToken: symbol | null = null;
  private eloMin = 1320;
  private eloMax = 3190;
  private boot: {
    promise: Promise<void>;
    resolve: () => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  } | null = null;
  private readonly workerFactory: (url: string) => EnginePort;

  constructor(options?: { workerFactory?: (url: string) => EnginePort }) {
    this.workerFactory = options?.workerFactory ?? ((url) => {
      if (typeof Worker === "undefined") throw new Error("This browser does not support chess engine workers.");
      return new Worker(url, { name: "chess-stockfish" }) as unknown as EnginePort;
    });
  }

  ready(): Promise<void> {
    if (this.destroyed) return Promise.reject(new Error("The chess engine has been closed."));
    if (this.initialized && this.worker) return Promise.resolve();
    if (this.boot) return this.boot.promise;

    const workerEpoch = ++this.workerEpoch;
    let resolveBoot!: () => void;
    let rejectBoot!: (error: Error) => void;
    const promise = new Promise<void>((resolve, reject) => {
      resolveBoot = resolve;
      rejectBoot = reject;
    });
    const timer = setTimeout(() => this.reset(new Error("Stockfish took too long to load. Check your connection and try again.")), 25000);
    this.boot = { promise, resolve: resolveBoot, reject: rejectBoot, timer };

    try {
      const worker = this.workerFactory(ENGINE_URL);
      this.worker = worker;
      worker.onmessage = (event) => {
        if (workerEpoch !== this.workerEpoch) return;
        const text = typeof event.data === "string" ? event.data : "";
        for (const line of text.split(/\r?\n/)) this.receive(line.trim());
      };
      worker.onerror = (event) => {
        if (workerEpoch !== this.workerEpoch) return;
        this.reset(new Error(event.message ? `Stockfish could not run: ${event.message}` : "Stockfish could not load. Please try again."));
      };
      worker.postMessage("uci");
    } catch (error) {
      this.reset(error instanceof Error ? error : new Error("Stockfish could not start."));
    }
    return promise;
  }

  bestMove(fen: string, options: SearchOptions = {}): Promise<EngineResult> {
    return this.enqueue(fen, options, false);
  }

  evaluate(fen: string, thinkMs = 850, signal?: AbortSignal): Promise<EngineResult> {
    return this.enqueue(fen, { thinkMs, signal }, true);
  }

  cancel(): void {
    ++this.epoch;
    this.reset(aborted());
  }

  destroy(): void {
    this.destroyed = true;
    this.cancel();
  }

  private reset(error: Error): void {
    ++this.workerEpoch;
    this.worker?.terminate();
    this.worker = null;
    this.initialized = false;
    if (this.boot) {
      const boot = this.boot;
      this.boot = null;
      clearTimeout(boot.timer);
      boot.reject(error);
    }
    if (this.current) {
      const current = this.current;
      this.current = null;
      clearTimeout(current.timer);
      current.reject(error);
    }
  }

  private enqueue(fen: string, options: SearchOptions, analysis: boolean): Promise<EngineResult> {
    const epoch = this.epoch;
    const token = Symbol("engine-job");
    const signal = options.signal;
    let cancelled = signal?.aborted ?? false;
    let rejectAbort!: (error: Error) => void;
    const abortPromise = new Promise<never>((_, reject) => { rejectAbort = reject; });
    const onAbort = () => {
      cancelled = true;
      rejectAbort(aborted());
      // An aborted queued analysis must never stop another game's active search.
      if (this.activeToken === token) this.reset(aborted());
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    const work = this.tail.then(async () => {
      if (cancelled || this.epoch !== epoch) throw aborted();
      if (this.destroyed) throw new Error("The chess engine has been closed.");
      this.activeToken = token;
      try {
        await this.ready();
        if (cancelled || this.epoch !== epoch) throw aborted();
        return await this.search(fen, options, analysis, epoch, token);
      } finally {
        if (this.activeToken === token) this.activeToken = null;
      }
    });
    this.tail = work.catch(() => undefined);
    return Promise.race([work, abortPromise]).finally(() => signal?.removeEventListener("abort", onAbort));
  }

  private search(fen: string, options: SearchOptions, analysis: boolean, epoch: number, token: symbol): Promise<EngineResult> {
    // chess.js validates the FEN and every move; user input never becomes a UCI command.
    const chess = new Chess(fen);
    const legal = new Set(chess.moves({ verbose: true }).map(uciMove));
    if (legal.size === 0) {
      const mate = chess.isCheckmate();
      return Promise.resolve({
        move: "(none)",
        evaluation: mate ? (chess.turn() === "w" ? -100000 : 100000) : 0,
        ...(mate ? { mate: chess.turn() === "w" ? -0 : 0 } : {}),
        pv: [], depth: 0,
      });
    }

    const requestedDifficulty = Number.isFinite(options.difficulty) ? options.difficulty! : 2;
    const difficulty = analysis ? null : Math.max(0, Math.min(6, Math.round(requestedDifficulty)));
    const level = DIFFICULTIES[difficulty ?? 6];
    const multiPV = analysis || (difficulty ?? 6) >= 3 ? 1 : Math.min([24, 16, 10][difficulty!], legal.size);
    const requestedTime = Number.isFinite(options.thinkMs) ? options.thinkMs! : analysis ? 850 : 700;
    const thinkMs = Math.round(Math.max(80, Math.min(15000, requestedTime)));

    let positionCommand = `position fen ${chess.fen()}`;
    if (options.initialFen !== undefined && options.moves !== undefined) {
      const history = new Chess(options.initialFen);
      for (const move of options.moves) {
        if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(move)) throw new Error("Invalid move history for Stockfish.");
        history.move({ from: move.slice(0, 2), to: move.slice(2, 4), promotion: move[4] });
      }
      if (history.fen() !== chess.fen()) throw new Error("The engine position and move history do not match.");
      positionCommand = `position fen ${new Chess(options.initialFen).fen()}${options.moves.length ? ` moves ${options.moves.join(" ")}` : ""}`;
    }

    const worker = this.worker;
    if (!worker || !this.initialized) return Promise.reject(new Error("Stockfish is not ready."));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => this.reset(new Error("Stockfish stopped responding. Try the move again.")), thinkMs + 12000);
      this.current = { id: token, epoch, legal, turn: chess.turn(), difficulty, lines: new Map(), multiPV, resolve, reject, timer };
      // Explicitly reset every option so a previous analysis cannot change a bot's strength.
      worker.postMessage(`setoption name Skill Level value ${analysis ? 20 : level.skill}`);
      worker.postMessage(`setoption name UCI_LimitStrength value ${difficulty !== null && difficulty >= 3 ? "true" : "false"}`);
      if (difficulty !== null && difficulty >= 3) {
        worker.postMessage(`setoption name UCI_Elo value ${Math.max(this.eloMin, Math.min(this.eloMax, level.elo))}`);
      }
      worker.postMessage(`setoption name MultiPV value ${multiPV}`);
      worker.postMessage(positionCommand);
      // The beginner depths are deliberate: high-depth knowledge is inappropriate at these levels.
      const depth = difficulty === null ? "" : difficulty < 3 ? ` depth ${[3, 5, 7][difficulty]}` : "";
      worker.postMessage(`go movetime ${thinkMs}${depth}`);
    });
  }

  private receive(line: string): void {
    if (!line) return;
    const eloRange = /^option name UCI_Elo .* min (\d+) max (\d+)/.exec(line);
    if (eloRange) {
      this.eloMin = Number(eloRange[1]);
      this.eloMax = Number(eloRange[2]);
    }
    if (line === "uciok" && this.boot) {
      this.worker?.postMessage("setoption name Hash value 32");
      this.worker?.postMessage("setoption name Ponder value false");
      this.worker?.postMessage("isready");
      return;
    }
    if (line === "readyok" && this.boot) {
      const boot = this.boot;
      this.boot = null;
      clearTimeout(boot.timer);
      this.initialized = true;
      boot.resolve();
      return;
    }
    const job = this.current;
    if (!job || job.epoch !== this.epoch) return;
    const info = parseInfo(line);
    if (info && job.legal.has(info.pv[0])) {
      if (!job.lines.has(info.depth)) job.lines.set(info.depth, new Map());
      job.lines.get(info.depth)!.set(info.index, info);
      // Only a few completed iterations are relevant; bound memory in long analysis.
      for (const depth of job.lines.keys()) if (depth < info.depth - 2) job.lines.delete(depth);
    }
    const best = /^bestmove (\S+)(?: ponder (\S+))?/.exec(line);
    if (!best) return;
    clearTimeout(job.timer);
    this.current = null;
    if (!job.legal.has(best[1])) {
      job.reject(new Error("Stockfish returned an invalid move. Please retry the calculation."));
      return;
    }
    const depths = [...job.lines.keys()].sort((a, b) => b - a);
    const fullDepth = depths.find((depth) => job.lines.get(depth)!.size >= job.multiPV) ?? depths[0];
    const candidates = fullDepth === undefined ? [] : [...job.lines.get(fullDepth)!.values()].sort((a, b) => a.index - b.index);
    let move = best[1];
    let chosen = candidates.find((entry) => entry.pv[0] === move) ?? candidates[0];

    if (job.difficulty !== null && job.difficulty < 3 && candidates.length > 1) {
      // Stockfish's native skill remains enabled. Additional low-level weakening
      // samples only its evaluated candidate moves, rather than random legal moves.
      const keepNative = [0.25, 0.48, 0.72][job.difficulty];
      if (randomUnit() > keepNative) {
        const temperature = [240, 120, 55][job.difficulty];
        const topScore = Math.max(...candidates.map((candidate) => candidate.score));
        const viable = candidates.filter((candidate) => candidate.score > -90000 || topScore < -90000);
        const weighted = viable.map((candidate) => ({ candidate, weight: 1 / (1 + Math.max(0, topScore - candidate.score) / temperature) ** 2 }));
        let draw = randomUnit() * weighted.reduce((sum, entry) => sum + entry.weight, 0);
        for (const entry of weighted) {
          draw -= entry.weight;
          if (draw <= 0) { chosen = entry.candidate; move = chosen.pv[0]; break; }
        }
      }
    }
    const sign = job.turn === "w" ? 1 : -1;
    job.resolve({
      move,
      ponder: move === best[1] ? best[2] : chosen?.pv[1],
      evaluation: (chosen?.score ?? 0) * sign,
      ...(chosen?.mate === undefined ? {} : { mate: chosen.mate * sign }),
      pv: chosen?.pv[0] === move ? chosen.pv : [move],
      depth: chosen?.depth ?? 0,
    });
  }
}
