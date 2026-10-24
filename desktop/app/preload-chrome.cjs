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
  update: () => ipcRenderer.send("update"),
  settings: (which) => ipcRenderer.send("settings", which),
  dismissTip: () => ipcRenderer.send("dismiss-tip"),
  tipSize: (height) => ipcRenderer.send("tip-size", height),
  copy: (text) => ipcRenderer.send("copy", text),
});
