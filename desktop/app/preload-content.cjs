// Runs in every game page inside the app. Loads the desktop script (runtime/inject.js) into the page itself,
// for pages that cannot carry it as a tag (the React games), so copied invite links get this Mac's network
// address and public game links open the local copies. Passes the script's room reports to the app.
const { webFrame, ipcRenderer } = require("electron");

if (location.protocol === "http:") {
  fetch("/__ludvig-desktop.js", { cache: "no-store" })
    .then((r) => (r.ok ? r.text() : ""))
    .then((code) => code && webFrame.executeJavaScript(code))
    .catch(() => {});

  window.addEventListener("message", (event) => {
    const data = event.data;
    if (event.source !== window || !data || data.__ludvigDesktop !== "room") return;
    ipcRenderer.send("room", {
      game: String(data.game || "").slice(0, 40),
      code: typeof data.code === "string" ? data.code.slice(0, 12) : null,
      kind: data.kind === "mp" ? "mp" : "invite",
      quick: Boolean(data.quick),
      url: typeof data.url === "string" ? data.url.slice(0, 300) : null,
    });
  });
}
