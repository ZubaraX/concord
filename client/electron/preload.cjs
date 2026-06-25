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
  // Placeholder channel for future native features (tray, notifications…).
  send: (channel, payload) => ipcRenderer.send(channel, payload),
});
