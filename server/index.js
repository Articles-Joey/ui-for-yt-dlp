const http = require('http');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const projectConfig = require('../config');

const PORT = projectConfig.PORT || 3060;
const YTDLP_PATH = projectConfig.YTDLP_PATH || 'D:\\Videos\\yt-dlp\\yt-dlp.exe';
const DOWNLOAD_PATH = projectConfig.DOWNLOAD_PATH || 'D:\\Music';
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

  if (req.method === 'GET' && req.url.startsWith('/check')) {
    try {
      const parsed = new URL(req.url, `http://localhost:${PORT}`);
      const author = sanitizeName(parsed.searchParams.get('author'));
      const name = sanitizeName(parsed.searchParams.get('name'));
      const targetDir = path.join(DOWNLOAD_PATH, author, name);
      const exists = fs.existsSync(targetDir);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', exists, path: targetDir, author, name }));
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
      const author = sanitizeName(parsed.searchParams.get('author'));
      const name = sanitizeName(parsed.searchParams.get('name'));
      const targetDir = path.join(DOWNLOAD_PATH, author, name);
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
      res.end(JSON.stringify({ status: 'ok', opened: true, path: targetDir, author, name }));
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
          const author = authorRaw ? sanitizeName(authorRaw) : 'unknown';
          const name = nameRaw ? sanitizeName(nameRaw) : 'unknown';

          // Construct target directory and ensure it exists
          const targetDir = path.join(DOWNLOAD_PATH, author, name);
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
