import { COURSES, MAX_STROKES, makeBall, simulateShot } from './golf';
import { PLAYER_COLORS, type OnlinePlayer, type OnlineRoom, type OnlineShot, type RoomAction } from './multiplayer';

export interface StoredPlayer extends OnlinePlayer { tokenHash: string }
export interface StoredRoom extends Omit<OnlineRoom, 'version' | 'players'> {
  players: StoredPlayer[];
  createdAt: number;
  processedShots: { id: string; playerId: string }[];
}
export class RoomError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export function validateName(value: unknown): string {
  if (typeof value !== 'string') throw new RoomError(400, 'Enter a player name.');
  const name = value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 20);
  if (!name) throw new RoomError(400, 'Enter a player name.');
  return name;
}
export function newPlayer(name: string, tokenHash: string, holes: number, index: number): StoredPlayer {
  return {
    id: crypto.randomUUID(), name: validateName(name), tokenHash,
    color: PLAYER_COLORS[index % PLAYER_COLORS.length],
    ball: makeBall(COURSES[0]), strokes: 0, scores: Array(holes).fill(null), finished: false, departed: false,
  };
}
export function createRoom(code: string, name: string, tokenHash: string, holes: unknown, now: number): StoredRoom {
  if (holes !== 9 && holes !== 18) throw new RoomError(400, 'Choose a 9-hole or 18-hole round.');
  const host = newPlayer(name, tokenHash, holes, 0);
  return {
    code, hostId: host.id, phase: 'lobby', holes, holeIndex: 0, turnId: null,
    players: [host], startedAt: 0, turnStartedAt: now, readyAt: 0, shot: null,
    createdAt: now, processedShots: [],
  };
}
export function publicRoom(room: StoredRoom, version: number): OnlineRoom {
  return {
    code: room.code, hostId: room.hostId, phase: room.phase, holes: room.holes,
    holeIndex: room.holeIndex, turnId: room.turnId, version, startedAt: room.startedAt,
    turnStartedAt: room.turnStartedAt, readyAt: room.readyAt, shot: room.shot,
    players: room.players.map(({ tokenHash: _secret, ...player }) => player),
  };
}
function requireHost(room: StoredRoom, player: StoredPlayer): void {
  if (player.id !== room.hostId) throw new RoomError(403, 'Only the host can do that.');
}
function requireSettled(room: StoredRoom, now: number): void {
  if (now < room.readyAt) throw new RoomError(409, 'Wait for the ball to settle.');
}
function finishTurn(room: StoredRoom, player: StoredPlayer, now: number): void {
  if (player.finished || player.strokes >= MAX_STROKES) {
    player.finished = true;
    player.scores[room.holeIndex] = Math.min(MAX_STROKES, player.strokes);
  }
  const remaining = room.players.filter(p => !p.finished && !p.departed);
  if (!remaining.length) {
    room.turnId = null;
    room.phase = room.holeIndex + 1 >= room.holes ? 'complete' : 'holeComplete';
  } else {
    const currentIndex = room.players.findIndex(p => p.id === player.id);
    for (let offset = 1; offset <= room.players.length; offset++) {
      const next = room.players[(currentIndex + offset) % room.players.length];
      if (!next.finished && !next.departed) { room.turnId = next.id; break; }
    }
  }
  room.turnStartedAt = Math.max(now, room.readyAt);
}
function startHole(room: StoredRoom, now: number): void {
  for (const player of room.players) {
    player.ball = makeBall(COURSES[room.holeIndex]);
    player.strokes = player.departed ? MAX_STROKES : 0;
    player.finished = player.departed;
    if (player.departed) player.scores[room.holeIndex] = MAX_STROKES;
  }
  const active = room.players.filter(p => !p.departed);
  // Rotate honors, so the same player does not start every hole.
  room.turnId = active[room.holeIndex % active.length]?.id ?? null;
  room.phase = active.length ? 'playing' : 'complete';
  room.turnStartedAt = now; room.readyAt = now; room.shot = null;
}
export function joinRoom(room: StoredRoom, name: string, tokenHash: string): StoredPlayer {
  if (room.phase !== 'lobby') throw new RoomError(409, 'This round has started. Ask the host for a rematch.');
  if (room.players.length >= 8) throw new RoomError(409, 'This room is full. Eight players maximum.');
  const player = newPlayer(name, tokenHash, room.holes, room.players.length);
  player.color = PLAYER_COLORS.find(color => !room.players.some(p => p.color === color)) || player.color;
  room.players.push(player);
  if (!room.hostId) room.hostId = player.id;
  return player;
}
export function actOnRoom(room: StoredRoom, player: StoredPlayer, action: RoomAction, now: number): boolean {
  if (player.departed && action.action !== 'leave') throw new RoomError(403, 'You have left this round. Join a new room.');
  switch (action.action) {
    case 'start': {
      requireHost(room, player);
      if (room.phase !== 'lobby') throw new RoomError(409, 'The round has already started.');
      if (room.players.filter(p => !p.departed).length < 2) throw new RoomError(409, 'Invite at least one friend before starting.');
      room.startedAt = now; room.holeIndex = 0; startHole(room, now); return true;
    }
    case 'shot': {
      if (typeof action.shotId !== 'string' || action.shotId.length < 8 || action.shotId.length > 80) throw new RoomError(400, 'This shot needs a valid request ID.');
      if (room.processedShots.some(s => s.id === action.shotId && s.playerId === player.id)) return false;
      if (room.phase !== 'playing') throw new RoomError(409, 'This hole is already finished.');
      requireSettled(room, now);
      if (room.turnId !== player.id) throw new RoomError(409, 'Wait for your turn.');
      if (player.finished || !player.ball.stopped) throw new RoomError(409, 'The ball is not ready for another shot.');
      if (!Number.isFinite(action.angle) || !Number.isFinite(action.power) || action.power <= 0 || action.power > 1 || Math.abs(action.angle) > 1e6) throw new RoomError(400, 'Choose a valid direction and shot power.');
      const startAt = now + 180;
      const angle = ((action.angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      const beforeShot = { ...player.ball };
      const result = simulateShot(COURSES[room.holeIndex], beforeShot, angle, action.power, (startAt - room.startedAt) / 1000);
      if (![result.ball.x, result.ball.y, result.ball.z, result.duration].every(Number.isFinite)) throw new RoomError(500, 'The shot could not be simulated. Try again.');
      player.strokes = Math.min(MAX_STROKES, player.strokes + 1 + (result.outcome === 'water' ? 1 : 0));
      player.ball = result.ball;
      if (result.outcome === 'water') {
        // A hazard costs one stroke and returns the ball to its previous lie.
        player.ball = { ...beforeShot, hazard: false, stopped: true, sunk: false, settleTime: 0, vx: 0, vy: 0, vz: 0 };
      }
      player.finished = result.outcome === 'cup' || player.strokes >= MAX_STROKES;
      room.shot = {
        id: action.shotId, playerId: player.id, holeIndex: room.holeIndex,
        startAt, duration: result.duration, frames: result.frames, outcome: result.outcome,
      } satisfies OnlineShot;
      room.readyAt = startAt + result.duration * 1000 + 350;
      room.processedShots.push({ id: action.shotId, playerId: player.id });
      if (room.processedShots.length > 64) room.processedShots.splice(0, room.processedShots.length - 64);
      finishTurn(room, player, now); return true;
    }
    case 'nextHole': {
      requireHost(room, player); requireSettled(room, now);
      if (room.phase !== 'holeComplete') throw new RoomError(409, 'Finish this hole first.');
      room.holeIndex++; startHole(room, now); return true;
    }
    case 'rematch': {
      requireHost(room, player); requireSettled(room, now);
      if (room.phase !== 'complete') throw new RoomError(409, 'Finish this round before starting a rematch.');
      room.players = room.players.filter(p => !p.departed);
      for (const p of room.players) {
        p.scores = Array(room.holes).fill(null); p.strokes = 0; p.finished = false;
        p.ball = makeBall(COURSES[0]);
      }
      room.phase = 'lobby'; room.holeIndex = 0; room.turnId = null;
      room.shot = null; room.readyAt = 0; room.startedAt = 0; room.processedShots = [];
      room.turnStartedAt = now; return true;
    }
    case 'skip': {
      requireHost(room, player); requireSettled(room, now);
      if (room.phase !== 'playing' || !room.turnId) throw new RoomError(409, 'There is no turn to skip.');
      if (now - room.turnStartedAt < 60_000) throw new RoomError(409, 'A turn can be skipped after 60 seconds.');
      const skipped = room.players.find(p => p.id === room.turnId)!;
      skipped.strokes = Math.min(MAX_STROKES, skipped.strokes + 1);
      finishTurn(room, skipped, now); return true;
    }
    case 'leave': {
      if (player.departed) return false;
      if (room.phase === 'lobby') {
        room.players = room.players.filter(p => p.id !== player.id);
        if (room.hostId === player.id) room.hostId = room.players[0]?.id || '';
        return true;
      }
      player.departed = true; player.finished = true; player.strokes = MAX_STROKES;
      for (let index = room.holeIndex; index < room.holes; index++) if (player.scores[index] === null) player.scores[index] = MAX_STROKES;
      if (room.hostId === player.id) room.hostId = room.players.find(p => !p.departed)?.id || '';
      if (room.phase === 'playing' && room.turnId === player.id) finishTurn(room, player, now);
      return true;
    }
    default: throw new RoomError(400, 'Unknown clubhouse action.');
  }
}
