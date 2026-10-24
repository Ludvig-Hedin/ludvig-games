import type { PublicRoom } from './room';

/** Ignore an older long-poll response that arrived after a newer action reply. */
export function acceptsRoom(current: PublicRoom | null, next: PublicRoom): boolean {
  if (!current || current.code !== next.code) return true;
  if (next.revision !== current.revision) return next.revision > current.revision;
  return next.serverNow >= current.serverNow;
}

/** Exclude server processing/long-poll hold time when estimating clock skew. */
export function clockOffset(serverNow: number, receivedAt: number, roundTripMs: number, serverTiming: string | null): number {
  const duration = serverTiming?.match(/(?:^|,)\s*app;dur=(\d+(?:\.\d+)?)/i)?.[1];
  const transit = duration === undefined ? 0 : Math.max(0, roundTripMs - Number(duration)) / 2;
  return serverNow + transit - receivedAt;
}

/** Removes the abort listener when either completion path wins. */
export function abortableDelay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) { resolve(); return; }
    const done = () => { clearTimeout(timer); signal.removeEventListener('abort', done); resolve(); };
    const timer = setTimeout(done, ms);
    signal.addEventListener('abort', done, { once: true });
  });
}

export function seatToken(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (value) => value.toString(16).padStart(2, '0')).join('');
}
