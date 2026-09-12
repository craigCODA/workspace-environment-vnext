const { createReadStream } = require('node:fs');
const { stat } = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');

const MIME_TYPES = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.map', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.wasm', 'application/wasm'],
  ['.webp', 'image/webp'],
]);

async function startStaticServer(rootDirectory, { hostPort }) {
  if (!Number.isSafeInteger(hostPort) || hostPort < 1 || hostPort > 65535) throw new TypeError('hostPort must be 1..65535.');
  const root = path.resolve(rootDirectory);
  const info = await stat(root);
  if (!info.isDirectory()) throw new Error(`Renderer root is not a directory: ${root}`);
  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    `connect-src 'self' http://127.0.0.1:${hostPort} ws://127.0.0.1:${hostPort}`,
    "worker-src 'self' blob:",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
  ].join('; ');

  const server = http.createServer((request, response) => {
    void handleRequest(root, csp, request, response).catch(() => {
      if (!response.headersSent) sendText(response, 500, 'Internal server error');
      else response.destroy();
    });
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    server.close();
    throw new Error('Renderer server did not bind to a loopback TCP address.');
  }
  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve());
      server.closeAllConnections?.();
    }),
  };
}

async function handleRequest(root, csp, request, response) {
  setSecurityHeaders(response, csp);
  let pathname;
  try {
    const rawPath = (request.url ?? '/').split('?', 1)[0];
    pathname = decodeURIComponent(rawPath);
  } catch {
    sendText(response, 400, 'Bad request');
    return;
  }
  if (pathname.includes('\0')) {
    sendText(response, 400, 'Bad request');
    return;
  }
  const relativePath = pathname.replace(/^\/+/, '') || 'workspace.html';
  const candidate = path.resolve(root, relativePath);
  if (!isWithin(root, candidate)) {
    sendText(response, 403, 'Forbidden');
    return;
  }
  if (!(await isFile(candidate))) {
    sendText(response, 404, 'Not found');
    return;
  }
  response.statusCode = 200;
  response.setHeader('Content-Type', MIME_TYPES.get(path.extname(candidate).toLowerCase()) ?? 'application/octet-stream');
  const stream = createReadStream(candidate);
  stream.on('error', () => {
    if (!response.headersSent) sendText(response, 500, 'Internal server error');
    else response.destroy();
  });
  stream.pipe(response);
}

function isWithin(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

async function isFile(candidate) {
  try { return (await stat(candidate)).isFile(); }
  catch (error) {
    if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') return false;
    throw error;
  }
}

function setSecurityHeaders(response, csp) {
  response.setHeader('Content-Security-Policy', csp);
  response.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('Cache-Control', 'no-store');
}

function sendText(response, statusCode, body) {
  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'text/plain; charset=utf-8');
  response.end(body);
}

module.exports = { startStaticServer };
