import { Chess, type Color, type PieceSymbol, type Square } from 'chess.js';

export type { Color } from 'chess.js';

export interface MoveInput {
  from: string;
  to: string;
  promotion?: string;
}

export interface GameResult {
  winner: Color | null;
  reason: string;
  result: '1-0' | '0-1' | '1/2-1/2';
}

export interface DrawClaims {
  threefold: boolean;
  fiftyMove: boolean;
}

/** Rules reference: https://handbook.fide.com/chapter/e012023, articles 5, 6.9, 9. */
export const RULES_SCOPE =
  'Legal moves, mate, stalemate, repetition, move-count draws, and orthodox mating-material cases are adjudicated. General locked-position reachability is not exhaustively solved.';

const NO_CLAIMS: DrawClaims = { threefold: false, fiftyMove: false };

export function opposite(color: Color): Color {
  return color === 'w' ? 'b' : 'w';
}

function draw(reason: string): GameResult {
  return { winner: null, reason, result: '1/2-1/2' };
}

function win(winner: Color, reason: string): GameResult {
  return { winner, reason, result: winner === 'w' ? '1-0' : '0-1' };
}

/** The same legal-move implementation is used on the client and server. */
export function createChess(initialFen: string, moves: readonly MoveInput[] = []): Chess {
  const chess = new Chess(initialFen);
  for (const move of moves) {
    chess.move(move);
  }
  return chess;
}

function halfMoves(chess: Chess): number {
  return Number(chess.fen().split(' ')[4]);
}

function positionKey(fen: string): string {
  // chess.js emits the en-passant field only if a legal EP capture exists.
  // Halfmove/fullmove counters do not form part of position identity (9.2.3).
  return fen.split(' ').slice(0, 4).join(' ');
}

/** Counts full position identity, including turn, castling and legal en passant. */
export function repetitionCount(chess: Chess): number {
  const history = chess.history({ verbose: true });
  if (history.length === 0) return 1;
  const key = positionKey(chess.fen());
  let count = positionKey(history[0].before) === key ? 1 : 0;
  for (const move of history) {
    if (positionKey(move.after) === key) count += 1;
  }
  return count;
}

function copyGame(chess: Chess): Chess {
  const history = chess.history({ verbose: true });
  return createChess(history[0]?.before ?? chess.fen(), history);
}

interface MaterialPiece {
  type: PieceSymbol;
  color: Color;
  square: Square;
}

function material(chess: Chess): MaterialPiece[] {
  return chess.board().flat().filter((piece): piece is MaterialPiece => piece !== null);
}

/** A proof of impossibility by material, never by an engine's evaluation. */
function lacksMatingMaterial(chess: Chess, color: Color): boolean {
  const all = material(chess);
  const own = all.filter((piece) => piece.color === color && piece.type !== 'k');
  if (own.length === 0) return true;
  if (own.some((piece) => piece.type === 'p' || piece.type === 'r' || piece.type === 'q')) {
    return false;
  }

  const knights = own.filter((piece) => piece.type === 'n');
  if (knights.length > 0) {
    // Two knights CAN mate a cooperating bare king; inability to force mate
    // does not qualify as insufficient material. A lone knight cannot mate
    // against just a king (or a king and queens). Other opposing pieces can
    // block escape squares and permit a legal mating position.
    return own.length === 1 && all.every((piece) =>
      piece.color === color || piece.type === 'k' || piece.type === 'q',
    );
  }

  // Every remaining friendly non-king piece is a bishop. Bishops confined to
  // one square color cannot mate without a pawn, knight or opposite-colored
  // bishop somewhere on the board to enable a cooperative mating net.
  if (all.some((piece) => piece.type === 'p' || piece.type === 'n')) return false;
  const bishopColors = new Set(all.filter((piece) => piece.type === 'b').map((piece) => {
    return (piece.square.charCodeAt(0) - 97 + Number(piece.square[1]) - 1) % 2;
  }));
  return bishopColors.size === 1;
}

type Reachability = 'possible' | 'impossible' | 'unknown';

/**
 * A small exhaustive proof for forced endgame continuations. Hitting a budget
 * is UNKNOWN, never a draw. No engine score or failed mate search proves death.
 * Most ordinary positions are rejected at the branching gate in constant work.
 */
function forcedMateReachability(chess: Chess, color: Color): Reachability {
  if (material(chess).length > 7) return 'unknown';
  let budget = 96;
  const visit = (position: Chess, depth: number): Reachability => {
    if (position.isCheckmate()) return position.turn() !== color ? 'possible' : 'impossible';
    if (lacksMatingMaterial(position, color)) return 'impossible';
    if (position.isStalemate()) return 'impossible';
    if (depth <= 0 || budget <= 0) return 'unknown';
    budget -= 1;
    const moves = position.moves({ verbose: true });
    if (moves.length > 3) return 'unknown';
    let unknown = false;
    for (const move of moves) {
      position.move(move);
      let result: Reachability;
      try {
        result = visit(position, depth - 1);
      } finally {
        position.undo();
      }
      if (result === 'possible') return 'possible';
      if (result === 'unknown') unknown = true;
    }
    return unknown ? 'unknown' : 'impossible';
  };
  return visit(new Chess(chess.fen()), 6);
}

/**
 * False means mate is proven impossible, including cooperative play. True is
 * deliberately conservative when arbitrary locked-position reachability is
 * not resolved. This limitation is documented in RULES_SCOPE and the README.
 */
export function canPossiblyMate(chess: Chess, color: Color): boolean {
  if (chess.isCheckmate()) return chess.turn() !== color;
  if (chess.isStalemate() || lacksMatingMaterial(chess, color)) return false;
  return forcedMateReachability(chess, color) !== 'impossible';
}

/** Automatic results ONLY. Threefold and 50 moves require a player claim. */
export function automaticResult(chess: Chess): GameResult | null {
  if (chess.isCheckmate()) return win(opposite(chess.turn()), 'Checkmate');
  if (chess.isStalemate()) return draw('Stalemate');
  if (chess.isInsufficientMaterial()) return draw('Insufficient mating material');
  if (!canPossiblyMate(chess, 'w') && !canPossiblyMate(chess, 'b')) return draw('Dead position');
  if (halfMoves(chess) >= 150) return draw('Seventy-five-move rule');
  if (repetitionCount(chess) >= 5) return draw('Fivefold repetition');
  return null;
}

/**
 * With no intendedMove, checks the CURRENT position only. With a legal intended
 * move, also permits a claim made before executing that move (9.2.1 / 9.3.1).
 * The original board, history, repetition state and PGN headers are untouched.
 */
export function claimOptions(chess: Chess, intendedMove?: MoveInput): DrawClaims {
  if (automaticResult(chess)) return { ...NO_CLAIMS };
  const current = {
    threefold: repetitionCount(chess) >= 3,
    fiftyMove: halfMoves(chess) >= 100,
  };
  if (!intendedMove) return current;
  const candidate = copyGame(chess);
  try {
    candidate.move(intendedMove);
  } catch {
    return { ...NO_CLAIMS };
  }
  return {
    threefold: current.threefold || repetitionCount(candidate) >= 3,
    fiftyMove: current.fiftyMove || halfMoves(candidate) >= 100,
  };
}

export function claimDraw(
  chess: Chess,
  kind: 'threefold' | 'fifty',
  intendedMove?: MoveInput,
): GameResult | null {
  const claims = claimOptions(chess, intendedMove);
  if (kind === 'threefold' && claims.threefold) return draw('Threefold repetition claimed');
  if (kind === 'fifty' && claims.fiftyMove) return draw('Fifty-move rule claimed');
  return null;
}

export function timeoutResult(chess: Chess, flaggedColor: Color): GameResult {
  // A completed mate or automatic draw takes precedence over a later timer tick.
  const completed = automaticResult(chess);
  if (completed) return completed;
  const winner = opposite(flaggedColor);
  return canPossiblyMate(chess, winner)
    ? win(winner, 'Time expired')
    : draw('Time expired — insufficient mating material');
}

/** Article 5.1.2 gives resignation the same impossible-mate exception. */
export function resignationResult(chess: Chess, resigningColor: Color): GameResult {
  const completed = automaticResult(chess);
  if (completed) return completed;
  const winner = opposite(resigningColor);
  return canPossiblyMate(chess, winner)
    ? win(winner, 'Resignation')
    : draw('Resignation — insufficient mating material');
}
