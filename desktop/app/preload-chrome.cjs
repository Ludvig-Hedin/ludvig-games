// Bridge for the top bar and the Play together panel. Nothing else runs with app privileges.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("app", {
  state: () => ipcRenderer.invoke("state"),
  onState: (fn) => ipcRenderer.on("state", (_e, s) => fn(s)),
  panel: (open) => ipcRenderer.send("panel", open),
  home: () => ipcRenderer.send("home"),
  records: () => ipcRenderer.send("records"),
  join: (id) => ipcRenderer.send("join", id),
  leave: () => ipcRenderer.send("leave"),
  copy: (text) => ipcRenderer.send("copy", text),
});
