// Concord desktop shell (Electron). Loads the built React app and connects to
// whatever server URL the user configures in-app (e.g. a Codespaces URL).
const { app, BrowserWindow, globalShortcut, shell, desktopCapturer, session, ipcMain } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { autoUpdater } = require("electron-updater");

// Expose the real installed version to the renderer (so the "What's New" screen
// matches the actual running build). Registered before any window loads.
ipcMain.on("app:getVersion", (e) => {
  e.returnValue = app.getVersion();
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

// Screen-share source picker (used by the future "Go Live" feature). Grants
// the full primary screen at maximum available resolution — no FPS/res cap.
function wireScreenShare() {
  session.defaultSession.setDisplayMediaRequestHandler(
    (_request, callback) => {
      desktopCapturer.getSources({ types: ["screen", "window"] }).then((sources) => {
        callback({ video: sources[0], audio: "loopback" });
      });
    },
    { useSystemPicker: true }
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
    let installing = false;
    autoUpdater.on("update-downloaded", () => {
      if (installing) return;
      installing = true;
      // isSilent = true (no extra installer UI), isForceRunAfter = true (relaunch).
      try {
        autoUpdater.quitAndInstall(true, true);
      } catch {
        installing = false;
      }
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
