'use client';

import { Chess, type Color, type PieceSymbol, type Square } from 'chess.js';
import { useCallback, useEffect, useId, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import './board.css';

export type BoardMove = { from: string; to: string; promotion?: string };
type Arrow = { from: string; to: string; color?: 'green' | 'amber' };
type RenderPiece = { id: string; square: Square; type: PieceSymbol; color: Color };
type Gesture = {
  pointerId: number;
  from: Square;
  startX: number;
  startY: number;
  rect: DOMRect;
  moved: boolean;
  annotation: boolean;
  canDrag: boolean;
  hadSelection: boolean;
};

export interface BoardProps {
  fen: string;
  orientation: Color;
  interactive: boolean;
  allowedColor?: Color;
  onMove: (move: BoardMove) => void;
  lastMove?: { from: string; to: string } | null;
  hint?: { from: string; to: string } | null;
  theme?: 'sage' | 'walnut' | 'slate' | 'blue';
  pieceStyle?: 'classic' | 'modern';
  coordinates?: boolean;
  legalIndicators?: boolean;
  animations?: boolean;
  autoQueen?: boolean;
  annotationMode?: boolean;
  onPickup?: () => void;
  premove?: BoardMove | null;
  onPremove?: (move: BoardMove | null) => void;
}

const PIECE_NAMES: Record<PieceSymbol, string> = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
const FILES = 'abcdefgh';

function position(square: string, orientation: Color) {
  const file = FILES.indexOf(square[0]);
  const rank = Number(square[1]) - 1;
  return orientation === 'w' ? { x: file, y: 7 - rank } : { x: 7 - file, y: rank };
}
function squareAt(x: number, y: number, rect: DOMRect, orientation: Color): Square | null {
  const column = Math.floor((x - rect.left) / (rect.width / 8));
  const row = Math.floor((y - rect.top) / (rect.height / 8));
  if (column < 0 || column > 7 || row < 0 || row > 7) return null;
  return (orientation === 'w' ? `${FILES[column]}${8 - row}` : `${FILES[7 - column]}${row + 1}`) as Square;
}
function asset(style: 'classic' | 'modern', color: Color, type: PieceSymbol) {
  return `/pieces/${style}/${color}${type.toUpperCase()}.svg`;
}

/** Pieces keep identities across moves, so transforms animate without replacing image nodes. */
function reconcilePieces(previous: RenderPiece[], chess: Chess, move?: { from: string; to: string } | null): RenderPiece[] {
  const current = chess.board().flat().filter((piece): piece is NonNullable<typeof piece> => !!piece);
  const result: RenderPiece[] = [];
  const used = new Set<string>();
  const assigned = new Set<Square>();
  if (move) {
    const before = previous.find(piece => piece.square === move.from);
    const after = current.find(piece => piece.square === move.to);
    if (before && after && before.color === after.color) {
      result.push({ ...after, id: before.id });
      used.add(before.id);
      assigned.add(after.square);
    }
  }
  for (const piece of current) {
    if (assigned.has(piece.square)) continue;
    const existing = previous.find(old => !used.has(old.id) && old.square === piece.square && old.type === piece.type && old.color === piece.color);
    if (existing) {
      result.push({ ...piece, id: existing.id });
      used.add(existing.id);
      assigned.add(piece.square);
    }
  }
  for (const piece of current) {
    if (assigned.has(piece.square)) continue;
    const existing = previous.find(old => !used.has(old.id) && old.type === piece.type && old.color === piece.color);
    let id = existing?.id ?? `${piece.color}${piece.type}-${piece.square}`;
    let suffix = 0;
    while (used.has(id)) id = `${piece.color}${piece.type}-${piece.square}-${++suffix}`;
    result.push({ ...piece, id });
    used.add(id);
    assigned.add(piece.square);
  }
  return result;
}

export default function Board({
  fen, orientation, interactive, allowedColor, onMove, lastMove = null, hint = null,
  theme = 'sage', pieceStyle = 'classic', coordinates = true, legalIndicators = true,
  animations = true, autoQueen = false, annotationMode = false, onPickup,
  premove = null, onPremove,
}: BoardProps) {
  const chess = useMemo(() => new Chess(fen), [fen]);
  const boardRef = useRef<HTMLDivElement>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const promotionRef = useRef<HTMLDivElement>(null);
  const squareRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const gesture = useRef<Gesture | null>(null);
  const previousPieces = useRef<RenderPiece[]>([]);
  const animationFrame = useRef<number | null>(null);
  const latestPointer = useRef({ x: 0, y: 0 });
  const [selected, setSelected] = useState<Square | null>(null);
  const [dragged, setDragged] = useState<Square | null>(null);
  const [droppedMove, setDroppedMove] = useState<{ from: Square; to: Square } | null>(null);
  const [focusSquare, setFocusSquare] = useState<Square>('e2');
  const [arrows, setArrows] = useState<Arrow[]>([]);
  const [marks, setMarks] = useState<string[]>([]);
  const [drawingArrow, setDrawingArrow] = useState<Arrow | null>(null);
  const [promotion, setPromotion] = useState<{ from: Square; to: Square; pending: boolean; color: Color } | null>(null);
  const id = useId().replace(/:/g, '');
  const turn = chess.turn();
  const ownColor = allowedColor ?? turn;
  const pendingTurn = ownColor !== turn;
  const mayPremove = pendingTurn && !!onPremove;
  const mayInteract = interactive && (!pendingTurn || mayPremove);

  const pieces = useMemo(() => {
    const next = reconcilePieces(previousPieces.current, chess, lastMove);
    previousPieces.current = next;
    return next;
  // lastMove's squares, rather than its object identity, prevent needless reconciliation.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chess, lastMove?.from, lastMove?.to]);

  const legalMoves = useMemo(() => selected && !pendingTurn ? chess.moves({ square: selected, verbose: true }) : [], [chess, selected, pendingTurn]);
  const legalSquares = useMemo(() => new Set(legalMoves.map(move => move.to)), [legalMoves]);
  const checkedKing = chess.isCheck() ? pieces.find(piece => piece.type === 'k' && piece.color === turn)?.square : null;
  const squares = useMemo(() => Array.from({ length: 8 }, (_, row) => Array.from({ length: 8 }, (_, col) =>
    (orientation === 'w' ? `${FILES[col]}${8 - row}` : `${FILES[7 - col]}${row + 1}`) as Square,
  )), [orientation]);

  const endDrag = useCallback(() => {
    if (animationFrame.current !== null) cancelAnimationFrame(animationFrame.current);
    animationFrame.current = null;
    if (ghostRef.current) ghostRef.current.style.display = 'none';
    setDragged(null);
    const current = gesture.current;
    gesture.current = null;
    if (current && boardRef.current?.hasPointerCapture(current.pointerId)) boardRef.current.releasePointerCapture(current.pointerId);
  }, []);

  useEffect(() => {
    setSelected(null);
    setPromotion(null);
    setArrows([]);
    setMarks([]);
    setDrawingArrow(null);
    endDrag();
  }, [fen, endDrag]);

  // A dropped piece is already under the pointer at its destination. Do not
  // animate it from its old square again when the parent commits the move.
  useEffect(() => {
    const timer = window.setTimeout(() => setDroppedMove(null), 180);
    return () => window.clearTimeout(timer);
  }, [fen]);

  useEffect(() => {
    setSelected(null);
    setDrawingArrow(null);
    endDrag();
  }, [orientation, endDrag]);

  useEffect(() => {
    if (interactive) return;
    setSelected(null);
    setPromotion(null);
    endDrag();
  }, [interactive, endDrag]);

  useEffect(() => () => {
    if (animationFrame.current !== null) cancelAnimationFrame(animationFrame.current);
  }, []);

  useEffect(() => {
    if (!promotion) return;
    const frame = requestAnimationFrame(() => promotionRef.current?.querySelector<HTMLButtonElement>('button')?.focus());
    return () => cancelAnimationFrame(frame);
  }, [promotion]);

  useEffect(() => {
    function cancel(event: globalThis.KeyboardEvent) {
      const target = event.target;
      if (target instanceof HTMLElement && (target.matches('input, textarea, select') || target.isContentEditable)) return;
      if (event.key === 'Escape') {
        setSelected(null);
        setPromotion(null);
        setArrows([]);
        setMarks([]);
        setDrawingArrow(null);
        onPremove?.(null);
        endDrag();
      }
    }
    window.addEventListener('keydown', cancel);
    return () => window.removeEventListener('keydown', cancel);
  }, [onPremove, endDrag]);

  const commitMove = useCallback((move: BoardMove, pending: boolean) => {
    setSelected(null);
    setPromotion(null);
    setArrows([]);
    setMarks([]);
    if (pending) onPremove?.(move);
    else onMove(move);
  }, [onMove, onPremove]);

  const attemptMove = useCallback((from: Square, to: Square) => {
    if (from === to || !mayInteract) return false;
    const piece = chess.get(from);
    if (!piece || piece.color !== ownColor) return false;
    if (mayPremove) {
      if (chess.get(to)?.color === ownColor) return false;
      const promotes = piece.type === 'p' && (to[1] === '1' || to[1] === '8');
      if (promotes && !autoQueen) setPromotion({ from, to, pending: true, color: piece.color });
      else commitMove({ from, to, ...(promotes ? { promotion: 'q' } : {}) }, true);
      return true;
    }
    const candidates = chess.moves({ square: from, verbose: true }).filter(move => move.to === to);
    if (!candidates.length) return false;
    const promotes = candidates.some(move => move.promotion);
    if (promotes && !autoQueen) setPromotion({ from, to, pending: false, color: piece.color });
    else commitMove({ from, to, ...(promotes ? { promotion: 'q' } : {}) }, false);
    return true;
  }, [chess, ownColor, mayInteract, mayPremove, autoQueen, commitMove]);

  const selectSquare = useCallback((square: Square) => {
    if (!mayInteract || promotion) return;
    if (selected && selected !== square && attemptMove(selected, square)) return;
    if (chess.get(square)?.color === ownColor) {
      const next = selected === square ? null : square;
      setSelected(next);
      if (next) onPickup?.();
    } else {
      setSelected(null);
      if (premove) onPremove?.(null);
    }
  }, [mayInteract, promotion, selected, attemptMove, chess, ownColor, onPickup, premove, onPremove]);

  function updateGhost() {
    const current = gesture.current;
    const ghost = ghostRef.current;
    if (!current || !ghost || !current.moved) return;
    const size = current.rect.width / 8;
    ghost.style.transform = `translate3d(${latestPointer.current.x - current.rect.left - size / 2}px,${latestPointer.current.y - current.rect.top - size / 2}px,0)`;
    animationFrame.current = null;
  }

  function pointerDown(event: PointerEvent<HTMLDivElement>) {
    if (promotion || (event.button !== 0 && event.button !== 2)) return;
    if (gesture.current) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const from = squareAt(event.clientX, event.clientY, rect, orientation);
    if (!from) return;
    const annotation = event.button === 2 || annotationMode || event.shiftKey;
    if (!annotation && !mayInteract) return;
    event.preventDefault();
    const canDrag = !annotation && chess.get(from)?.color === ownColor;
    gesture.current = { pointerId: event.pointerId, from, startX: event.clientX, startY: event.clientY, rect, moved: false, annotation, canDrag, hadSelection: selected === from };
    event.currentTarget.setPointerCapture(event.pointerId);
    setFocusSquare(from);
    squareRefs.current.get(from)?.focus({ preventScroll: true });
    if (annotation) setDrawingArrow({ from, to: from });
  }

  function pointerMove(event: PointerEvent<HTMLDivElement>) {
    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId) return;
    if (current.annotation) {
      const to = squareAt(event.clientX, event.clientY, current.rect, orientation);
      if (to) setDrawingArrow(previous => previous?.to === to ? previous : { from: current.from, to });
      return;
    }
    if (!current.canDrag) return;
    if (!current.moved && Math.hypot(event.clientX - current.startX, event.clientY - current.startY) > (event.pointerType === 'touch' ? 8 : 4)) {
      current.moved = true;
      onPickup?.();
      setDragged(current.from);
      setSelected(current.from);
      const ghost = ghostRef.current;
      const piece = chess.get(current.from);
      if (ghost && piece) {
        const img = ghost.querySelector('img');
        if (img) img.src = asset(pieceStyle, piece.color, piece.type);
        ghost.style.display = 'block';
      }
    }
    if (!current.moved) return;
    event.preventDefault();
    latestPointer.current = { x: event.clientX, y: event.clientY };
    if (animationFrame.current === null) animationFrame.current = requestAnimationFrame(updateGhost);
  }

  function pointerUp(event: PointerEvent<HTMLDivElement>) {
    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const to = squareAt(event.clientX, event.clientY, current.rect, orientation);
    if (current.annotation) {
      if (to === current.from) setMarks(previous => previous.includes(to) ? previous.filter(square => square !== to) : [...previous, to]);
      else if (to) setArrows(previous => previous.some(arrow => arrow.from === current.from && arrow.to === to)
        ? previous.filter(arrow => !(arrow.from === current.from && arrow.to === to))
        : [...previous.slice(-19), { from: current.from, to }]);
      setDrawingArrow(null);
    } else if (current.moved) {
      if (!to || !attemptMove(current.from, to)) setSelected(current.from);
      else setDroppedMove({ from: current.from, to });
    } else if (to) selectSquare(to);
    endDrag();
  }

  function handleKey(event: KeyboardEvent<HTMLButtonElement>, square: Square) {
    if (promotion) return;
    const { x, y } = position(square, orientation);
    let nextX = x, nextY = y;
    if (event.key === 'ArrowLeft') nextX--;
    else if (event.key === 'ArrowRight') nextX++;
    else if (event.key === 'ArrowUp') nextY--;
    else if (event.key === 'ArrowDown') nextY++;
    else if (event.key === 'Home') nextX = 0;
    else if (event.key === 'End') nextX = 7;
    else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      event.stopPropagation();
      if (annotationMode) setMarks(previous => previous.includes(square) ? previous.filter(item => item !== square) : [...previous, square]);
      else selectSquare(square);
      return;
    } else return;
    event.preventDefault();
    event.stopPropagation();
    const next = squares[Math.max(0, Math.min(7, nextY))][Math.max(0, Math.min(7, nextX))];
    setFocusSquare(next);
    squareRefs.current.get(next)?.focus();
  }

  const allArrows: Arrow[] = [...arrows, ...(hint ? [{ ...hint, color: 'amber' as const }] : []), ...(drawingArrow && drawingArrow.from !== drawingArrow.to ? [drawingArrow] : [])];

  return (
    <div
      ref={boardRef}
      className={`chess-board board-${theme}${animations ? ' board-animated' : ''}${dragged ? ' board-dragging' : ''}${annotationMode ? ' board-annotating' : ''}${!mayInteract ? ' board-readonly' : ''}`}
      role="group"
      aria-label={`Chessboard. ${turn === 'w' ? 'White' : 'Black'} to move${chess.isCheck() ? ', in check' : ''}. ${orientation === 'w' ? 'White' : 'Black'} at bottom.`}
      onContextMenu={event => event.preventDefault()}
      onPointerDown={pointerDown}
      onPointerMove={pointerMove}
      onPointerUp={pointerUp}
      onPointerCancel={() => { endDrag(); setDrawingArrow(null); }}
      onLostPointerCapture={() => { if (gesture.current) { endDrag(); setDrawingArrow(null); } }}
    >
      <div role="grid" aria-label="Chess squares. Arrow keys navigate; Enter selects a piece or destination." aria-rowcount={8} aria-colcount={8} className="board-squares">
        {squares.map((row, rowIndex) => <div role="row" key={rowIndex} className="board-row">
          {row.map((square, colIndex) => {
            const piece = chess.get(square);
            const isDark = (FILES.indexOf(square[0]) + Number(square[1])) % 2 === 1;
            const isLast = lastMove?.from === square || lastMove?.to === square;
            const isPremove = premove?.from === square || premove?.to === square;
            const isLegal = legalIndicators && legalSquares.has(square);
            const isMarked = marks.includes(square) || (drawingArrow?.from === square && drawingArrow.to === square);
            return <button
              key={square}
              type="button"
              ref={element => { if (element) squareRefs.current.set(square, element); else squareRefs.current.delete(square); }}
              role="gridcell"
              aria-rowindex={rowIndex + 1}
              aria-colindex={colIndex + 1}
              aria-selected={selected === square}
              aria-label={`${square}${piece ? `, ${piece.color === 'w' ? 'white' : 'black'} ${PIECE_NAMES[piece.type]}` : ', empty'}${isLegal ? ', legal destination' : ''}${checkedKing === square ? ', check' : ''}`}
              tabIndex={focusSquare === square ? 0 : -1}
              className={`board-square ${isDark ? 'square-dark' : 'square-light'}${isLast ? ' square-last' : ''}${selected === square ? ' square-selected' : ''}${isPremove ? ' square-premove' : ''}${checkedKing === square ? ' square-check' : ''}`}
              onKeyDown={event => handleKey(event, square)}
              onClick={event => {
                if (event.detail !== 0) return;
                if (annotationMode) setMarks(previous => previous.includes(square) ? previous.filter(item => item !== square) : [...previous, square]);
                else selectSquare(square);
              }}
              onFocus={() => setFocusSquare(square)}
              data-square={square}
            >
              {isLegal && <span className={piece ? 'board-capture-indicator' : 'board-move-indicator'} aria-hidden="true" />}
              {isMarked && <span className="board-mark" aria-hidden="true" />}
              {coordinates && colIndex === 0 && <span className="board-rank" aria-hidden="true">{square[1]}</span>}
              {coordinates && rowIndex === 7 && <span className="board-file" aria-hidden="true">{square[0]}</span>}
            </button>;
          })}
        </div>)}
      </div>
      <div className="board-pieces" aria-hidden="true">
        {pieces.map(piece => {
          const { x, y } = position(piece.square, orientation);
          return <div key={piece.id} className={`board-piece${dragged === piece.square ? ' board-piece-hidden' : ''}${droppedMove && (droppedMove.from === piece.square || droppedMove.to === piece.square) ? ' board-piece-dropped' : ''}`} style={{ transform: `translate(${x * 100}%, ${y * 100}%)` } as CSSProperties} data-piece={`${piece.color}${piece.type}`}>
            <img src={asset(pieceStyle, piece.color, piece.type)} alt="" draggable={false} decoding="async" />
          </div>;
        })}
      </div>
      <svg className="board-arrows" viewBox="0 0 800 800" aria-hidden="true">
        <defs>
          <marker id={`arrow-${id}-green`} markerWidth="4" markerHeight="4" refX="2.8" refY="2" orient="auto"><path d="M0,0 L3.5,2 L0,4 Z" fill="var(--board-arrow)" /></marker>
          <marker id={`arrow-${id}-amber`} markerWidth="4" markerHeight="4" refX="2.8" refY="2" orient="auto"><path d="M0,0 L3.5,2 L0,4 Z" fill="var(--board-hint)" /></marker>
        </defs>
        {allArrows.filter(arrow => arrow.from !== arrow.to).map((arrow, index) => {
          const from = position(arrow.from, orientation);
          const to = position(arrow.to, orientation);
          const x1 = from.x * 100 + 50, y1 = from.y * 100 + 50;
          const x2 = to.x * 100 + 50, y2 = to.y * 100 + 50;
          const length = Math.hypot(x2 - x1, y2 - y1);
          const trim = Math.min(18, length * 0.12);
          const endX = x2 - (x2 - x1) / length * trim;
          const endY = y2 - (y2 - y1) / length * trim;
          const color = arrow.color ?? 'green';
          return <line key={`${arrow.from}-${arrow.to}-${index}`} x1={x1} y1={y1} x2={endX} y2={endY} stroke={`var(--board-${color === 'green' ? 'arrow' : 'hint'})`} strokeWidth="17" strokeLinecap="round" markerEnd={`url(#arrow-${id}-${color})`} />;
        })}
      </svg>
      <div className="board-drag-ghost" ref={ghostRef} aria-hidden="true"><img alt="" draggable={false} /></div>
      {promotion && <div className="board-promotion-mask" onPointerDown={event => event.stopPropagation()}>
        <div
          className="board-promotion"
          role="dialog"
          aria-modal="true"
          aria-labelledby={`promotion-${id}`}
          ref={promotionRef}
          onKeyDown={event => {
            if (event.key === 'Escape') { event.stopPropagation(); setPromotion(null); squareRefs.current.get(promotion.from)?.focus(); }
            if (event.key === 'Tab') {
              const buttons = Array.from(promotionRef.current?.querySelectorAll<HTMLButtonElement>('button') ?? []);
              const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
              event.preventDefault();
              buttons[(index + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length]?.focus();
            }
          }}
        >
          <div className="board-promotion-title" id={`promotion-${id}`}>Promote your pawn</div>
          <div className="board-promotion-choices">
            {(['q', 'r', 'b', 'n'] as PieceSymbol[]).map(type => <button type="button" key={type} onClick={() => commitMove({ from: promotion.from, to: promotion.to, promotion: type }, promotion.pending)} aria-label={`Promote to ${PIECE_NAMES[type]}`}>
              <img src={asset(pieceStyle, promotion.color, type)} alt="" /><span>{PIECE_NAMES[type]}</span>
            </button>)}
          </div>
          <button className="board-promotion-cancel" type="button" onClick={() => { setPromotion(null); squareRefs.current.get(promotion.from)?.focus(); }}>Cancel</button>
        </div>
      </div>}
    </div>
  );
}
