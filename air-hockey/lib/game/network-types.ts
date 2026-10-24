import type { GameEvent, GameState, Side } from './types';

export type RoomStatus = 'waiting' | 'playing' | 'paused' | 'finished' | 'disconnected';
export type OnlineStatus = RoomStatus | 'connecting' | 'reconnecting' | 'error';
export type RoomAction = 'rematch' | 'leave' | 'pause' | 'resume';
export type OnlineSession = { code: string; token: string; side: Side };
export type RoomPlayer = { name: string; connected: boolean; ready: boolean; present: boolean; left: boolean };
export type NetworkEvent = { id: number; event: GameEvent };
export type RoomSnapshot = {
  code: string;
  state: GameState;
  players: [RoomPlayer, RoomPlayer];
  status: RoomStatus;
  serverTime: number;
  revision: number;
  ackSeq: number;
  events: NetworkEvent[];
  matchId: number;
  pausedBy: Side | null;
};
export type SessionResponse = { session: OnlineSession; snapshot: RoomSnapshot };

/** Messages a browser sends over the room WebSocket. The string "ping" is answered with "pong". */
export type ClientMessage =
  | { t: 'hello'; token: string }
  | { t: 'join'; name: string }
  | { t: 'in'; s: number; x: number; y: number }
  | { t: 'act'; s: number; a: RoomAction };

/** Messages the room sends back. */
export type ServerMessage =
  | { t: 'welcome'; session: OnlineSession; snapshot: RoomSnapshot }
  | { t: 'snap'; snapshot: RoomSnapshot }
  | { t: 'err'; status: number; message: string };

/** Close code used when the same seat connects from a newer socket. */
export const REPLACED_CLOSE = 4000;
/** Close code after a terminal room error (missing room, full room, bad session). */
export const TERMINAL_CLOSE = 4004;
