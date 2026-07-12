const http = require('http');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const projectConfig = require('../config');

const PORT = projectConfig.PORT || 3060;
const YTDLP_PATH = projectConfig.YTDLP_PATH || 'D:\\Videos\\yt-dlp\\yt-dlp.exe';
const DOWNLOAD_PATH = projectConfig.DOWNLOAD_PATH || 'D:\\Music';
const UI_HTML_PATH = path.join(__dirname, 'ui.html');
const ICON_128_PATH = path.join(__dirname, '..', 'extension', 'icons', 'icon_128.png');
const DEFAULT_YTDLP_PARAMS = {
  'sleep-requests': 1,
  'sleep-interval': 1,
  'max-sleep-interval': 3
};

function toYtDlpArgsFromObject(params = {}) {
  const args = [];

  Object.entries(params).forEach(([rawKey, rawValue]) => {
    if (rawValue === undefined || rawValue === null || rawValue === false) {
      return;
    }

    const key = String(rawKey).replace(/^--/, '');
    if (!key) {
      return;
    }

    args.push(`--${key}`);

    // For boolean true flags we only include the switch itself.
    if (rawValue !== true) {
      args.push(String(rawValue));
    }
  });

  return args;
}

function sanitizeName(s) {
  return (s || '')
    .toString()
    .trim()
    .replace(/[<>:\\"\/\\|\?\*\x00-\x1F]/g, '_')
    .replace(/\.+$/g, '') || 'unknown';
}

function parseBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return false;
  return value.toLowerCase() === 'true' || value === '1';
}

function resolveTargetDir({ authorRaw, nameRaw, isSingle }) {
  const hasAuthor = Boolean(authorRaw && String(authorRaw).trim());
  const author = hasAuthor ? sanitizeName(authorRaw) : 'unknown';
  const name = nameRaw ? sanitizeName(nameRaw) : 'unknown';

  // Singles are grouped under artist/Singles unless artist is unknown.
  if (isSingle && hasAuthor) {
    return { author, name, targetDir: path.join(DOWNLOAD_PATH, author, 'Singles') };
  }

  return { author, name, targetDir: path.join(DOWNLOAD_PATH, author, name) };
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400'
};

const server = http.createServer((req, res) => {
  // Always set CORS headers
  Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  if (req.method === 'GET' && req.url === '/') {
    fs.readFile(UI_HTML_PATH, 'utf8', (err, html) => {
      if (err) {
        console.warn('Failed to load server UI HTML', err);
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Failed to load UI');
        return;
      }

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    });
    return;
  }

  if (req.method === 'GET' && req.url === '/config') {
    // Expose minimal config for the extension to consume
    const cfg = {
      endpoint: `http://localhost:${PORT}/download`,
      checkEndpoint: `http://localhost:${PORT}/check`,
      openPathEndpoint: `http://localhost:${PORT}/open-path`,
      infoLink: projectConfig.INFO_LINK || 'https://github.com/Articles-Joey/ui-for-yt-dlp'
    };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(cfg));
    return;
  }

  if (req.method === 'GET' && req.url === '/icon_128.png') {
    fs.readFile(ICON_128_PATH, (err, iconBuffer) => {
      if (err) {
        console.warn('Failed to load icon file', err);
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Icon not found');
        return;
      }

      res.writeHead(200, {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=86400'
      });
      res.end(iconBuffer);
    });
    return;
  }

  if (req.method === 'GET' && req.url.startsWith('/check')) {
    try {
      const parsed = new URL(req.url, `http://localhost:${PORT}`);
      const isSingle = parseBoolean(parsed.searchParams.get('isSingle'));
      const { author, name, targetDir } = resolveTargetDir({
        authorRaw: parsed.searchParams.get('author'),
        nameRaw: parsed.searchParams.get('name'),
        isSingle
      });
      const exists = fs.existsSync(targetDir);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', exists, path: targetDir, author, name, isSingle }));
    } catch (err) {
      console.warn('Failed to check existing path', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'error', error: String(err) }));
    }
    return;
  }

  if (req.method === 'GET' && req.url.startsWith('/open-path')) {
    try {
      const parsed = new URL(req.url, `http://localhost:${PORT}`);
      const isSingle = parseBoolean(parsed.searchParams.get('isSingle'));
      const { author, name, targetDir } = resolveTargetDir({
        authorRaw: parsed.searchParams.get('author'),
        nameRaw: parsed.searchParams.get('name'),
        isSingle
      });
      const exists = fs.existsSync(targetDir);

      if (!exists) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'error', error: 'Path does not exist', path: targetDir }));
        return;
      }

      if (process.platform === 'win32') {
        const child = spawn('explorer.exe', [targetDir], { detached: true, stdio: 'ignore' });
        child.unref();
      } else if (process.platform === 'darwin') {
        const child = spawn('open', [targetDir], { detached: true, stdio: 'ignore' });
        child.unref();
      } else {
        const child = spawn('xdg-open', [targetDir], { detached: true, stdio: 'ignore' });
        child.unref();
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', opened: true, path: targetDir, author, name, isSingle }));
    } catch (err) {
      console.warn('Failed to open path', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'error', error: String(err) }));
    }
    return;
  }

  if (req.method === 'POST' && req.url === '/download') {
    let body = '';
    req.on('data', chunk => (body += chunk));
    req.on('end', () => {
      (async () => {
        try {
          const data = body ? JSON.parse(body) : {};
          console.log('[download] received:', data);

          const authorRaw = data.author || null;
          const url = data.url || '';
          const nameRaw = data.name || null;
          const isSingle = Boolean(data.isSingle);
          const { author, name, targetDir } = resolveTargetDir({ authorRaw, nameRaw, isSingle });

          // Construct target directory and ensure it exists
          await fs.promises.mkdir(targetDir, { recursive: true });

          // Build yt-dlp args safely (avoid shell interpolation)
          const mergedParams = Object.assign({}, DEFAULT_YTDLP_PARAMS, projectConfig.YTDLP_PARAMS || {}, data.params || {});
          const extraArgs = toYtDlpArgsFromObject(mergedParams);
          const args = ['-P', targetDir, ...extraArgs, url];

          console.log('[download] spawning:', YTDLP_PATH, args);

          let childInfo = { forwarded: false };

          if (process.platform === 'win32') {
            // Use cmd.exe start to open a new terminal window per request so output is visible and non-blocking
            // 'start' treats the first quoted string as window title, so pass an empty title "".
            const startArgs = ['/c', 'start', '""', YTDLP_PATH, ...args];
            const child = spawn('cmd.exe', startArgs, { detached: true, stdio: 'ignore' });
            child.unref();
            childInfo = { forwarded: true, terminal: 'windows', pid: child.pid };
          } else {
            // Fallback: spawn detached and inherit stdio (may forward to server terminal)
            const child = spawn(YTDLP_PATH, args, { detached: true, stdio: 'inherit' });
            child.unref();
            childInfo = { forwarded: true, terminal: 'same', pid: child.pid };
          }

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(Object.assign({ status: 'ok', cmd: `${YTDLP_PATH} ${args.map(v => JSON.stringify(v)).join(' ')}` }, childInfo)));
        } catch (err) {
          console.warn('Failed to handle download', err);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'error', error: String(err) }));
        }
      })();
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found');
});

server.listen(PORT, () => console.log(`Server listening on http://localhost:${PORT}`));
