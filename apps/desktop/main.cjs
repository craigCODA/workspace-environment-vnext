const { spawn, spawnSync } = require('node:child_process');
const { appendFileSync, existsSync, mkdirSync } = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const { app, BrowserWindow, dialog, ipcMain, screen, session } = require('electron');

const {
  DESKTOP_CHANNELS,
  createWindowOptions,
  createWorkspaceUrl,
  isAllowedNavigation,
  resolveHostCommand,
  waitForHostAnnouncements,
} = require('./lib/runtime.cjs');
const { startStaticServer } = require('./lib/static-server.cjs');

const APP_ID = 'com.nerdlife.workspaceenvironment.vnext';
const repoRoot = path.resolve(__dirname, '..', '..');
const preloadPath = path.join(__dirname, 'preload.cjs');

let mainWindow = null;
let hostProcess = null;
let rendererServer = null;
let rendererOrigin = null;
let workspaceUrl = null;
let cleanupPromise = null;
let cleanupFinished = false;
let isQuitting = false;
let logPath = null;
let rendererRecoveryCount = 0;

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.setAppUserModelId(APP_ID);
  app.on('second-instance', () => focusMainWindow());
  app.on('before-quit', event => {
    isQuitting = true;
    if (cleanupFinished) return;
    event.preventDefault();
    void cleanup().finally(() => {
      cleanupFinished = true;
      app.quit();
    });
  });
  app.on('window-all-closed', () => app.quit());
  void app.whenReady().then(startApplication).catch(failStartup);
}

async function startApplication() {
  initializeLogging();
  log(`Starting Workspace Environment M2A ${app.getVersion()} (${app.isPackaged ? 'packaged' : 'development'}).`);

  const rendererRoot = app.isPackaged
    ? path.join(process.resourcesPath, 'spatial')
    : path.join(repoRoot, 'apps', 'spatial', 'dist');
  if (!existsSync(rendererRoot)) throw new Error(`The vNext spatial build is missing: ${rendererRoot}`);

  const hostPort = await reserveLoopbackPort();
  rendererServer = await startStaticServer(rendererRoot, { hostPort });
  rendererOrigin = rendererServer.origin;
  const command = resolveHostCommand({
    isPackaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    repoRoot,
    parentPid: process.pid,
    port: hostPort,
    allowedOrigin: rendererOrigin,
  });
  if (app.isPackaged && !existsSync(command.executable)) throw new Error(`The bundled vNext Windows host is missing: ${command.executable}`);

  hostProcess = spawn(command.executable, command.args, {
    cwd: command.cwd,
    windowsHide: true,
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, DOTNET_CLI_TELEMETRY_OPTOUT: '1', DOTNET_NOLOGO: '1' },
  });
  hostProcess.stdout.on('data', chunk => log(`[host] ${chunk.toString('utf8').trimEnd()}`));
  hostProcess.stderr.on('data', chunk => log(`[host:error] ${chunk.toString('utf8').trimEnd()}`));
  hostProcess.once('exit', (code, signal) => {
    log(`vNext host exited (code ${code ?? 'none'}, signal ${signal ?? 'none'}).`);
    if (!isQuitting && mainWindow) failStartup(new Error('The Workspace host stopped unexpectedly.'));
  });

  const announcements = await waitForHostAnnouncements(hostProcess);
  await waitForHealth(`${announcements.hostHttpBase}/health`, hostProcess);
  workspaceUrl = createWorkspaceUrl({
    rendererOrigin,
    hostHttpBase: announcements.hostHttpBase,
    sessionToken: announcements.sessionToken,
  });

  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  registerIpc();
  await createMainWindow();
}

async function createMainWindow() {
  if (!workspaceUrl || !rendererOrigin) throw new Error('Workspace launch configuration is incomplete.');
  const primaryDisplay = screen.getPrimaryDisplay();
  const window = new BrowserWindow(createWindowOptions({
    display: primaryDisplay,
    preloadPath,
    packaged: app.isPackaged,
  }));
  mainWindow = window;
  window.setMenuBarVisibility(false);
  window.setBounds(primaryDisplay.bounds, false);
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, targetUrl) => {
    if (!isAllowedNavigation(targetUrl, rendererOrigin)) event.preventDefault();
  });
  window.webContents.on('console-message', (_event, level, message) => {
    log(`[renderer:${['verbose', 'info', 'warning', 'error'][level] ?? level}] ${message}`);
  });
  window.webContents.on('did-fail-load', (_event, code, description, validatedURL) => {
    log(`Renderer failed to load (${code} ${description}): ${validatedURL}`);
  });
  window.webContents.on('render-process-gone', (_event, details) => {
    log(`Renderer process exited (${details.reason}, code ${details.exitCode}).`);
    if (isQuitting || !workspaceUrl) return;
    if (rendererRecoveryCount++ === 0) {
      setTimeout(() => { if (mainWindow && workspaceUrl) void mainWindow.loadURL(workspaceUrl); }, 250);
    } else {
      failStartup(new Error('The Workspace renderer stopped repeatedly.'));
    }
  });
  window.once('ready-to-show', () => {
    window.setFullScreen(true);
    window.show();
    window.focus();
  });
  window.on('closed', () => { if (mainWindow === window) mainWindow = null; });
  await window.loadURL(workspaceUrl);
}

function registerIpc() {
  ipcMain.removeHandler(DESKTOP_CHANNELS.minimize);
  ipcMain.removeHandler(DESKTOP_CHANNELS.exit);
  ipcMain.handle(DESKTOP_CHANNELS.minimize, () => { mainWindow?.minimize(); });
  ipcMain.handle(DESKTOP_CHANNELS.exit, () => { app.quit(); });
}

function focusMainWindow() {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.setFullScreen(true);
  mainWindow.focus();
}

function initializeLogging() {
  const directory = path.join(app.getPath('userData'), 'logs');
  mkdirSync(directory, { recursive: true });
  logPath = path.join(directory, 'm2a-desktop.log');
}

function log(message) {
  if (!logPath) return;
  try { appendFileSync(logPath, `${new Date().toISOString()} ${message}\n`, 'utf8'); } catch { }
}

function failStartup(error) {
  if (isQuitting) return;
  isQuitting = true;
  log(`Fatal desktop error: ${error?.stack ?? error}`);
  const detail = error instanceof Error ? error.message : String(error);
  dialog.showErrorBox('Workspace Environment could not start', `${detail}\n\nDesktop log: ${logPath ?? 'unavailable'}`);
  app.quit();
}

function cleanup() {
  if (cleanupPromise) return cleanupPromise;
  cleanupPromise = (async () => {
    ipcMain.removeHandler(DESKTOP_CHANNELS.minimize);
    ipcMain.removeHandler(DESKTOP_CHANNELS.exit);
    if (rendererServer) {
      try { await rendererServer.close(); } catch (error) { log(`Renderer server shutdown failed: ${error.message}`); }
      rendererServer = null;
    }
    if (hostProcess && hostProcess.exitCode === null) {
      const pid = hostProcess.pid;
      hostProcess.kill();
      await waitForExit(hostProcess, 2_000);
      if (hostProcess.exitCode === null && process.platform === 'win32' && Number.isSafeInteger(pid)) {
        spawnSync('taskkill.exe', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
        await waitForExit(hostProcess, 2_000);
      }
    }
    hostProcess = null;
  })();
  return cleanupPromise;
}

function waitForExit(child, timeoutMs) {
  if (child.exitCode !== null) return Promise.resolve();
  return new Promise(resolve => {
    const timer = setTimeout(finish, timeoutMs);
    child.once('exit', finish);
    function finish() { clearTimeout(timer); child.off('exit', finish); resolve(); }
  });
}

async function waitForHealth(url, child, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Workspace host exited with code ${child.exitCode}.`);
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1_000) });
      if (response.ok) return;
      lastError = new Error(`health returned ${response.status}`);
    } catch (error) { lastError = error; }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Workspace host health check timed out: ${lastError?.message ?? 'no response'}`);
}

function reserveLoopbackPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = address && typeof address !== 'string' ? address.port : null;
      server.close(error => {
        if (error) reject(error);
        else if (!port) reject(new Error('Unable to reserve a loopback port.'));
        else resolve(port);
      });
    });
  });
}
