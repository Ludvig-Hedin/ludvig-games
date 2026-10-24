// Runs in every game page inside the app. Loads the desktop script (runtime/inject.js) into the page itself,
// for pages that cannot carry it as a tag (the React games), so copied invite links get this Mac's network
// address and public game links open the local copies.
const { webFrame } = require("electron");

if (location.protocol === "http:") {
  fetch("/__ludvig-desktop.js", { cache: "no-store" })
    .then((r) => (r.ok ? r.text() : ""))
    .then((code) => code && webFrame.executeJavaScript(code))
    .catch(() => {});
}
