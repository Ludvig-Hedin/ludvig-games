/* Added to every page the desktop app serves (/__ludvig-desktop.js). It keeps players inside the local copies:
   links to a game's public site open the copy on the same computer, and invite links copied on the host Mac
   (whose window uses 127.0.0.1) are rewritten to its network address so friends can open them.
   The runtime prepends: const LUDVIG_DESKTOP = { sites: [{ site, port }], lan: "192.168.1.5" | null }; */
(() => {
  if (window.__ludvigDesktop) return; // the page tag and the app's preload can both load it
  window.__ludvigDesktop = true;
  const cfg = LUDVIG_DESKTOP;
  const host = location.hostname;
  const sites = new Map(cfg.sites.map((s) => [s.site, `${location.protocol}//${host}:${s.port}`]));

  const toLocal = (value) => {
    try {
      const url = new URL(value, location.href);
      const base = sites.get(url.origin);
      return base ? base + url.pathname + url.search + url.hash : null;
    } catch {
      return null;
    }
  };

  const fixLink = (event) => {
    const link = event.target && event.target.closest ? event.target.closest("a[href]") : null;
    if (!link) return;
    const local = toLocal(link.href);
    if (local) link.href = local;
  };
  document.addEventListener("click", fixLink, true);
  document.addEventListener("auxclick", fixLink, true);

  const open = window.open;
  window.open = function (url, ...rest) {
    const local = url ? toLocal(String(url)) : null;
    return open.call(this, local || url, ...rest);
  };

  // Inside the Mac app the window's own buttons replace the hub's My records and Download links, and games
  // open in the same window, so the "opens in a new tab" arrows go too.
  if (/\bElectron\//.test(navigator.userAgent)) {
    const style = document.createElement("style");
    style.textContent = ".masthead-nav, .card-external { display: none !important; }";
    document.documentElement.append(style);
  }

  const loopback = host === "127.0.0.1" || host === "localhost";
  const inApp = /\bElectron\//.test(navigator.userAgent);
  const gameId = cfg.game === "hub" ? location.pathname.split("/")[1] || "hub" : cfg.game;
  const inviteParam = cfg.invites[gameId] || "room";

  // Rooms: tell the app window (app/preload-content.cjs) when this page opens or leaves an online room, so
  // Play together can show a QR code that joins it directly.
  const report = (room) => window.postMessage({ __ludvigDesktop: "room", game: gameId, ...room }, location.origin);
  const CODE = /^[A-Z0-9]{4,8}$/;
  const fromUrl = () => {
    const code = new URLSearchParams(location.search).get(inviteParam);
    if (code && CODE.test(code.toUpperCase())) report({ code: code.toUpperCase(), kind: "invite" });
  };
  if (inApp) {
    addEventListener("load", fromUrl);
    for (const name of ["pushState", "replaceState"]) {
      const original = history[name];
      history[name] = function (...args) {
        const result = original.apply(this, args);
        fromUrl();
        return result;
      };
    }
    // The separate games create rooms with POST /api/...; their answer carries the room code.
    const fetchOriginal = window.fetch;
    window.fetch = async function (input, init) {
      const response = await fetchOriginal.call(this, input, init);
      try {
        const url = new URL(typeof input === "string" ? input : input.url, location.href);
        const method = (init && init.method) || (input && input.method) || "GET";
        if (method.toUpperCase() === "POST" && url.origin === location.origin && url.pathname.startsWith("/api/")) {
          response.clone().json().then((body) => {
            const code = body && (body.code || (body.room && body.room.code));
            if (typeof code === "string" && CODE.test(code)) report({ code, kind: "invite" });
          }, () => {});
        }
      } catch {}
      return response;
    };
    // Hub games use Ludvig.mp rooms; their players meet by quick match or by typing the code.
    const watchMp = () => {
      const mp = window.Ludvig && window.Ludvig.mp;
      if (!mp || mp.__ludvigWatched) return;
      for (const name of ["create", "join"]) {
        const original = mp[name];
        if (typeof original !== "function") continue;
        mp[name] = async function (...args) {
          const room = await original.apply(this, args);
          if (room && room.code) {
            report({ code: room.code, kind: "mp", quick: Boolean(args[0] && args[0].quick) });
            if (room.on) room.on("close", () => report({ code: null }));
          }
          return room;
        };
      }
      try { mp.__ludvigWatched = true; } catch {}
    };
    watchMp();
    addEventListener("DOMContentLoaded", watchMp);
  }

  // Guests (a phone that scanned the host's QR code): a short notice that they are on the host's games.
  if (!inApp && !loopback && cfg.host) {
    const key = "ludvig:desktop-notice";
    let shown = false;
    try { shown = sessionStorage.getItem(key) === gameId; sessionStorage.setItem(key, gameId); } catch {}
    if (!shown) {
      const show = () => {
        const box = document.createElement("div");
        box.setAttribute("role", "status");
        const title = document.createElement("strong");
        title.textContent = `Connected to ${cfg.host}`;
        const hint = document.createElement("span");
        hint.textContent = cfg.hints[gameId] || (gameId === "hub" ? "Pick the same game as your friends." : "");
        box.append(title, hint);
        box.style.cssText = [
          "position:fixed", "z-index:2147483001", "left:50%", "top:max(12px, env(safe-area-inset-top))",
          "transform:translateX(-50%)", "max-width:min(420px, calc(100vw - 24px))", "padding:10px 14px",
          "border-radius:12px", "background:rgba(14,14,14,.92)", "color:#f2f2f2",
          "font:13px/1.4 -apple-system, BlinkMacSystemFont, sans-serif", "display:grid", "gap:2px",
          "box-shadow:0 8px 30px rgba(0,0,0,.35)", "transition:opacity 300ms ease", "pointer-events:none",
        ].join(";");
        hint.style.color = "rgba(242,242,242,.72)";
        if (!hint.textContent) hint.remove();
        document.body.append(box);
        setTimeout(() => { box.style.opacity = "0"; }, 6500);
        setTimeout(() => box.remove(), 7000);
      };
      if (document.body) show();
      else addEventListener("DOMContentLoaded", show);
    }
  }

  if (!loopback || !cfg.lan) return;

  const own = `${location.protocol}//${host}:`;
  const shared = `http://${cfg.lan}:`;
  const fix = (text) => (typeof text === "string" ? text.split(own).join(shared) : text);
  const noteInvite = (text) => {
    if (!inApp || typeof text !== "string") return;
    const match = /https?:\/\/\S+/.exec(text);
    if (!match) return;
    try {
      const url = new URL(match[0]);
      const code = url.searchParams.get(inviteParam);
      if (code) report({ code: code.toUpperCase(), kind: "invite", url: fix(url.href) });
    } catch {}
  };

  const clipboard = navigator.clipboard;
  if (clipboard && clipboard.writeText) {
    const writeText = clipboard.writeText.bind(clipboard);
    clipboard.writeText = (text) => {
      noteInvite(text);
      return writeText(fix(text));
    };
  }
  if (clipboard && clipboard.write && window.ClipboardItem) {
    const write = clipboard.write.bind(clipboard);
    clipboard.write = async (items) => {
      const fixed = await Promise.all(
        items.map(async (item) => {
          if (!item.types.includes("text/plain")) return item;
          const parts = {};
          for (const type of item.types) {
            const blob = await item.getType(type);
            parts[type] = type === "text/plain" ? new Blob([fix(await blob.text())], { type }) : blob;
          }
          return new ClipboardItem(parts);
        }),
      );
      return write(fixed);
    };
  }
  if (navigator.share) {
    const share = navigator.share.bind(navigator);
    navigator.share = (data = {}) => share({ ...data, url: fix(data.url), text: fix(data.text) });
  }

  // Older copy buttons select text in a field and call document.execCommand("copy").
  document.addEventListener(
    "copy",
    (event) => {
      const field = document.activeElement;
      let text = "";
      if (field && typeof field.value === "string" && field.selectionStart != null) {
        text = field.value.slice(field.selectionStart, field.selectionEnd);
      } else {
        text = String(window.getSelection() || "");
      }
      if (!text.includes(own) || !event.clipboardData) return;
      event.clipboardData.setData("text/plain", fix(text));
      event.preventDefault();
    },
    true,
  );
})();
