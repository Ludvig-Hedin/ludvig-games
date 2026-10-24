/* Brings game sound back after iOS interruptions such as calls, Siri or app switches.
   Only contexts the system interrupted are resumed, on the player's next tap or key.
   Contexts a game suspends on purpose are left alone. */
(() => {
  const interrupted = new Set();
  const wake = () => interrupted.forEach(context => {
    if (context.state === 'running' || context.state === 'closed') { interrupted.delete(context); return; }
    context.resume().catch(() => {});
  });
  for (const name of ['AudioContext', 'webkitAudioContext']) {
    const Native = window[name];
    if (typeof Native !== 'function') continue;
    const Tracked = class extends Native {
      constructor(...args) {
        super(...args);
        this.addEventListener?.('statechange', () => { if (this.state === 'interrupted') interrupted.add(this); });
      }
      suspend(...args) { interrupted.delete(this); return super.suspend(...args); }
    };
    try { Object.defineProperty(window, name, { configurable: true, writable: true, value: Tracked }); } catch { /* Keep the native constructor. */ }
  }
  for (const type of ['pointerdown', 'touchend', 'keydown']) addEventListener(type, wake, { capture: true, passive: true });
})();
