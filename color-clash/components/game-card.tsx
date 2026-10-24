"use client";

import { useId, type CSSProperties } from "react";

export type CardColor = "red" | "yellow" | "green" | "blue" | "wild";
export type CardFace = { id?: string; color: string; value: string };
export const CARD_COLORS: Record<CardColor, string> = {
  red: "#e65b4f", yellow: "#efb943", green: "#48a992", blue: "#5f8bdf", wild: "#252b3b",
};

// Drawn numerals keep the face of the pack independent of system fonts.
const DIGITS: Record<string, string> = {
  "0": "M24 9C10 9 9 22 9 38S10 67 24 67S39 54 39 38S38 9 24 9Z",
  "1": "M14 20L26 10V66M13 66H39",
  "2": "M9 22C10 6 38 4 39 22C40 35 9 45 9 65H40",
  "3": "M10 14C22 3 41 9 38 24C37 32 30 37 21 37M21 37C46 35 45 64 27 67C20 69 13 67 8 61",
  "4": "M34 67V9L7 47H44",
  "5": "M39 10H12L10 35C21 28 40 32 40 48C40 67 19 73 8 61",
  "6": "M36 12C16 0 7 26 8 45C9 77 41 72 41 49C41 28 12 28 9 46",
  "7": "M8 10H41L17 67",
  "8": "M24 37C1 37 5 9 24 9S47 37 24 37ZM24 37C0 37 3 68 24 68S48 37 24 37Z",
  "9": "M11 64C31 76 41 50 40 31C39 -1 7 4 7 27C7 48 36 48 39 30",
};

function Digit({ value, stroke = "currentColor", width = 9 }: { value: string; stroke?: string; width?: number }) {
  return <path d={DIGITS[value] || DIGITS["0"]} stroke={stroke} strokeWidth={width} fill="none" strokeLinecap="round" strokeLinejoin="round" />;
}

function ColorMark({ color }: { color: string }) {
  if (color === "red") return <circle cx="0" cy="0" r="2.25" fill="currentColor" />;
  if (color === "yellow") return <path d="M0-3L3 0L0 3L-3 0Z" fill="currentColor" />;
  if (color === "green") return <path d="M0-3L3 2.5H-3Z" fill="currentColor" />;
  return <rect x="-2.35" y="-2.35" width="4.7" height="4.7" rx=".8" fill="currentColor" />;
}

export function ClashMark({ size = 28, className = "" }: { size?: number; className?: string }) {
  return <svg className={className} width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden="true">
    <path d="M7 4H19V19H4V7A3 3 0 0 1 7 4Z" fill={CARD_COLORS.red} />
    <path d="M21 4H33A3 3 0 0 1 36 7V19H21Z" fill={CARD_COLORS.yellow} />
    <path d="M21 21H36V33A3 3 0 0 1 33 36H21Z" fill={CARD_COLORS.green} />
    <path d="M4 21H19V36H7A3 3 0 0 1 4 33Z" fill={CARD_COLORS.blue} />
    <path d="M20 10L23 17L30 20L23 23L20 30L17 23L10 20L17 17Z" fill="#fff9ec" />
  </svg>;
}

function FourColors({ transform = "" }: { transform?: string }) {
  return <g transform={transform}>
    <path d="M0 0H22V22H0Z" fill={CARD_COLORS.red} />
    <path d="M26 0H48V22H26Z" fill={CARD_COLORS.yellow} />
    <path d="M26 26H48V48H26Z" fill={CARD_COLORS.green} />
    <path d="M0 26H22V48H0Z" fill={CARD_COLORS.blue} />
    <path d="M24 9L28 20L39 24L28 28L24 39L20 28L9 24L20 20Z" fill="#fff7e7" />
  </g>;
}

function FaceSymbol({ value, small = false }: { value: string; small?: boolean }) {
  if (DIGITS[value]) return <Digit value={value} width={small ? 10 : 9.5} />;
  if (value === "skip") return <g stroke="currentColor" strokeWidth="8" fill="none" strokeLinecap="round"><circle cx="24" cy="38" r="22" /><path d="M8.5 53.5L39.5 22.5" /></g>;
  if (value === "reverse") return <g fill="currentColor">
    <path d="M4 38V27C4 17 12 11 21 11H29V3L46 17L29 31V23H22C17 23 16 25 16 30V38Z" />
    <path d="M44 38V49C44 59 36 65 27 65H19V73L2 59L19 45V53H26C31 53 32 51 32 46V38Z" />
  </g>;
  if (value === "draw2" || value === "wild4") return <g>
    <path d="M-3 27V43M-11 35H5" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
    <g transform="translate(10 6) scale(.8)"><Digit value={value === "draw2" ? "2" : "4"} width={10} /></g>
  </g>;
  return <FourColors transform="translate(0 14)" />;
}

export function GameCard({ card, back = false, className = "", style }: {
  card?: CardFace; back?: boolean; className?: string; style?: CSSProperties;
}) {
  const id = useId().replace(/:/g, "");
  const color = (card?.color || "wild") as CardColor;
  const value = card?.value || "wild";
  const tint = CARD_COLORS[color] || CARD_COLORS.wild;
  const wild = color === "wild" || value === "wild" || value === "wild4";
  return <div className={`game-card ${back ? "card-back" : `card-face card-${color}`} ${className}`} style={{ aspectRatio: "100 / 146", position: "relative", borderRadius: "11% / 7.5%", ...style }}>
    <svg viewBox="0 0 100 146" width="100%" height="100%" fill="none" style={{ display: "block", overflow: "visible" }} aria-hidden="true">
      <defs>
        <linearGradient id={`${id}-paper`} x1="15" y1="0" x2="92" y2="146" gradientUnits="userSpaceOnUse"><stop stopColor="#fffdf7" /><stop offset="1" stopColor="#e9e2d5" /></linearGradient>
        <linearGradient id={`${id}-face`} x1="0" y1="5" x2="90" y2="145" gradientUnits="userSpaceOnUse"><stop stopColor={back ? "#303747" : tint} /><stop offset="1" stopColor={back ? "#171c27" : tint} /></linearGradient>
        <linearGradient id={`${id}-sheen`} x1="15" y1="4" x2="100" y2="140" gradientUnits="userSpaceOnUse"><stop stopColor="#fff" stopOpacity=".12" /><stop offset=".5" stopColor="#fff" stopOpacity="0" /><stop offset="1" stopColor="#000" stopOpacity=".09" /></linearGradient>
        <clipPath id={`${id}-clip`}><rect x="5" y="5" width="90" height="136" rx="7" /></clipPath>
      </defs>
      <rect y="1.7" width="100" height="145" rx="10" fill="#bdb6aa" />
      <rect y=".7" width="100" height="145" rx="10" fill="#e2dacb" />
      <rect width="100" height="144" rx="10" fill={`url(#${id}-paper)`} />
      <rect x=".5" y=".5" width="99" height="143" rx="9.5" stroke="#fff" strokeOpacity=".9" />
      <rect x="5" y="5" width="90" height="134" rx="6.5" fill={`url(#${id}-face)`} />
      <g clipPath={`url(#${id}-clip)`}>
        {back ? <>
          <path d="M-30 124L77 17M-18 136L89 29M-6 148L101 41" stroke="#fff8e9" strokeOpacity=".045" strokeWidth="5" />
          <rect x="12" y="12" width="76" height="120" rx="3" stroke="#efe8d9" strokeOpacity=".25" strokeWidth=".6" />
          <path d="M12 32V12H32M68 132H88V112" stroke="#f5efdf" strokeOpacity=".65" strokeWidth="1" />
          <g transform="translate(25 38) rotate(-9 24 24)"><FourColors /></g>
          <text x="50" y="104" fill="#f8f2e7" textAnchor="middle" fontSize="8.1" letterSpacing="2.4" fontWeight="750" fontFamily="Arial, sans-serif">COLOR</text>
          <text x="50" y="116" fill="#f8f2e7" textAnchor="middle" fontSize="8.1" letterSpacing="2.4" fontWeight="750" fontFamily="Arial, sans-serif">CLASH</text>
          <circle cx="50" cy="22" r="1.7" fill="#f8f2e7" fillOpacity=".6" />
        </> : <>
          <path d="M-16 111C4 111 14 91 28 74C45 51 66 41 108 40" stroke="#fffaf0" strokeOpacity=".1" strokeWidth="33" />
          <path d="M-17 113C7 113 18 87 34 70C53 49 71 44 108 44" stroke="#fffaf0" strokeOpacity=".2" strokeWidth=".7" />
          <path d="M2 134L38 98M67 44L100 11" stroke="#fffaf0" strokeOpacity=".12" strokeWidth="1" />
          <g transform="translate(12 12) scale(.19)" color="#fffaf0"><FaceSymbol value={value} small /></g>
          {!wild && <g transform="translate(16.6 31)" color="#fffaf0"><ColorMark color={color} /></g>}
          <g transform="translate(88 132) rotate(180) scale(.19)" color="#fffaf0"><FaceSymbol value={value} small /></g>
          {!wild && <g transform="translate(83.4 113)" color="#fffaf0"><ColorMark color={color} /></g>}
          {value === "wild4" ? <>
            <g transform="translate(23 44) rotate(-15 24 24)">
              <rect x="0" y="0" width="26" height="40" rx="3" fill={CARD_COLORS.blue} stroke="#fffaf0" strokeWidth="1.8" />
              <rect x="10" y="-4" width="26" height="40" rx="3" fill={CARD_COLORS.green} stroke="#fffaf0" strokeWidth="1.8" />
              <rect x="20" y="0" width="26" height="40" rx="3" fill={CARD_COLORS.yellow} stroke="#fffaf0" strokeWidth="1.8" />
              <rect x="30" y="7" width="26" height="40" rx="3" fill={CARD_COLORS.red} stroke="#fffaf0" strokeWidth="1.8" />
            </g>
            <g transform="translate(35 88) scale(.45)" color="#fffaf0"><FaceSymbol value="wild4" /></g>
          </> : value === "wild" ? <g transform="translate(25 47) rotate(-9 24 24)"><FourColors /></g> : <>
            <g transform={value === "draw2" ? "translate(32 38) scale(.94)" : "translate(26 35)"} color="#000" opacity=".1"><FaceSymbol value={value} /></g>
            <g transform={value === "draw2" ? "translate(31 36) scale(.94)" : "translate(25 33)"} color="#fffaf0"><FaceSymbol value={value} /></g>
          </>}
          <text x="50" y="126" fill="#fffaf0" fillOpacity=".8" textAnchor="middle" fontSize="3.8" letterSpacing="1.35" fontWeight="650" fontFamily="Arial, sans-serif">COLOR CLASH</text>
        </>}
        <rect x="5" y="5" width="90" height="134" rx="6.5" fill={`url(#${id}-sheen)`} />
      </g>
    </svg>
  </div>;
}

const AVATARS = [
  { bg: "#e9bc81", skin: "#f5d4a3", hair: "#3d302a", shirt: "#e6745f" },
  { bg: "#9caed5", skin: "#d7a27c", hair: "#343044", shirt: "#555b86" },
  { bg: "#a9cbb1", skin: "#f1c8a4", hair: "#b4563d", shirt: "#3c8975" },
  { bg: "#d8b4c4", skin: "#a9694b", hair: "#342c2b", shirt: "#80546d" },
  { bg: "#d4ce99", skin: "#edb389", hair: "#e2cb83", shirt: "#a99444" },
  { bg: "#a7c8d1", skin: "#bf8867", hair: "#2d4146", shirt: "#467987" },
];

export function Avatar({ index = 0, className = "" }: { index?: number; className?: string }) {
  const i = Math.abs(index) % AVATARS.length;
  const { bg, skin, hair, shirt } = AVATARS[i];
  return <svg className={`player-avatar ${className}`} viewBox="0 0 64 64" fill="none" aria-hidden="true">
    <rect width="64" height="64" rx="22" fill={bg} />
    <path d="M7 64C9 47 19 44 32 44S55 47 57 64Z" fill={shirt} />
    {i % 3 === 2 && <path d="M14 34C10 10 19 5 33 7C48 7 54 20 50 47L40 48H19Z" fill={hair} />}
    {i % 3 === 0 && <path d="M16 31C9 17 18 7 30 8C44 4 53 18 47 34Z" fill={hair} />}
    <path d="M26 42H38V52C35 57 29 57 26 52Z" fill={skin} />
    <ellipse cx="18.5" cy="33" rx="4.5" ry="5.5" fill={skin} />
    <ellipse cx="45.5" cy="33" rx="4.5" ry="5.5" fill={skin} />
    <path d="M18 25C18 12 45 12 46 25V35C46 44 40 49 32 49S18 43 18 35Z" fill={skin} />
    {i % 3 === 0 ? <path d="M17 27C17 9 41 8 47 25C38 23 29 24 24 17C23 25 20 28 17 27Z" fill={hair} /> : i % 3 === 1 ? <path d="M16 29C13 16 17 11 29 11C39 3 52 17 46 31L41 21C34 27 28 20 21 24L19 31Z" fill={hair} /> : <path d="M17 28C14 9 44 8 47 27C39 25 35 15 32 15C28 24 20 24 17 28Z" fill={hair} />}
    <path d="M25 32V34M39 32V34" stroke="#302722" strokeWidth="2.2" strokeLinecap="round" />
    <path d="M29 41C31 42.7 34 42.7 36 40.5" stroke="#7e4e3c" strokeWidth="1.8" strokeLinecap="round" />
    <path d="M32 34L31 37H33" stroke="#ae7656" strokeWidth="1.1" strokeLinecap="round" />
    {i === 1 && <g stroke="#292d45" strokeWidth="1.5"><rect x="20" y="28" width="10" height="9" rx="3" /><rect x="34" y="28" width="10" height="9" rx="3" /><path d="M30 31H34M17 29L20 30M44 30L47 29" /></g>}
    {i === 4 && <path d="M16 24C13 10 22 7 34 9C47 9 50 16 48 24H16Z" fill="#a9914d" />}
    {i === 3 && <g fill={hair}><circle cx="18" cy="17" r="8" /><circle cx="27" cy="12" r="8" /><circle cx="38" cy="12" r="8" /><circle cx="46" cy="18" r="7" /></g>}
  </svg>;
}
