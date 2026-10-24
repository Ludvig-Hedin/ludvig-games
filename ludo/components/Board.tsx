"use client";

import { memo, useId, useLayoutEffect, useMemo, useRef, type CSSProperties } from "react";
import "./board.css";

/** Board coordinates are the same 52-square clockwise route used by the engine. */
const TRACK: [number, number][] = [
  [1, 6], [2, 6], [3, 6], [4, 6], [5, 6],
  [6, 5], [6, 4], [6, 3], [6, 2], [6, 1], [6, 0], [7, 0], [8, 0],
  [8, 1], [8, 2], [8, 3], [8, 4], [8, 5],
  [9, 6], [10, 6], [11, 6], [12, 6], [13, 6], [14, 6], [14, 7], [14, 8],
  [13, 8], [12, 8], [11, 8], [10, 8], [9, 8],
  [8, 9], [8, 10], [8, 11], [8, 12], [8, 13], [8, 14], [7, 14], [6, 14],
  [6, 13], [6, 12], [6, 11], [6, 10], [6, 9],
  [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8], [0, 7], [0, 6],
];
const LANES: [number, number][][] = [
  [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7]],
  [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5]],
  [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7]],
  [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9]],
];
const STARTS = [0, 13, 26, 39];
const SAFE = new Set([0, 8, 13, 21, 26, 34, 39, 47]);
const PALETTE = [
  { name: "Coral", main: "#e9715e", light: "#ffb7a3", dark: "#b74938", pale: "#f8d4c9", bay: "#f5e5de", zone: "#e78b78" },
  { name: "Green", main: "#54977c", light: "#a9d5b9", dark: "#2d6d53", pale: "#cce2d5", bay: "#e2ece0", zone: "#76a98b" },
  { name: "Gold", main: "#e7b84e", light: "#ffe9a2", dark: "#ac7920", pale: "#f8e7b5", bay: "#f5edcf", zone: "#e8be5d" },
  { name: "Blue", main: "#6a8cc9", light: "#b9d2f4", dark: "#3f5e99", pale: "#d2dff3", bay: "#e0e6f0", zone: "#8ca7cf" },
];
const ZONES = [[0, 0], [9, 0], [9, 9], [0, 9]];
const BASE = [[1.8, 1.8], [4.2, 1.8], [1.8, 4.2], [4.2, 4.2]];
const HOME = [[6.65, 7.5], [7.5, 6.65], [8.35, 7.5], [7.5, 8.35]];

type BoardProps = {
  game: any;
  onPiece?: (index: number) => void;
  interactive?: boolean;
  preview?: boolean;
  reducedMotion?: boolean;
};

type DisplayPiece = {
  key: string; index: number; playerIndex: number; color: number; progress: number;
  x: number; y: number; group: number; groupSize: number; active: boolean; playable: boolean; name: string;
};

function point(color: number, progress: number, index: number): [number, number] {
  if (progress < 0) return [ZONES[color][0] + BASE[index][0], ZONES[color][1] + BASE[index][1]];
  if (progress >= 56) {
    const [x, y] = HOME[color];
    return [x + (index % 2 - 0.5) * 0.38, y + (Math.floor(index / 2) - 0.5) * 0.35];
  }
  const [x, y] = progress >= 51 ? LANES[color][progress - 51] : TRACK[(STARTS[color] + progress) % 52];
  return [x + 0.5, y + 0.5];
}

function Star({ x, y, fill = "#bdb9ab", size = 15 }: { x: number; y: number; fill?: string; size?: number }) {
  return <path d="M0-16 4.8-5.2 16-4.7 7.2 2.5 10 14 -0 7.7 -10 14 -7.2 2.5 -16-4.7 -4.8-5.2Z" transform={`translate(${x} ${y}) scale(${size / 16})`} fill={fill} />;
}

function Pawn({ color, index, uid, finished }: { color: number; index: number; uid: string; finished: boolean }) {
  const p = PALETTE[color];
  return <svg className="ludo-pawn-sculpture" viewBox="0 0 80 100" aria-hidden="true">
    <defs>
      <linearGradient id={`${uid}-body`} x1="0" x2="1" y1=".25" y2=".6">
        <stop offset="0" stopColor={p.dark} /><stop offset=".2" stopColor={p.main} />
        <stop offset=".43" stopColor={p.light} /><stop offset=".62" stopColor={p.main} /><stop offset="1" stopColor={p.dark} />
      </linearGradient>
      <radialGradient id={`${uid}-head`} cx="32%" cy="25%" r="79%">
        <stop offset="0" stopColor={p.light} /><stop offset=".4" stopColor={p.main} /><stop offset="1" stopColor={p.dark} />
      </radialGradient>
      <linearGradient id={`${uid}-base`} x1="0" x2="0" y1="0" y2="1">
        <stop offset="0" stopColor={p.light} /><stop offset=".33" stopColor={p.main} /><stop offset="1" stopColor={p.dark} />
      </linearGradient>
    </defs>
    <ellipse className="ludo-pawn-shadow" cx="42" cy="87" rx="28" ry="8" fill="#292315" opacity=".17" />
    <ellipse cx="40" cy="80" rx="28" ry="11" fill={p.dark} />
    <path d="M12 75 C12 62 68 62 68 75 L68 79 C68 94 12 94 12 79Z" fill={`url(#${uid}-base)`} />
    <ellipse cx="40" cy="74.5" rx="28" ry="10.3" fill={p.main} stroke={p.light} strokeWidth="1.1" />
    <path d="M28 32 C30 43 24 59 18 69 C14 78 64 80 62 69 C56 58 50 43 52 32Z" fill={`url(#${uid}-body)`} />
    <ellipse cx="40" cy="34" rx="12.7" ry="4.2" fill={p.dark} opacity=".38" />
    <circle cx="40" cy="21" r="17" fill={`url(#${uid}-head)`} />
    <ellipse cx="35" cy="13" rx="5" ry="3" fill="#fff" opacity=".2" transform="rotate(-25 35 13)" />
    {finished ? <path d="m34 61 4 4 9-10" fill="none" stroke="#fff9e9" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" /> : <text x="40" y="66" textAnchor="middle" fill="#fffaf1" fontSize="14" fontWeight="700" fontFamily="system-ui,sans-serif">{index + 1}</text>}
  </svg>;
}

function PieceButton({ piece, style, uid, onPiece, reducedMotion }: {
  piece: DisplayPiece; style: CSSProperties; uid: string; onPiece?: (index: number) => void; reducedMotion: boolean;
}) {
  const element = useRef<HTMLButtonElement>(null);
  const previous = useRef<{ progress: number; left: string; top: string } | null>(null);
  const animation = useRef<Animation | null>(null);
  useLayoutEffect(() => {
    const old = previous.current;
    const target = { progress: piece.progress, left: String(style.left), top: String(style.top) };
    previous.current = target;
    if (!old || !element.current || reducedMotion || window.matchMedia("(prefers-reduced-motion: reduce)").matches || typeof element.current.animate !== "function") return;
    if (old.left === target.left && old.top === target.top) return;
    animation.current?.cancel();
    const frames: Keyframe[] = [{ left: old.left, top: old.top, transform: "translate(-50%, -83%)" }];
    const steps = old.progress >= 0 && piece.progress > old.progress && piece.progress <= 56
      ? Array.from({ length: piece.progress - old.progress }, (_, index) => old.progress + index + 1)
      : [piece.progress];
    let previousX = parseFloat(old.left), previousY = parseFloat(old.top);
    steps.forEach((progress, index) => {
      const [x, y] = point(piece.color, progress, piece.index);
      const isLast = index === steps.length - 1;
      const nextX = isLast ? parseFloat(target.left) : x / 15 * 100;
      const nextY = isLast ? parseFloat(target.top) : y / 15 * 100;
      frames.push({ left: `${(previousX + nextX) / 2}%`, top: `${(previousY + nextY) / 2}%`, transform: "translate(-50%, -94%)" });
      frames.push({ left: `${nextX}%`, top: `${nextY}%`, transform: "translate(-50%, -83%)" });
      previousX = nextX; previousY = nextY;
    });
    animation.current = element.current.animate(frames, { duration: Math.max(180, steps.length * 95), easing: "linear" });
  }, [piece.progress, piece.color, piece.index, style.left, style.top, reducedMotion]);
  useLayoutEffect(() => () => animation.current?.cancel(), []);
  const label = `${piece.name}, piece ${piece.index + 1}${piece.progress < 0 ? ", in base" : piece.progress >= 56 ? ", home" : `, ${56 - piece.progress} steps from home`}${piece.playable ? ", move" : ""}`;
  return <button ref={element} type="button" className={`ludo-pawn${piece.playable ? " is-playable" : ""}${piece.active ? " is-active" : ""}${piece.groupSize > 1 ? " is-stacked" : ""}${piece.progress >= 56 ? " is-home" : ""}`}
    style={style} onClick={() => piece.playable && onPiece?.(piece.index)} disabled={!piece.playable}
    aria-label={label} title={piece.playable ? `Move piece ${piece.index + 1}` : undefined} data-piece={piece.index} data-color={piece.color}>
    <span className="ludo-pawn-ring" aria-hidden="true" />
    <Pawn color={piece.color} index={piece.index} uid={`${uid}-p-${piece.color}-${piece.index}`} finished={piece.progress >= 56} />
  </button>;
}

function Board({ game, onPiece, interactive = true, preview = false, reducedMotion = false }: BoardProps) {
  const uid = useId().replace(/:/g, "");
  const players = game?.players ?? [];
  const current = game?.current ?? -1;
  const activeColor = players[current]?.color ?? -1;
  const safeSquares = game?.rules?.safeSquares !== false;
  const pieces = useMemo(() => {
    const list: DisplayPiece[] = [];
    players.forEach((player: any, playerIndex: number) => {
      if (!Number.isInteger(player.color) || player.color < 0 || player.color > 3) return;
      player.pieces?.forEach((progress: number, index: number) => {
        const [x, y] = point(player.color, progress, index);
        list.push({ key: `${player.id ?? player.color}-${index}`, index, playerIndex, color: player.color,
          progress, x, y, group: 0, groupSize: 1, active: playerIndex === current,
          playable: interactive && !preview && game?.phase === "move" && playerIndex === current && (game?.legal ?? []).includes(index),
          name: player.name ?? PALETTE[player.color].name,
        });
      });
    });
    const groups = new Map<string, DisplayPiece[]>();
    list.forEach(piece => {
      if (piece.progress < 0 || piece.progress >= 56) return;
      const key = `${piece.x},${piece.y}`;
      const group = groups.get(key) ?? [];
      group.push(piece); groups.set(key, group);
    });
    groups.forEach(group => group.forEach((piece, index) => { piece.group = index; piece.groupSize = group.length; }));
    return list;
  }, [players, current, game?.phase, game?.legal, interactive, preview]);

  return <div className={`ludo-board${preview ? " is-preview" : ""}${reducedMotion ? " reduce-motion" : ""}`} role="group" aria-label="Ludo game board">
    <div className="ludo-board-edge" aria-hidden="true" />
    <div className="ludo-board-frame">
      <div className="ludo-board-inlay">
        <svg className="ludo-board-map" viewBox="0 0 900 900" aria-hidden="true">
          <defs>
            <linearGradient id={`${uid}-ivory`} x1="0" x2="0" y1="0" y2="1"><stop stopColor="#fffdf7" /><stop offset="1" stopColor="#f1eee5" /></linearGradient>
            <filter id={`${uid}-inset`} x="-25%" y="-25%" width="150%" height="150%"><feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#544a34" floodOpacity=".13" /></filter>
            {PALETTE.map((p, i) => <linearGradient key={i} id={`${uid}-zone-${i}`} x1="0" x2="1" y1="0" y2="1"><stop stopColor={p.zone} /><stop offset="1" stopColor={p.main} /></linearGradient>)}
          </defs>
          <rect width="900" height="900" rx="16" fill="#e5e1d6" />
          {ZONES.map(([zx, zy], color) => {
            const p = PALETTE[color];
            const isActive = activeColor === color && !preview;
            const present = players.some((player: any) => player.color === color);
            return <g key={color} className={`ludo-home-zone${isActive ? " is-active" : ""}${!present ? " is-empty" : ""}`}>
              <rect x={zx * 60 + 1.5} y={zy * 60 + 1.5} width="357" height="357" rx="14" fill={`url(#${uid}-zone-${color})`} />
              <rect x={zx * 60 + 9} y={zy * 60 + 9} width="342" height="342" rx="10" fill="none" stroke="#fff" strokeOpacity=".18" strokeWidth="1.5" />
              <rect x={zx * 60 + 47} y={zy * 60 + 50} width="266" height="264" rx="29" fill={p.dark} opacity=".13" />
              <rect x={zx * 60 + 46} y={zy * 60 + 44} width="268" height="268" rx="28" fill={`url(#${uid}-ivory)`} filter={`url(#${uid}-inset)`} />
              <rect className="ludo-home-active-outline" x={zx * 60 + 45} y={zy * 60 + 43} width="270" height="270" rx="29" fill="none" stroke="#fff9e9" strokeWidth="5" opacity={isActive ? 0.8 : 0} />
              {BASE.map(([x, y], index) => <g key={index}>
                <circle cx={(zx + x) * 60} cy={(zy + y) * 60 + 3} r="34" fill="#fff" opacity=".75" />
                <circle cx={(zx + x) * 60} cy={(zy + y) * 60} r="34" fill={p.bay} stroke={p.dark} strokeOpacity=".1" strokeWidth="1.5" />
                <circle cx={(zx + x) * 60} cy={(zy + y) * 60 - 1} r="28" fill="none" stroke={p.main} strokeOpacity=".12" />
              </g>)}
            </g>;
          })}
          {TRACK.map(([x, y], index) => {
            const startColor = STARTS.indexOf(index);
            const isStart = startColor !== -1;
            return <g key={index}>
              <rect x={x * 60 + 1.7} y={y * 60 + 1.7} width="56.6" height="56.6" rx="3.5" fill={isStart ? PALETTE[startColor].pale : "#fbf9f2"} />
              {safeSquares && SAFE.has(index) && <Star x={x * 60 + 30} y={y * 60 + 30} fill={isStart ? PALETTE[startColor].main : "#c6c1b2"} size={14} />}
              {!safeSquares && isStart && <circle cx={x * 60 + 30} cy={y * 60 + 30} r="7" fill={PALETTE[startColor].main} opacity=".45" />}
            </g>;
          })}
          {LANES.map((lane, color) => lane.map(([x, y], index) => <g key={`${color}-${index}`}>
            <rect x={x * 60 + 1.7} y={y * 60 + 1.7} width="56.6" height="56.6" rx="3.5" fill={PALETTE[color].pale} />
            <circle cx={x * 60 + 30} cy={y * 60 + 30} r="3.6" fill={PALETTE[color].main} opacity=".65" />
          </g>))}
          <path d="M360 360 450 450 360 540Z" fill={PALETTE[0].zone} />
          <path d="M360 360 540 360 450 450Z" fill={PALETTE[1].zone} />
          <path d="M540 360 540 540 450 450Z" fill={PALETTE[2].zone} />
          <path d="M360 540 450 450 540 540Z" fill={PALETTE[3].zone} />
          <path d="M360 360 540 540 M540 360 360 540" stroke="#fff9ed" strokeWidth="3" opacity=".6" />
          <circle cx="450" cy="452" r="24" fill="#3b3525" opacity=".12" />
          <circle cx="450" cy="448" r="24" fill="#fff9ed" />
          <Star x={450} y={448} size={13} fill="#b5aa8f" />
          {[{x:29,y:450,rotate:0,c:0},{x:450,y:29,rotate:90,c:1},{x:871,y:450,rotate:180,c:2},{x:450,y:871,rotate:270,c:3}].map(({x,y,rotate,c}) => <path key={c} d="M-8-9 2 0 -8 9 M2-9 12 0 2 9" transform={`translate(${x} ${y}) rotate(${rotate})`} stroke={PALETTE[c].main} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" fill="none" opacity=".7" />)}
        </svg>
        <div className="ludo-pieces-layer">
          {pieces.map(piece => {
            const stacked = piece.groupSize > 1;
            const columns = piece.groupSize > 4 ? Math.ceil(Math.sqrt(piece.groupSize)) : 2;
            const spacing = piece.groupSize > 4 ? 0.26 : 0.43;
            const rows = Math.ceil(piece.groupSize / columns);
            const dx = stacked ? (piece.group % columns - (columns - 1) / 2) * spacing : 0;
            const dy = stacked ? (Math.floor(piece.group / columns) - (rows - 1) / 2) * spacing * 0.88 : 0;
            const style = {
              left: `${(piece.x + dx) / 15 * 100}%`, top: `${(piece.y + dy) / 15 * 100}%`,
              "--pawn-color": PALETTE[piece.color].main,
              "--pawn-dark": PALETTE[piece.color].dark,
              "--pawn-scale": piece.progress >= 56 ? 0.54 : piece.groupSize > 4 ? 0.55 : stacked ? 0.78 : 1,
              zIndex: piece.playable ? 50 + piece.group : 10 + Math.round(piece.y) + piece.group,
            } as CSSProperties;
            return <PieceButton key={piece.key} piece={piece} style={style} uid={uid} onPiece={onPiece} reducedMotion={reducedMotion} />;
          })}
        </div>
      </div>

    </div>
  </div>;
}

export default memo(Board);
