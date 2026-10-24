'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { randomId } from './id';
import { turnOf, type GameConfig } from './game';
import type { PublicRoom, RoomAction } from './room';
import { abortableDelay, acceptsRoom, clockOffset, seatToken } from './online-sync';

type Connection = 'offline' | 'connecting' | 'live' | 'reconnecting';
type RoomResponse = PublicRoom & { token?: string; error?: string; room?: PublicRoom };
const BUSY_MESSAGE = 'Online rooms are temporarily unavailable. Local and computer games are ready to play.';
type RequestError = Error & { status?: number; room?: PublicRoom };
function storedToken(code: string): string { try { return sessionStorage.getItem(`chess:seat:${code}`) ?? ''; } catch { return ''; } }
function storeToken(code: string, token: string): void { try { sessionStorage.setItem(`chess:seat:${code}`, token); } catch { /* Session remains in memory. */ } }
function cancelled(): DOMException { return new DOMException('Connection cancelled.', 'AbortError'); }

export function useOnline() {
  const [room, setRoom] = useState<PublicRoom | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [session, setSession] = useState(0);
  const [connection, setConnection] = useState<Connection>('offline');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const roomRef = useRef<PublicRoom | null>(null);
  const tokenRef = useRef('');
  const generation = useRef(0);
  const locked = useRef(false);
  const requests = useRef(new Set<AbortController>());
  const clockSamples = useRef(new WeakMap<object, number>());
  const memoryTokens = useRef(new Map<string, string>());
  const [offset, setOffset] = useState(0);

  const receive = useCallback((next: PublicRoom) => {
    if (!acceptsRoom(roomRef.current, next)) return;
    roomRef.current = next; setRoom(next);
    setOffset(clockSamples.current.get(next) ?? next.serverNow - Date.now());
  }, []);

  const cancelRequests = useCallback(() => {
    for (const controller of requests.current) controller.abort();
    requests.current.clear();
  }, []);

  const beginConnection = useCallback(() => {
    const epoch = ++generation.current;
    cancelRequests(); locked.current = false;
    roomRef.current = null; tokenRef.current = '';
    setRoom(null); setCode(null); setSession(epoch);
    setBusy(true); setConnection('connecting'); setError('');
    return epoch;
  }, [cancelRequests]);

  const attach = useCallback((data: RoomResponse, epoch: number, token = '') => {
    if (epoch !== generation.current) throw cancelled();
    tokenRef.current = data.token ?? token;
    if (tokenRef.current) {
      memoryTokens.current.set(data.code, tokenRef.current);
      storeToken(data.code, tokenRef.current);
    }
    receive(data); setCode(data.code); setConnection('live'); setError('');
    window.history.replaceState({}, '', `${window.location.pathname}?room=${data.code}`);
  }, [receive]);

  const fetchRoom = useCallback(async (path: string, body?: unknown, token = '', signal?: AbortSignal): Promise<RoomResponse> => {
    const controller = new AbortController();
    const abort = () => controller.abort(signal?.reason);
    if (signal?.aborted) abort();
    else signal?.addEventListener('abort', abort, { once: true });
    const timeout = setTimeout(() => controller.abort(new DOMException('The connection timed out.', 'TimeoutError')), 15000);
    requests.current.add(controller);
    const sentAt = performance.now();
    try {
      let response: Response;
      try {
        response = await fetch(path, {
          method: body ? 'POST' : 'GET',
          headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          ...(body ? { body: JSON.stringify(body) } : {}),
          cache: 'no-store', signal: controller.signal,
        });
      } catch (error) {
        // Timeouts and cancels keep their own reason; a network failure gets the plain message.
        if (controller.signal.aborted) throw error;
        throw new Error('Could not connect to the room.');
      }
      // 429, 503 or Cloudflare's 1027 daily-limit page may carry no JSON.
      const data = await response.json().catch(() => ({})) as RoomResponse;
      const receivedAt = Date.now(); const rtt = performance.now() - sentAt;
      const rememberClock = (next: PublicRoom) => {
        clockSamples.current.set(next, clockOffset(next.serverNow, receivedAt, rtt, response.headers.get('server-timing')));
      };
      if (data.room) rememberClock(data.room);
      if (!response.ok) {
        const busy = response.status === 429 || response.status === 503;
        const error = new Error(data.error || (busy ? BUSY_MESSAGE : 'Could not connect to the room.')) as RequestError;
        error.status = response.status; error.room = data.room; throw error;
      }
      if (!data.game || !data.code || !Number.isFinite(data.serverNow) || !Number.isSafeInteger(data.revision)) {
        throw new Error('The server returned an unreadable room. Please reconnect.');
      }
      rememberClock(data);
      return data;
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', abort);
      requests.current.delete(controller);
    }
  }, []);

  useEffect(() => {
    if (!code) return;
    const controller = new AbortController(); const epoch = generation.current;
    // Cheap HTTP polling: 1.5 s on the opponent's turn, 3 s on your own turn,
    // 4 s while waiting for a player or after the game, 10 s in a hidden tab.
    // Coming back to the tab polls at once.
    let wake = new AbortController();
    const onVisible = () => { if (document.visibilityState === 'visible') wake.abort(); };
    document.addEventListener('visibilitychange', onVisible);
    controller.signal.addEventListener('abort', () => wake.abort(), { once: true });
    const pace = () => {
      if (document.visibilityState === 'hidden') return 10000;
      const current = roomRef.current;
      if (!current || current.game.waiting || current.game.result) return 4000;
      return current.you === turnOf(current.game) ? 3000 : 1500;
    };
    const run = async () => {
      let failures = 0;
      while (!controller.signal.aborted && generation.current === epoch) {
        try {
          const next = await fetchRoom(`/api/rooms/${code}`, undefined, tokenRef.current, controller.signal);
          if (controller.signal.aborted || generation.current !== epoch) return;
          receive(next); setConnection('live'); setError(''); failures = 0;
          wake = new AbortController();
          await abortableDelay(pace(), wake.signal);
        } catch (error) {
          if (controller.signal.aborted || generation.current !== epoch) return;
          failures++; setConnection('reconnecting');
          if (failures > 2) setError(error instanceof Error ? error.message : 'Reconnecting…');
          const status = (error as RequestError).status;
          if (status === 404 || status === 410) { setConnection('offline'); return; }
          await abortableDelay(Math.min(10000, 1500 * 2 ** (failures - 1)), controller.signal);
        }
      }
    };
    void run();
    return () => { controller.abort(); document.removeEventListener('visibilitychange', onVisible); };
  }, [code, session, fetchRoom, receive]);

  useEffect(() => () => { generation.current++; cancelRequests(); }, [cancelRequests]);

  const create = useCallback(async (config: GameConfig) => {
    const epoch = beginConnection();
    try {
      const data = await fetchRoom('/api/rooms', { nickname: config.nickname, color: config.color, time: config.time });
      attach(data, epoch); return data;
    } catch (error) { if (epoch === generation.current) setConnection('offline'); throw error; }
    finally { if (epoch === generation.current) setBusy(false); }
  }, [attach, beginConnection, fetchRoom]);

  const join = useCallback(async (joinCode: string, nickname: string, spectate = false) => {
    const value = joinCode.trim().replace(/\s/g, '').toUpperCase();
    const epoch = beginConnection();
    const token = spectate ? '' : memoryTokens.current.get(value) || storedToken(value) || seatToken();
    // Persist the capability before submitting the join, so a lost response
    // cannot strand the participant outside an already-committed seat.
    if (token) { memoryTokens.current.set(value, token); storeToken(value, token); }
    try {
      const data = await fetchRoom(`/api/rooms/${value}`, { action: 'join', nickname, spectate }, token);
      attach(data, epoch, token); return data;
    } catch (error) { if (epoch === generation.current) setConnection('offline'); throw error; }
    finally { if (epoch === generation.current) setBusy(false); }
  }, [attach, beginConnection, fetchRoom]);

  const resume = useCallback(async (resumeCode: string) => {
    const value = resumeCode.trim().replace(/\s/g, '').toUpperCase();
    const token = memoryTokens.current.get(value) || storedToken(value);
    if (!token) return null;
    const epoch = beginConnection();
    try {
      const data = await fetchRoom(`/api/rooms/${value}`, undefined, token);
      if (epoch !== generation.current) throw cancelled();
      // A previous join may have failed before claiming a seat. Let the normal
      // join screen handle it instead of silently becoming a spectator.
      if (data.you === 'spectator') { setConnection('offline'); return null; }
      attach(data, epoch, token); return data;
    } catch (error) { if (epoch === generation.current) setConnection('offline'); throw error; }
    finally { if (epoch === generation.current) setBusy(false); }
  }, [attach, beginConnection, fetchRoom]);

  const send = useCallback(async (action: RoomAction['action'], extra: Partial<Pick<RoomAction, 'move' | 'claim'>> = {}) => {
    if (locked.current || !roomRef.current) return;
    locked.current = true; setBusy(true);
    const epoch = generation.current; const current = roomRef.current; const token = tokenRef.current;
    let body = { action, requestId: randomId(), revision: current.revision, ...extra };
    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        if (epoch !== generation.current) throw cancelled();
        try {
          const next = await fetchRoom(`/api/rooms/${current.code}`, body, token);
          if (epoch === generation.current) receive(next);
          return;
        } catch (error) {
          if (epoch !== generation.current) throw cancelled();
          const failure = error as RequestError;
          if (failure.room) receive(failure.room);
          // Both players often press "Play again" at once: retry a rematch vote on the fresh revision.
          if (action === 'rematch' && failure.status === 409 && failure.room && attempt < 2) { body = { ...body, requestId: randomId(), revision: failure.room.revision }; continue; }
          // Retry transport/server failures with the same id and revision.
          if ((failure.status !== undefined && failure.status < 500) || attempt === 2) throw error;
        }
      }
    } finally {
      if (epoch === generation.current) { locked.current = false; setBusy(false); }
    }
  }, [fetchRoom, receive]);

  const leave = useCallback(() => {
    generation.current++; cancelRequests(); locked.current = false;
    roomRef.current = null; tokenRef.current = '';
    setRoom(null); setCode(null); setBusy(false); setConnection('offline'); setError('');
    window.history.replaceState({}, '', window.location.pathname);
  }, [cancelRequests]);

  return { room, connection, busy, error, offset, create, join, resume, send, leave };
}
