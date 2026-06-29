// Minimal, safe bridge between the renderer and the desktop shell.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("concord", {
  isDesktop: true,
  platform: process.platform,
  // The actual installed app version (matches the auto-updater), used by the
  // "What's New" screen to detect upgrades.
  version: ipcRenderer.sendSync("app:getVersion"),
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  },
  // Screen-share source picker (desktop only).
  getDesktopSources: () => ipcRenderer.invoke("desktop:getSources"),
  setDesktopSource: (id) => ipcRenderer.send("desktop:setSource", id),

  // Taskbar/dock unread badge.
  setBadge: (dataUrl, count) => ipcRenderer.send("app:setBadge", { dataUrl, count }),

  // In-call speaking overlay: main app pushes state; the overlay window subscribes.
  sendOverlayState: (state) => ipcRenderer.send("overlay:state", state),
  onOverlayData: (cb) => {
    const listener = (_e, data) => cb(data);
    ipcRenderer.on("overlay:data", listener);
    return () => ipcRenderer.removeListener("overlay:data", listener);
  },

  // Auto-update status: read the latest synchronously on mount, and subscribe
  // to live push updates (download progress, downloaded, etc.).
  getUpdateStatus: () => ipcRenderer.sendSync("update:status:get"),
  onUpdate: (cb) => {
    const listener = (_e, payload) => cb(payload);
    ipcRenderer.on("update:status", listener);
    return () => ipcRenderer.removeListener("update:status", listener);
  },
  // Placeholder channel for future native features (tray, notifications…).
  send: (channel, payload) => ipcRenderer.send(channel, payload),
});
