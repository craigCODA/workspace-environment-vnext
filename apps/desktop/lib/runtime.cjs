const path = require('node:path');

const MAX_DIAGNOSTIC_LENGTH = 16_384;
const DESKTOP_CHANNELS = Object.freeze({
  minimize: 'workspace-desktop:minimize',
  exit: 'workspace-desktop:exit',
});

function createWindowOptions({ display, preloadPath, packaged }) {
  const bounds = display?.bounds;
  if (!bounds || ![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite)) {
    throw new TypeError('Primary display bounds are required.');
  }
  if (bounds.width <= 0 || bounds.height <= 0) throw new RangeError('Primary display dimensions must be positive.');
  if (typeof preloadPath !== 'string' || preloadPath.length === 0) throw new TypeError('preloadPath is required.');
  return {
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    fullscreen: true,
    kiosk: false,
    frame: false,
    show: false,
    title: 'Workspace Environment',
    backgroundColor: '#0b0f12',
    autoHideMenuBar: true,
    minimizable: true,
    fullscreenable: true,
    webPreferences: {
      preload: path.resolve(preloadPath),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      devTools: !packaged,
    },
  };
}

function resolveHostCommand({ isPackaged, resourcesPath, repoRoot, parentPid, port, allowedOrigin }) {
  if (!Number.isSafeInteger(parentPid) || parentPid <= 0) throw new TypeError('parentPid must be a positive integer.');
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw new TypeError('port must be 1..65535.');
  const origin = new URL(allowedOrigin);
  if (origin.protocol !== 'http:' || origin.hostname !== '127.0.0.1' || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) {
    throw new TypeError('allowedOrigin must be a loopback HTTP origin.');
  }
  const hostArgs = [
    '--m2a',
    '--port', String(port),
    '--parent-process', String(parentPid),
    '--allowed-origin', origin.origin,
  ];
  if (isPackaged) {
    const cwd = path.resolve(resourcesPath, 'host');
    return {
      executable: path.resolve(cwd, 'Workspace.Host.Windows.exe'),
      args: hostArgs,
      cwd,
    };
  }
  const root = path.resolve(repoRoot);
  return {
    executable: 'dotnet',
    args: [
      'run',
      '--project', path.resolve(root, 'apps', 'host-windows-vnext', 'Workspace.Host.Windows.csproj'),
      '--configuration', 'Release',
      '--no-launch-profile',
      '--no-build',
      '--',
      ...hostArgs,
    ],
    cwd: root,
  };
}

function createWorkspaceUrl({ rendererOrigin, hostHttpBase, sessionToken }) {
  const renderer = new URL(rendererOrigin);
  const host = new URL(hostHttpBase);
  if (renderer.protocol !== 'http:' || renderer.hostname !== '127.0.0.1') throw new TypeError('Renderer must use loopback HTTP.');
  if (host.protocol !== 'http:' || host.hostname !== '127.0.0.1') throw new TypeError('Host must use loopback HTTP.');
  if (typeof sessionToken !== 'string' || sessionToken.length < 8) throw new TypeError('Host session token is invalid.');
  host.protocol = 'ws:';
  host.pathname = '/workspace';
  host.search = '';
  host.hash = '';
  const url = new URL('/workspace.html', renderer.origin);
  url.hash = new URLSearchParams({ session: sessionToken, host: host.toString() }).toString();
  return url.toString();
}

class HostAnnouncements {
  constructor() {
    this.buffer = '';
    this.hostHttpBase = null;
    this.sessionToken = null;
  }

  push(chunk) {
    this.buffer = `${this.buffer}${String(chunk)}`.slice(-MAX_DIAGNOSTIC_LENGTH);
    const host = this.buffer.match(/(?:^|\r?\n)WORKSPACE_VNEXT_HOST=(http:\/\/127\.0\.0\.1:\d+)(?:\r?\n|$)/m);
    const session = this.buffer.match(/(?:^|\r?\n)WORKSPACE_VNEXT_SESSION=([^\r\n]+)(?:\r?\n|$)/m);
    if (host) this.hostHttpBase = host[1];
    if (session) this.sessionToken = session[1].trim();
  }

  value() {
    return this.hostHttpBase && this.sessionToken
      ? { hostHttpBase: this.hostHttpBase, sessionToken: this.sessionToken }
      : null;
  }
}

function waitForHostAnnouncements(child, { timeoutMs = 20_000 } = {}) {
  return new Promise((resolve, reject) => {
    const parser = new HostAnnouncements();
    let diagnostics = '';
    let settled = false;
    const append = chunk => { diagnostics = `${diagnostics}${chunk.toString('utf8')}`.slice(-MAX_DIAGNOSTIC_LENGTH); };
    const onStdout = chunk => {
      append(chunk);
      parser.push(chunk.toString('utf8'));
      const value = parser.value();
      if (value) finish(resolve, value);
    };
    const onStderr = chunk => append(chunk);
    const onError = error => finish(reject, new Error(`Workspace host failed to start: ${error.message}`));
    const onExit = (code, signal) => finish(reject, new Error([
      `Workspace host exited before startup completed (code ${code ?? 'none'}, signal ${signal ?? 'none'}).`,
      diagnostics.trim(),
    ].filter(Boolean).join('\n')));
    const timer = setTimeout(() => finish(reject, new Error(`Workspace host did not announce readiness within ${timeoutMs} ms.\n${diagnostics.trim()}`.trim())), timeoutMs);
    function finish(callback, value) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.stdout?.off('data', onStdout);
      child.stderr?.off('data', onStderr);
      child.off('error', onError);
      child.off('exit', onExit);
      callback(value);
    }
    child.stdout?.on('data', onStdout);
    child.stderr?.on('data', onStderr);
    child.on('error', onError);
    child.on('exit', onExit);
    if (child.exitCode !== null && child.exitCode !== undefined) onExit(child.exitCode, child.signalCode);
  });
}

function isAllowedNavigation(targetUrl, rendererOrigin) {
  try {
    return new URL(targetUrl).origin === new URL(rendererOrigin).origin;
  } catch {
    return false;
  }
}

module.exports = {
  DESKTOP_CHANNELS,
  HostAnnouncements,
  createWindowOptions,
  createWorkspaceUrl,
  resolveHostCommand,
  waitForHostAnnouncements,
  isAllowedNavigation,
};
