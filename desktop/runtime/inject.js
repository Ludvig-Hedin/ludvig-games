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
  if (!loopback || !cfg.lan) return;

  const own = `${location.protocol}//${host}:`;
  const shared = `http://${cfg.lan}:`;
  const fix = (text) => (typeof text === "string" ? text.split(own).join(shared) : text);

  const clipboard = navigator.clipboard;
  if (clipboard && clipboard.writeText) {
    const writeText = clipboard.writeText.bind(clipboard);
    clipboard.writeText = (text) => writeText(fix(text));
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
