/**
 * Earth Memory desktop app (Electron).
 *
 * Starts the bundled Next.js server (resources/server/server.js) as a Node process on a free local port,
 * with its embedded PostgreSQL database (PGlite) in the user's profile, then shows it in a window.
 * The first start migrates and seeds the reference archive, which takes a little while.
 */
const { app, BrowserWindow, shell, dialog } = require("electron");
const { fork } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const path = require("node:path");

let server = null;
let mainWindow = null;

if (!app.requestSingleInstanceLock()) app.quit();

function serverDir() {
  // Packaged: resources/server. Development: the standalone build in the project.
  const packaged = path.join(process.resourcesPath, "server");
  return fs.existsSync(packaged) ? packaged : path.join(__dirname, "..", ".next", "standalone");
}

function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.unref();
    s.on("error", reject);
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
}

function waitForServer(url, timeoutMs) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = () => {
      http
        .get(`${url}/api/v1/health`, (res) => {
          res.resume();
          if (res.statusCode === 200) resolve();
          else retry();
        })
        .on("error", retry);
    };
    const retry = () => {
      if (Date.now() - started > timeoutMs) reject(new Error("The archive server did not start in time."));
      else setTimeout(attempt, 700);
    };
    attempt();
  });
}

const splash = `data:text/html;charset=utf-8,${encodeURIComponent(`<!doctype html><html><body style="margin:0;height:100vh;display:grid;place-items:center;background:#07101c;color:#cfe3ee;font-family:Segoe UI,sans-serif">
<div style="text-align:center"><div style="font-size:30px;letter-spacing:.3em;color:#e8f1f8">EARTH <span style="color:#2fd8c4">MEMORY</span></div>
<p style="color:#8fb3c6;margin-top:18px">Preparing the archive… The first start takes up to a minute.</p></div></body></html>`)}`;

async function start() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: "#07101c",
    title: "Earth Memory",
    icon: path.join(__dirname, "icon.png"),
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, sandbox: true },
  });
  mainWindow.loadURL(splash);

  const port = await freePort();
  const url = `http://127.0.0.1:${port}`;
  const dataDir = path.join(app.getPath("userData"), "data");
  fs.mkdirSync(dataDir, { recursive: true });
  const dir = serverDir();

  // Electron doubles as Node here, so no separate Node.js installation is needed.
  server = fork(path.join(dir, "server.js"), [], {
    cwd: dir,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      NODE_ENV: "production",
      PORT: String(port),
      HOSTNAME: "127.0.0.1",
      DATA_DIR: dataDir,
      MIGRATIONS_DIR: path.join(dir, "drizzle"),
      PUBLIC_BASE_URL: url,
      AUTO_SEED: "true",
      NEXT_TELEMETRY_DISABLED: "1",
    },
    stdio: ["ignore", "pipe", "pipe", "ipc"],
  });
  const log = fs.createWriteStream(path.join(app.getPath("userData"), "server.log"), { flags: "a" });
  server.stdout.pipe(log);
  server.stderr.pipe(log);
  server.on("exit", (code) => {
    if (code && mainWindow && !app.isQuitting) {
      dialog.showErrorBox("Earth Memory", `The archive server stopped (code ${code}). Details: ${path.join(app.getPath("userData"), "server.log")}`);
      app.quit();
    }
  });

  try {
    await waitForServer(url, 180_000);
  } catch (error) {
    dialog.showErrorBox("Earth Memory", `${error.message}\nDetails: ${path.join(app.getPath("userData"), "server.log")}`);
    app.quit();
    return;
  }
  // The first page request seeds an empty archive; load it once the server answers.
  await mainWindow.loadURL(url);

  // Links to other sites open in the default browser, not inside the app.
  mainWindow.webContents.setWindowOpenHandler(({ url: target }) => {
    if (!target.startsWith(url)) shell.openExternal(target);
    return { action: target.startsWith(url) ? "allow" : "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, target) => {
    if (!target.startsWith(url)) {
      event.preventDefault();
      shell.openExternal(target);
    }
  });
}

app.on("second-instance", () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});
app.whenReady().then(start);
app.on("before-quit", () => {
  app.isQuitting = true;
  if (server && !server.killed) server.kill();
});
app.on("window-all-closed", () => app.quit());
