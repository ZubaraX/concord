// Concord desktop shell (Electron). Loads the built React app and connects to
// whatever server URL the user configures in-app (e.g. a Codespaces URL).
const { app, BrowserWindow, globalShortcut, shell, desktopCapturer, session, ipcMain, screen } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { autoUpdater } = require("electron-updater");

// Expose the real installed version to the renderer (so the "What's New" screen
// matches the actual running build). Registered before any window loads.
ipcMain.on("app:getVersion", (e) => {
  e.returnValue = app.getVersion();
});

// Auto-update status, mirrored to the renderer so it can show a download screen
// before the app restarts into the new build. Buffered so a renderer that
// mounts late can still read the latest state synchronously.
let lastUpdateStatus = { state: "idle" };
ipcMain.on("update:status:get", (e) => {
  e.returnValue = lastUpdateStatus;
});

// Screen-share source picker. The renderer fetches the available screens/windows
// (with thumbnails), shows its own picker, then tells us which one to capture;
// the display-media handler below honors that choice.
let pendingSourceId = null;
ipcMain.handle("desktop:getSources", async () => {
  const sources = await desktopCapturer.getSources({
    types: ["screen", "window"],
    thumbnailSize: { width: 320, height: 180 },
    fetchWindowIcons: true,
  });
  return sources.map((s) => ({
    id: s.id,
    name: s.name,
    isScreen: s.id.startsWith("screen:"),
    thumbnail: s.thumbnail.toDataURL(),
    appIcon: s.appIcon && !s.appIcon.isEmpty() ? s.appIcon.toDataURL() : null,
  }));
});
ipcMain.on("desktop:setSource", (_e, id) => {
  pendingSourceId = id;
});

// ── In-call speaking overlay (separate always-on-top window) ───────────────
/** @type {BrowserWindow | null} */
let overlayWin = null;
const OVERLAY_W = 230;

function buildOverlay() {
  if (overlayWin && !overlayWin.isDestroyed()) return overlayWin;
  overlayWin = new BrowserWindow({
    width: OVERLAY_W,
    height: 320,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    focusable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    webPreferences: { preload: path.join(__dirname, "preload.cjs"), contextIsolation: true, nodeIntegration: false },
  });
  overlayWin.setAlwaysOnTop(true, "screen-saver");
  overlayWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  // Click-through: the overlay never intercepts mouse events — clicks pass to
  // whatever is underneath it.
  overlayWin.setIgnoreMouseEvents(true);
  if (DEV_URL) overlayWin.loadURL(DEV_URL + "#overlay");
  else overlayWin.loadFile(path.join(__dirname, "..", "dist", "index.html"), { hash: "overlay" });
  overlayWin.on("closed", () => (overlayWin = null));
  return overlayWin;
}

function positionOverlay(corner) {
  if (!overlayWin || overlayWin.isDestroyed()) return;
  const { workArea } = screen.getPrimaryDisplay();
  const [w, h] = overlayWin.getSize();
  const m = 16;
  const x = corner?.includes("left") ? workArea.x + m : workArea.x + workArea.width - w - m;
  const y = corner?.includes("top") ? workArea.y + m : workArea.y + workArea.height - h - m;
  overlayWin.setPosition(Math.round(x), Math.round(y));
}

// The main renderer pushes call state; we mirror it to the overlay window and
// show/hide it accordingly.
ipcMain.on("overlay:state", (_e, state) => {
  const active = state && state.enabled && state.active && (state.participants?.length ?? 0) > 0;
  if (!active) {
    if (overlayWin && !overlayWin.isDestroyed()) overlayWin.hide();
    return;
  }
  const win2 = buildOverlay();
  const send = () => {
    if (overlayWin && !overlayWin.isDestroyed()) overlayWin.webContents.send("overlay:data", state);
  };
  if (win2.webContents.isLoading()) win2.webContents.once("did-finish-load", send);
  else send();
  positionOverlay(state.corner);
  if (!win2.isVisible()) win2.showInactive();
});

// App/window icon (embedded into the .exe by electron-builder; also used for
// the dev taskbar icon when the source file is present).
const ICON = path.join(__dirname, "..", "build", "icon.ico");

// Hardware-accelerated video/screen-share decode is on by default; these
// switches unlock high-quality WebRTC capture for the future SFU work.
app.commandLine.appendSwitch("enable-features", "WebRTCPipeWireCapturer");
app.commandLine.appendSwitch("force-high-performance-gpu");

const DEV_URL = process.env.VITE_DEV_SERVER_URL;

/** @type {BrowserWindow | null} */
let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 832,
    minWidth: 940,
    minHeight: 560,
    backgroundColor: "#1e1f22",
    autoHideMenuBar: true,
    ...(fs.existsSync(ICON) ? { icon: ICON } : {}),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      // Required for getUserMedia/getDisplayMedia in the renderer.
      backgroundThrottling: false,
    },
  });

  if (DEV_URL) {
    win.loadURL(DEV_URL);
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    win.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }

  // Open external links in the system browser, not a new Electron window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  win.on("closed", () => (win = null));
}

// Captures whichever screen/window the renderer's picker selected (pendingSourceId),
// falling back to the first screen. System audio (loopback) is included.
function wireScreenShare() {
  session.defaultSession.setDisplayMediaRequestHandler(
    (_request, callback) => {
      desktopCapturer.getSources({ types: ["screen", "window"] }).then((sources) => {
        const chosen = sources.find((s) => s.id === pendingSourceId) || sources[0];
        pendingSourceId = null;
        callback({ video: chosen, audio: "loopback" });
      });
    },
    { useSystemPicker: false }
  );
}

app.whenReady().then(() => {
  wireScreenShare();
  createWindow();

  // Auto-update from GitHub Releases. We want each launch to run the latest
  // build, so on startup we check, download, and — once downloaded — install
  // immediately and relaunch into the new version. The new build then shows its
  // own changelog ("What's New") on start. Only meaningful when packaged.
  if (app.isPackaged) {
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    const startedAt = Date.now();
    let installing = false;

    const sendUpdate = (payload) => {
      lastUpdateStatus = payload;
      if (win && !win.isDestroyed()) win.webContents.send("update:status", payload);
    };

    autoUpdater.on("update-available", (info) =>
      sendUpdate({ state: "available", version: info?.version, percent: 0 })
    );
    autoUpdater.on("download-progress", (p) =>
      sendUpdate({ state: "downloading", percent: Math.round(p?.percent || 0) })
    );
    autoUpdater.on("update-not-available", () => sendUpdate({ state: "none" }));
    autoUpdater.on("error", () => sendUpdate({ state: "error" }));
    autoUpdater.on("update-downloaded", (info) => {
      sendUpdate({ state: "downloaded", version: info?.version, percent: 100 });
      if (installing) return;
      // Only relaunch immediately for an update found right after launch (so the
      // app starts on the latest build, as intended). If an update arrives later
      // in the session, don't yank the user out of it (e.g. mid-call) — it'll be
      // applied automatically on the next quit (autoInstallOnAppQuit).
      if (Date.now() - startedAt > 90 * 1000) return;
      installing = true;
      // Brief pause so the renderer can show "installing / restarting", then
      // install silently and relaunch into the new version.
      setTimeout(() => {
        try {
          autoUpdater.quitAndInstall(true, true);
        } catch {
          installing = false;
        }
      }, 900);
    });

    autoUpdater.checkForUpdates().catch(() => {});
    // Keep checking hourly for long-running sessions.
    setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 60 * 60 * 1000);
  }

  // Global hotkey: toggle window visibility (native API per spec).
  globalShortcut.register("CommandOrControl+Shift+C", () => {
    if (!win) return createWindow();
    win.isVisible() ? win.hide() : win.show();
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("will-quit", () => globalShortcut.unregisterAll());

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
