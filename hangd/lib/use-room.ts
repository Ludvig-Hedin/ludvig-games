"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ApiResponse, GameAction, Language, PublicRoom } from "./protocol";

type Connection = "idle" | "connecting" | "online" | "reconnecting" | "offline";
interface Session {
  code: string;
  token: string;
}
type ApiData = ApiResponse & { error?: string; code?: string; left?: boolean };
const SESSION_KEY = "hangd:session:v1";
// Free-plan budget: stop polling in background tabs and in rooms nobody touches.
const HIDDEN_PAUSE_MS = 60_000;
const IDLE_PAUSE_MS = 20 * 60_000;
const POLL_MS = 1500;

// Storage contains only a reconnect credential. Every game fact comes from the server.
export function useRoom() {
  const [room, setRoom] = useState<PublicRoom | null>(null);
  const [connection, setConnection] = useState<Connection>("idle");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [inviteCode, setInviteCode] = useState("");
  const [now, setNow] = useState(Date.now());
  const offset = useRef(0);
  const sessionRef = useRef<Session | null>(null);
  const versionRef = useRef(-1);
  const lastChangeRef = useRef(Date.now());
  const accept = useCallback((next: PublicRoom) => {
    offset.current = next.serverNow - Date.now();
    setNow(Date.now() + offset.current);
    if (next.version >= versionRef.current) {
      if (next.version !== versionRef.current) lastChangeRef.current = Date.now();
      versionRef.current = next.version;
      setRoom(next);
    }
    setConnection("online");
  }, []);

  useEffect(() => {
    const code =
      new URLSearchParams(window.location.search).get("room")?.toUpperCase() ??
      "";
    if (code) setInviteCode(code.slice(0, 6));
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (raw) {
        const stored = JSON.parse(raw) as Session;
        if (
          /^[A-Z2-9]{6}$/.test(stored.code) &&
          /^[a-f0-9]{64}$/.test(stored.token) &&
          (!code || code === stored.code)
        ) {
          sessionRef.current = stored;
          setSession(stored);
          setConnection("connecting");
        }
      }
    } catch {
      /* Browser privacy settings may disable persistence; the live session still works. */
    }
    const timer = setInterval(() => setNow(Date.now() + offset.current), 100);
    return () => clearInterval(timer);
  }, []);

  const clearSession = useCallback(() => {
    sessionRef.current = null;
    setSession(null);
    setRoom(null);
    versionRef.current = -1;
    setConnection("idle");
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch {}
    window.history.replaceState(null, "", window.location.pathname);
  }, []);
  const saveSession = useCallback(
    (data: ApiResponse) => {
      if (!data.token) throw new Error("Anslutningen kunde inte skapas.");
      const next = { code: data.room.code, token: data.token };
      versionRef.current = -1;
      sessionRef.current = next;
      setSession(next);
      try {
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(next));
      } catch {}
      window.history.replaceState(null, "", `?room=${next.code}`);
      accept(data.room);
    },
    [accept],
  );

  useEffect(() => {
    if (!session) return;
    // Polls the room snapshot every 1.5 s (Workers Free: one D1 read per poll,
    // no long-lived stream). Backs off while the service is busy or offline.
    const controller = new AbortController();
    let stopped = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let resolveWait: (() => void) | undefined;
    let paused = false;
    let resume: (() => void) | undefined;
    let hiddenTimer: ReturnType<typeof setTimeout> | undefined;
    const pause = () => {
      if (stopped || paused) return;
      paused = true;
    };
    const wake = () => {
      lastChangeRef.current = Date.now();
      if (!paused) return;
      paused = false;
      resume?.();
    };
    const wait = (ms: number) =>
      new Promise<void>((resolve) => {
        resolveWait = resolve;
        retryTimer = setTimeout(resolve, ms);
      });
    const run = async () => {
      let failures = 0;
      while (!stopped) {
        if (paused) {
          await new Promise<void>((resolve) => {
            resume = resolve;
          });
          if (stopped) return;
          setConnection("reconnecting");
        }
        try {
          const response = await fetch(`/api/rooms/${session.code}`, {
            headers: { Authorization: `Bearer ${session.token}` },
            cache: "no-store",
            signal: AbortSignal.any([
              controller.signal,
              AbortSignal.timeout(8000),
            ]),
          });
          // Platform error pages (429, 503, daily limit 1027) are HTML, not JSON.
          const data = (await response
            .json()
            .catch(() => ({}))) as Partial<ApiData>;
          if (stopped || sessionRef.current?.token !== session.token) return;
          if ([401, 404].includes(response.status)) {
            setError(data.error ?? "Rummet har stängt.");
            clearSession();
            return;
          }
          if (!response.ok || !data.room) throw new Error(data.error);
          accept(data.room);
          failures = 0;
        } catch {
          if (stopped || controller.signal.aborted) return;
          failures = Math.min(failures + 1, 4);
          setConnection(navigator.onLine ? "reconnecting" : "offline");
        }
        if (Date.now() - lastChangeRef.current > IDLE_PAUSE_MS) pause();
        if (!stopped && !paused)
          await wait(
            failures
              ? Math.min(15_000, POLL_MS * 2 ** failures)
              : POLL_MS,
          );
      }
    };
    void run();
    const offline = () => setConnection("offline");
    const online = () => {
      setConnection("reconnecting");
      if (retryTimer) clearTimeout(retryTimer);
      resolveWait?.();
    };
    const visibility = () => {
      if (hiddenTimer) clearTimeout(hiddenTimer);
      if (document.hidden) hiddenTimer = setTimeout(pause, HIDDEN_PAUSE_MS);
      else wake();
    };
    window.addEventListener("offline", offline);
    window.addEventListener("online", online);
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pointerdown", wake);
    window.addEventListener("keydown", wake);
    return () => {
      stopped = true;
      controller.abort();
      if (retryTimer) clearTimeout(retryTimer);
      if (hiddenTimer) clearTimeout(hiddenTimer);
      resolveWait?.();
      resume?.();
      window.removeEventListener("offline", offline);
      window.removeEventListener("online", online);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pointerdown", wake);
      window.removeEventListener("keydown", wake);
    };
  }, [session, accept, clearSession]);

  const enter = useCallback(
    async (path: string, data: Record<string, unknown>) => {
      setBusy(true);
      setError(null);
      setConnection("connecting");
      try {
        const response = await fetch(path, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
          signal: AbortSignal.timeout(15000),
        });
        const result = (await response
          .json()
          .catch(() => ({}))) as ApiData;
        if (!response.ok)
          throw new Error(result.error ?? "Det gick inte att ansluta.");
        saveSession(result);
      } catch (e) {
        // No network or timeout: the existing connection message, never a raw browser error.
        setError(
          e instanceof Error && !(e instanceof TypeError) && !(e instanceof DOMException)
            ? e.message
            : "Det gick inte att ansluta.",
        );
        setConnection("idle");
      } finally {
        setBusy(false);
      }
    },
    [saveSession],
  );
  const create = useCallback(
    (nickname: string, avatar: number, language: Language) =>
      enter("/api/rooms", { nickname, avatar, language }),
    [enter],
  );
  const join = useCallback(
    (code: string, nickname: string, avatar: number) =>
      enter(
        `/api/rooms/${encodeURIComponent(code.trim().toUpperCase())}/join`,
        { nickname, avatar },
      ),
    [enter],
  );
  const send = useCallback(
    async (action: GameAction): Promise<boolean> => {
      const current = sessionRef.current;
      if (!current) return false;
      try {
        const response = await fetch(`/api/rooms/${current.code}/actions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${current.token}`,
          },
          body: JSON.stringify(action),
          signal: AbortSignal.timeout(12000),
        });
        const data = (await response.json()) as ApiData;
        if (!response.ok) {
          if (action.type !== "typing" && action.type !== "heartbeat")
            setError(data.error ?? "Försök igen.");
          return false;
        }
        if (data.room && sessionRef.current?.token === current.token)
          accept(data.room);
        if (action.type !== "typing" && action.type !== "heartbeat")
          setError(null);
        return true;
      } catch {
        if (action.type !== "typing")
          setError("Anslutningen avbröts. Vi försöker ansluta igen.");
        setConnection("reconnecting");
        return false;
      }
    },
    [accept],
  );
  const leave = useCallback(async () => {
    const current = sessionRef.current;
    clearSession();
    setError(null);
    if (current) {
      // Leaving remains immediate even offline. Presence expiry handles an undeliverable notification.
      void fetch(`/api/rooms/${current.code}/actions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${current.token}`,
        },
        body: JSON.stringify({ type: "leave" }),
        signal: AbortSignal.timeout(1500),
        keepalive: true,
      }).catch(() => {});
    }
  }, [clearSession]);
  const clearError = useCallback(() => setError(null), []);
  return {
    room,
    connection,
    error,
    busy,
    create,
    join,
    send,
    leave,
    clearError,
    now,
    inviteCode,
    setInviteCode,
  };
}
