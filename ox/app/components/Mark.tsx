"use client";

import { useId } from "react";

export type MarkValue = "X" | "O";

export interface MarkProps {
  mark: MarkValue;
  className?: string;
  animated?: boolean;
  small?: boolean;
}

/** A tiny, self-contained ceramic piece. Each instance owns its paint IDs. */
export function Mark({ mark, className = "", animated = false, small = false }: MarkProps) {
  const paintId = `piece-${useId().replace(/:/g, "")}`;
  const isCross = mark === "X";
  const shapes = isCross
    ? ["M27 27L73 73", "M73 27L27 73"]
    : ["M50 24a26 26 0 1 1 0 52a26 26 0 1 1 0-52"];

  return (
    <svg
      className={`mark mark--${mark.toLowerCase()}${animated ? " mark--animated" : ""}${small ? " mark--small" : ""} ${className}`}
      viewBox="0 0 100 100"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={paintId} x1="24" y1="20" x2="76" y2="82" gradientUnits="userSpaceOnUse">
          <stop stopColor={isCross ? "var(--x-top, #454942)" : "var(--o-top, #dfa789)"} />
          <stop offset="1" stopColor={isCross ? "var(--x-bottom, #242822)" : "var(--o-bottom, #ae624a)"} />
        </linearGradient>
        <linearGradient id={`${paintId}-edge`} x1="20" y1="24" x2="76" y2="84" gradientUnits="userSpaceOnUse">
          <stop stopColor="#fff" stopOpacity={isCross ? ".2" : ".42"} />
          <stop offset=".7" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <g strokeLinecap="round" strokeLinejoin="round">
        {shapes.map((path, index) => (
          <g key={path} className={`mark-part mark-part--${index}`}>
            <path className="mark-stroke mark-shadow" d={path} pathLength="100" stroke="var(--piece-shadow, #171b1426)" strokeWidth="14" transform="translate(0 3)" />
            <path className="mark-stroke" d={path} pathLength="100" stroke={`url(#${paintId})`} strokeWidth="13" />
            <path className="mark-stroke mark-edge" d={path} pathLength="100" stroke={`url(#${paintId}-edge)`} strokeWidth="1.8" transform="translate(-1 -4.7)" />
          </g>
        ))}
      </g>
    </svg>
  );
}
