"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { Mark, type MarkValue } from "./Mark";
import "./board.css";

export interface BoardProps {
  board: Array<MarkValue | null>;
  size: number;
  turn: MarkValue;
  disabled: boolean;
  line: number[];
  winner: MarkValue | null;
  onMove: (index: number) => void;
  roundKey: string | number;
  waiting?: boolean;
}

export function Board({ board, size, turn, disabled, line, winner, onMove, roundKey, waiting = false }: BoardProps) {
  const boardRef = useRef<HTMLDivElement>(null);
  const [focused, setFocused] = useState(0);
  const activeIndex = Math.min(focused, board.length - 1);
  const winningCells = new Set(line);
  const finished = Boolean(winner) || board.every(Boolean);
  const playable = !disabled && !finished && !waiting;
  const first = line[0];
  const last = line[line.length - 1];
  const point = (index: number) => ({
    x: ((index % size) + 0.5) * 100 / size,
    y: (Math.floor(index / size) + 0.5) * 100 / size,
  });
  const start = first !== undefined ? point(first) : null;
  const end = last !== undefined ? point(last) : null;

  function place(index: number) {
    if (playable && !board[index]) onMove(index);
  }

  function focusCell(index: number) {
    setFocused(index);
    boardRef.current?.querySelector<HTMLButtonElement>(`[data-cell="${index}"]`)?.focus({ preventScroll: true });
  }

  function handleKeyboard(event: KeyboardEvent<HTMLDivElement>) {
    const row = Math.floor(activeIndex / size);
    const col = activeIndex % size;
    let destination: number | null = null;
    switch (event.key) {
      case "ArrowLeft": destination = row * size + (col + size - 1) % size; break;
      case "ArrowRight": destination = row * size + (col + 1) % size; break;
      case "ArrowUp": destination = ((row + size - 1) % size) * size + col; break;
      case "ArrowDown": destination = ((row + 1) % size) * size + col; break;
      case "Home": destination = event.ctrlKey ? 0 : row * size; break;
      case "End": destination = event.ctrlKey ? size * size - 1 : row * size + size - 1; break;
      default: break;
    }
    if (destination !== null) {
      event.preventDefault();
      focusCell(destination);
    } else if (size === 3 && /^[1-9]$/.test(event.key) && !event.metaKey && !event.ctrlKey && !event.altKey) {
      event.preventDefault();
      const index = Number(event.key) - 1;
      focusCell(index);
      place(index);
    }
  }

  return (
    <div
      className={`board-frame${winner ? " board-frame--won" : ""}${waiting ? " board-frame--waiting" : ""}`}
      data-size={size}
    >
      <div
        className="board-grid"
        key={roundKey}
        ref={boardRef}
        role="grid"
        aria-label={`${size} by ${size} tic tac toe board`}
        aria-rowcount={size}
        aria-colcount={size}
        onKeyDown={handleKeyboard}
        style={{ gridTemplateColumns: `repeat(${size}, 1fr)` }}
      >
        {Array.from({ length: size }, (_, row) => (
          <div role="row" className="board-row" key={row} aria-rowindex={row + 1}>
            {Array.from({ length: size }, (_, col) => {
              const index = row * size + col;
              const value = board[index];
              const won = winningCells.has(index);
              return (
                <div role="gridcell" key={index} aria-colindex={col + 1} className="board-gridcell">
                  <button
                    type="button"
                    data-cell={index}
                    className={`board-cell${value ? " board-cell--occupied" : ""}${won ? " board-cell--winner" : ""}${playable && !value ? " board-cell--playable" : ""}`}
                    aria-label={`Row ${row + 1}, column ${col + 1}, ${value || "empty"}${won ? ", winning piece" : ""}`}
                    aria-disabled={!playable || Boolean(value)}
                    tabIndex={index === activeIndex ? 0 : -1}
                    onFocus={() => setFocused(index)}
                    onClick={() => place(index)}
                  >
                    {value ? (
                      <span className="board-piece" key={`${roundKey}-${index}-${value}`}>
                        <Mark mark={value} animated />
                      </span>
                    ) : playable ? (
                      <span className="board-ghost"><Mark mark={turn} /></span>
                    ) : null}
                  </button>
                </div>
              );
            })}
          </div>
        ))}
        <svg className="board-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {Array.from({ length: size - 1 }, (_, i) => {
            const position = (i + 1) * 100 / size;
            return <g key={i}><line x1={position} y1="1.5" x2={position} y2="98.5" /><line x1="1.5" y1={position} x2="98.5" y2={position} /></g>;
          })}
        </svg>
        {winner && start && end ? (
          <svg className={`board-win-line board-win-line--${winner.toLowerCase()}`} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <line x1={start.x} y1={start.y} x2={end.x} y2={end.y} pathLength="1" />
          </svg>
        ) : null}
      </div>
      <span className="board-corner-sheen" aria-hidden="true" />
    </div>
  );
}
