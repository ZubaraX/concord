// Concord desktop shell (Electron). Loads the built React app and connects to
// whatever server URL the user configures in-app (e.g. a Codespaces URL).
const { app, BrowserWindow, globalShortcut, shell, desktopCapturer, session } = require("electron");
const path = require("node:path");
const fs = require("node:fs");

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
