import type { Ball } from './golf';

export const PLAYER_COLORS = ['#f3a449', '#61a99b', '#d77d91', '#7197cb', '#ad8bc2', '#cfba61', '#df8763', '#8aa77a'];
export type OnlinePhase = 'lobby' | 'playing' | 'holeComplete' | 'complete';
export interface OnlinePlayer {
  id: string;
  name: string;
  color: string;
  ball: Ball;
  strokes: number;
  scores: (number | null)[];
  finished: boolean;
  departed: boolean;
}
export interface OnlineShot {
  id: string;
  playerId: string;
  holeIndex: number;
  startAt: number;
  duration: number;
  frames: { t: number; x: number; y: number; z: number }[];
  outcome: 'rest' | 'cup' | 'water';
}
export interface OnlineRoom {
  code: string;
  hostId: string;
  phase: OnlinePhase;
  holes: 9 | 18;
  holeIndex: number;
  turnId: string | null;
  players: OnlinePlayer[];
  version: number;
  startedAt: number;
  turnStartedAt: number;
  readyAt: number;
  shot: OnlineShot | null;
}
export interface RoomReply {
  room: OnlineRoom;
  serverTime: number;
  playerId?: string;
  token?: string;
}
export interface RoomSession { code: string; token: string; playerId: string }
export type RoomAction =
  | { action: 'create'; name: string; holes: 9 | 18 }
  | { action: 'join'; code: string; name: string }
  | { action: 'start' | 'nextHole' | 'rematch' | 'leave' | 'skip'; code: string }
  | { action: 'shot'; code: string; angle: number; power: number; shotId: string };

// Busy path: 429, 503, daily limit (1027) or no network. Platform error pages are HTML, so the body may not be JSON.
const UNAVAILABLE = 'The clubhouse is temporarily unavailable. Try again.';
async function readReply(response: Response): Promise<RoomReply & { error?: string }> {
  try { return await response.json(); } catch { return {} as RoomReply & { error?: string }; }
}
async function send(url: string, init: RequestInit): Promise<Response> {
  try { return await fetch(url, init); } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new Error(UNAVAILABLE);
  }
}
export async function golfRequest(action: RoomAction, token?: string): Promise<RoomReply> {
  const response = await send('/api/golf', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(action),
  });
  const value = await readReply(response);
  if (!response.ok) throw new Error(value.error || UNAVAILABLE);
  return value as RoomReply;
}
export async function getGolfRoom(code: string, token: string, signal?: AbortSignal): Promise<RoomReply> {
  const response = await send(`/api/golf?code=${encodeURIComponent(code)}`, {
    headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal,
  });
  const value = await readReply(response);
  if (!response.ok) throw new Error(value.error || 'Could not reconnect to your room.');
  return value as RoomReply;
}
export function saveRoomSession(session: RoomSession): void {
  try { localStorage.setItem('little-links-room', JSON.stringify(session)); } catch {}
}
export function readRoomSession(): RoomSession | null {
  try {
    const value = JSON.parse(localStorage.getItem('little-links-room') || 'null');
    return value && typeof value.code === 'string' && typeof value.token === 'string' && typeof value.playerId === 'string' ? value : null;
  } catch { return null; }
}
export function clearRoomSession(): void {
  try { localStorage.removeItem('little-links-room'); } catch {}
}
