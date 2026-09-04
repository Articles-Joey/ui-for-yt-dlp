const http = require('http');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const projectConfig = require('../config');

const PORT = projectConfig.PORT || 3060;
const YTDLP_PATH = projectConfig.YTDLP_PATH || 'D:\\Videos\\yt-dlp\\yt-dlp.exe';
const DOWNLOAD_PATH = projectConfig.DOWNLOAD_PATH || 'D:\\Music';
const UI_HTML_PATH = path.join(__dirname, 'ui.html');
const ICON_128_PATH = path.join(__dirname, '..', 'extension', 'icons', 'icon_128.png');
const DOWNLOAD_LOG_PATH = path.join(__dirname, '..', 'ui-for-yt-dlp.log');
const DOWNLOAD_EVENT_MARKER = '__UI_FOR_YTDLP_DOWNLOAD_EVENT__';
const DOWNLOAD_EVENT_FIELDS = [
  '%(webpage_url|)j',
  '%(title|)j',
  '%(playlist_title|)j',
  '%(playlist|)j',
  '%(album|)j',
  '%(id|)j',
  '%(filepath|)j',
  '%(playlist_index|)j',
  '%(playlist_count|)j',
  '%(n_entries|)j'
];
const DEFAULT_YTDLP_PARAMS = {
  'sleep-requests': 1,
  'sleep-interval': 1,
  'max-sleep-interval': 3
};

let downloadLogQueue = Promise.resolve();

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

function firstNonEmpty(...values) {
  return values.find(value => value !== undefined && value !== null && String(value).trim()) || null;
}

function appendDownloadLog(entry) {
  const line = `${JSON.stringify(entry)}${os.EOL}`;

  // Serialize writes so simultaneous album/playlist requests cannot interleave
  // JSON lines in the log file.
  downloadLogQueue = downloadLogQueue
    .then(() => fs.promises.appendFile(DOWNLOAD_LOG_PATH, line, 'utf8'))
    .catch(err => {
      console.warn('Failed to write download log', err);
    });

  return downloadLogQueue;
}

function isCollectionUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    return parsed.pathname === '/playlist' || parsed.pathname.startsWith('/browse/');
  } catch (err) {
    return false;
  }
}

function getFallbackPlaylist({ url, data, nameRaw, albumRaw, albumOverrideRaw }) {
  const explicitPlaylist = firstNonEmpty(data.playlist, data.playlistTitle);
  if (explicitPlaylist) return String(explicitPlaylist).trim();

  // The extension already sends album metadata for list-item downloads. This
  // also covers album/playlist page requests without requiring frontend changes.
  if (isCollectionUrl(url) || albumRaw || albumOverrideRaw) {
    const album = firstNonEmpty(albumOverrideRaw, albumRaw, isCollectionUrl(url) ? nameRaw : null);
    return album ? String(album).trim() : null;
  }

  return null;
}

function getDownloadMonitoringArgs() {
  const fields = DOWNLOAD_EVENT_FIELDS.join('\t');

  return [
    // --print can imply simulation in some combinations of options. Explicitly
    // disable it so monitoring never changes whether a file is downloaded.
    '--no-simulate',
    '--print',
    `before_dl:${DOWNLOAD_EVENT_MARKER}\tbefore\t${fields}`,
    '--print',
    `after_move:${DOWNLOAD_EVENT_MARKER}\tafter\t${fields}`
  ];
}

function parseYtDlpEventLine(line) {
  const markerIndex = line.indexOf(DOWNLOAD_EVENT_MARKER);
  if (markerIndex === -1) return null;

  const parts = line.slice(markerIndex).trim().split('\t');
  if (parts[0] !== DOWNLOAD_EVENT_MARKER || !parts[1]) return null;

  const values = parts.slice(2).map(value => {
    if (!value || value === 'NA') return null;

    try {
      return JSON.parse(value);
    } catch (err) {
      // Keep the event useful if a future yt-dlp output conversion changes.
      return value;
    }
  });

  return {
    type: parts[1],
    url: values[0] || null,
    title: values[1] || null,
    playlistTitle: values[2] || null,
    playlist: values[3] || null,
    album: values[4] || null,
    id: values[5] || null,
    filePath: values[6] || null,
    playlistIndex: values[7] || null,
    playlistCount: values[8] || null,
    entryCount: values[9] || null
  };
}

function createDownloadTracker({ requestUrl, requestData, album, fallbackPlaylist }) {
  const pendingItems = [];
  const completedKeys = new Set();
  let completedCount = 0;
  let latestError = null;
  let finished = false;
  let sawEvent = false;
  let stdoutRemainder = '';
  let finishedItemCount = 0;
  let collectionTotal = null;

  function eventKey(item) {
    return firstNonEmpty(item.url, item.id, item.title);
  }

  function getPlaylist(item) {
    const playlist = firstNonEmpty(item.playlistTitle, item.playlist, fallbackPlaylist);
    return playlist ? String(playlist).trim() : null;
  }

  function positiveInteger(value) {
    const number = Number.parseInt(value, 10);
    return Number.isInteger(number) && number > 0 ? number : null;
  }

  function updateCollectionTotal(item) {
    const total = positiveInteger(firstNonEmpty(item.playlistCount, item.entryCount));
    if (total) collectionTotal = total;
    return total || collectionTotal;
  }

  function logItemProgress(status, item) {
    const title = firstNonEmpty(item.title, requestData.name, item.url) || 'unknown song';
    const total = updateCollectionTotal(item);
    const playlist = getPlaylist(item);
    const action = status === 'downloaded' ? 'Finished' : 'Failed';
    const log = status === 'downloaded' ? console.log : console.warn;

    if (total) {
      log(`[download] ${action} song ${finishedItemCount} of ${total}${playlist ? ` (${playlist})` : ''}: ${title}`);
    } else if (playlist) {
      log(`[download] ${action} song ${finishedItemCount} (${playlist}; album total unavailable): ${title}`);
    } else {
      log(`[download] ${action} song ${finishedItemCount}: ${title}`);
    }
  }

  function record(status, item, details = {}) {
    const isDownloaded = status === 'downloaded';
    const statusCode = isDownloaded
      ? 0
      : Number.isInteger(details.processExitCode) && details.processExitCode > 0
        ? details.processExitCode
        : 1;

    const entry = {
      datetime: new Date().toISOString(),
      url: firstNonEmpty(item.url, requestUrl),
      status,
      statusCode,
      playlist: getPlaylist(item),
      album: firstNonEmpty(item.album, album),
      title: firstNonEmpty(item.title, requestData.name),
      file: item.filePath || null
    };

    if (details.processExitCode !== undefined) {
      entry.processExitCode = details.processExitCode;
    }
    if (details.signal) {
      entry.signal = details.signal;
    }
    if (details.error) {
      entry.error = details.error;
    }

    appendDownloadLog(entry);
  }

  function findPendingItem(event) {
    return pendingItems.find(item => {
      if (item.completed) return false;
      if (event.url && item.url === event.url) return true;
      if (event.id && item.id === event.id) return true;
      return Boolean(event.title && item.title && event.title === item.title);
    });
  }

  function handleEvent(event) {
    if (!event) return false;
    sawEvent = true;

    if (event.type === 'before') {
      pendingItems.push(Object.assign({ completed: false }, event));
      return true;
    }

    if (event.type !== 'after') return true;

    const pendingItem = findPendingItem(event);
    const key = eventKey(event);
    if (!pendingItem && key && completedKeys.has(key)) {
      // Some yt-dlp options can emit more than one after_move notification for
      // the same item. Log one result per downloaded item rather than duplicates.
      return true;
    }

    const item = pendingItem ? Object.assign({}, pendingItem, event) : event;
    if (pendingItem) pendingItem.completed = true;
    if (key) completedKeys.add(key);
    completedCount += 1;
    finishedItemCount += 1;
    record('downloaded', item);
    logItemProgress('downloaded', item);
    return true;
  }

  function handleStdout(chunk) {
    const text = stdoutRemainder + chunk.toString('utf8');
    const lines = text.split(/\r?\n/);
    stdoutRemainder = lines.pop() || '';
    lines.forEach(line => {
      if (line) handleEvent(parseYtDlpEventLine(line));
    });
  }

  function flushStdout() {
    if (!stdoutRemainder) return;
    handleEvent(parseYtDlpEventLine(stdoutRemainder));
    stdoutRemainder = '';
  }

  function handleStderr(chunk) {
    const text = chunk.toString('utf8');
    const errorLines = text
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(line => /\bERROR\b/i.test(line));

    if (errorLines.length) {
      latestError = errorLines[errorLines.length - 1].slice(0, 500);
    }
  }

  function finish(processExitCode, signal) {
    if (finished) return;
    flushStdout();
    finished = true;

    const failureDetails = {
      processExitCode,
      signal,
      error: latestError
    };

    pendingItems
      .filter(item => !item.completed)
      .forEach(item => {
        finishedItemCount += 1;
        record('failed', item, failureDetails);
        logItemProgress('failed', item);
      });

    if (!sawEvent || (pendingItems.length === 0 && completedCount === 0)) {
      record(
        'failed',
        {
          url: requestUrl,
          title: requestData.name,
          playlistTitle: fallbackPlaylist,
          album
        },
        failureDetails
      );
      finishedItemCount += 1;
      logItemProgress('failed', {
        url: requestUrl,
        title: requestData.name,
        playlistCount: collectionTotal,
        playlistTitle: fallbackPlaylist,
        album
      });
    }
  }

  function fail(error) {
    latestError = error && error.message ? error.message.slice(0, 500) : String(error);
  }

  return { handleEvent, handleStdout, handleStderr, finish, fail };
}

function normalizeSavePath(value) {
  const savePath = firstNonEmpty(value);
  if (!savePath) return null;

  const normalizedPath = String(savePath).trim();
  if (normalizedPath.includes('\u0000')) {
    throw new Error('Save path cannot contain null characters');
  }

  return path.resolve(normalizedPath);
}

function resolveTargetDir({
  authorRaw,
  authorOverrideRaw,
  nameRaw,
  titleOverrideRaw,
  albumRaw,
  albumOverrideRaw,
  savePathOverrideRaw,
  isSingle
}) {
  const effectiveAuthor = firstNonEmpty(authorOverrideRaw, authorRaw);
  const effectiveName = firstNonEmpty(titleOverrideRaw, nameRaw);
  const effectiveAlbum = firstNonEmpty(albumOverrideRaw, albumRaw);
  const author = effectiveAuthor ? sanitizeName(effectiveAuthor) : 'unknown';
  const name = effectiveName ? sanitizeName(effectiveName) : 'unknown';
  const album = effectiveAlbum ? sanitizeName(effectiveAlbum) : name;
  const titleOverride = firstNonEmpty(titleOverrideRaw) ? name : null;
  const savePathOverride = normalizeSavePath(savePathOverrideRaw);

  if (savePathOverride) {
    return { author, name, album, titleOverride, targetDir: savePathOverride, savePathOverride };
  }

  // Singles are always grouped under artist/Singles.
  if (isSingle) {
    return {
      author,
      name,
      album,
      titleOverride,
      targetDir: path.join(DOWNLOAD_PATH, author, 'Singles'),
      savePathOverride: null
    };
  }

  return {
    author,
    name,
    album,
    titleOverride,
    targetDir: path.join(DOWNLOAD_PATH, author, album),
    savePathOverride: null
  };
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

  if (req.method === 'POST' && req.url.startsWith('/location')) {
    console.log('Received POST request to /location');
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => {
      console.log('Request body:', body);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
    });
    return;
  }

  if (req.method === 'GET' && req.url.startsWith('/check')) {
    try {
      const parsed = new URL(req.url, `http://localhost:${PORT}`);
      const isSingle = parseBoolean(parsed.searchParams.get('isSingle'));
      const { author, name, album, targetDir, savePathOverride } = resolveTargetDir({
        authorRaw: parsed.searchParams.get('author'),
        authorOverrideRaw: parsed.searchParams.get('authorOverride'),
        nameRaw: parsed.searchParams.get('name'),
        titleOverrideRaw: parsed.searchParams.get('titleOverride'),
        albumRaw: parsed.searchParams.get('album'),
        albumOverrideRaw: parsed.searchParams.get('albumOverride'),
        savePathOverrideRaw: parsed.searchParams.get('savePathOverride'),
        isSingle
      });
      const exists = fs.existsSync(targetDir);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', exists, path: targetDir, author, name, album, isSingle, savePathOverride }));
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
      const { author, name, album, targetDir, savePathOverride } = resolveTargetDir({
        authorRaw: parsed.searchParams.get('author'),
        authorOverrideRaw: parsed.searchParams.get('authorOverride'),
        nameRaw: parsed.searchParams.get('name'),
        titleOverrideRaw: parsed.searchParams.get('titleOverride'),
        albumRaw: parsed.searchParams.get('album'),
        albumOverrideRaw: parsed.searchParams.get('albumOverride'),
        savePathOverrideRaw: parsed.searchParams.get('savePathOverride'),
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
      res.end(JSON.stringify({ status: 'ok', opened: true, path: targetDir, author, name, album, isSingle, savePathOverride }));
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
        let downloadTracker = null;

        try {
          const data = body ? JSON.parse(body) : {};
          console.log('[download] received:', data);

          const authorRaw = data.author || data.artist || null;
          const authorOverrideRaw = data.authorOverride || data.artistOverride || null;
          const url = data.url || '';
          const nameRaw = data.name || null;
          const titleOverrideRaw = data.titleOverride || data.nameOverride || null;
          const albumRaw = data.album || null;
          const albumOverrideRaw = data.albumOverride || null;
          const savePathOverrideRaw = data.savePathOverride || null;
          const isSingle = parseBoolean(data.isSingle);
          const { author, name, album, titleOverride, targetDir, savePathOverride } = resolveTargetDir({
            authorRaw,
            authorOverrideRaw,
            nameRaw,
            titleOverrideRaw,
            albumRaw,
            albumOverrideRaw,
            savePathOverrideRaw,
            isSingle
          });
          const fallbackPlaylist = getFallbackPlaylist({
            url,
            data,
            nameRaw,
            albumRaw,
            albumOverrideRaw
          });

          downloadTracker = createDownloadTracker({
            requestUrl: url,
            requestData: data,
            album: firstNonEmpty(albumOverrideRaw, albumRaw),
            fallbackPlaylist
          });

          // Construct target directory and ensure it exists
          await fs.promises.mkdir(targetDir, { recursive: true });

          // Build yt-dlp args safely (avoid shell interpolation)
          const mergedParams = Object.assign({}, DEFAULT_YTDLP_PARAMS, projectConfig.YTDLP_PARAMS || {}, data.params || {});
          const extraArgs = toYtDlpArgsFromObject(mergedParams);
          const outputTemplate = titleOverride
            ? path.join(targetDir, `${titleOverride.replace(/%/g, '%%')}.%(ext)s`)
            : null;
          const outputArgs = outputTemplate ? ['--output', outputTemplate] : [];
          const monitoringArgs = getDownloadMonitoringArgs();
          const args = ['-P', targetDir, ...extraArgs, ...outputArgs, ...monitoringArgs, url];

          console.log('[download] spawning:', YTDLP_PATH, args);

          // Keep stdout/stderr attached to the backend so yt-dlp's structured
          // before_dl/after_move events can be used to log each item.
          const child = spawn(YTDLP_PATH, args, {
            detached: true,
            stdio: ['ignore', 'pipe', 'pipe']
          });
          child.stdout.on('data', chunk => downloadTracker.handleStdout(chunk));
          child.stderr.on('data', chunk => {
            downloadTracker.handleStderr(chunk);
            process.stderr.write(chunk);
          });
          child.on('error', err => {
            downloadTracker.fail(err);
            downloadTracker.finish(null, null);
            console.warn('yt-dlp process error', err);
          });
          child.on('close', (code, signal) => {
            downloadTracker.finish(code, signal);
          });
          child.unref();

          const childInfo = { forwarded: true, terminal: 'backend', pid: child.pid };

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(Object.assign({
            status: 'ok',
            author,
            name,
            album,
            isSingle,
            titleOverride,
            savePathOverride,
            targetDir,
            outputTemplate,
            cmd: `${YTDLP_PATH} ${args.map(v => JSON.stringify(v)).join(' ')}`
          }, childInfo)));
        } catch (err) {
          if (downloadTracker) {
            downloadTracker.fail(err);
            downloadTracker.finish(null, null);
          }
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
