(() => {
  const BUTTON_ROW_ID = 'ytm-button-row';
  const BUTTON_ID = 'ytm-placeholder-button';
  let ENDPOINT = 'http://localhost:3060/download';
  const INFO_BUTTON_ID = 'ytm-info-button';
  let INFO_LINK = 'https://github.com/Articles-Joey/ui-for-yt-dlp';

  function isYouTubeMusic() {
    return location.hostname === 'music.youtube.com';
  }

  function isYouTube() {
    return location.hostname === 'www.youtube.com' || location.hostname === 'youtube.com';
  }

  // Fetch runtime config from local server to centralize editable values
  (async function fetchConfig() {
    try {
      const resp = await fetch('http://localhost:3060/config');
      if (!resp.ok) return;
      const cfg = await resp.json();
      if (cfg.endpoint) ENDPOINT = cfg.endpoint;
      if (cfg.infoLink) INFO_LINK = cfg.infoLink;
    } catch (e) {
      console.warn('Could not fetch config from server', e);
    }
  })();

  function createButtonRow() {
    const wrap = document.createElement('div');
    wrap.id = BUTTON_ROW_ID;
    wrap.style.display = 'flex';
    wrap.style.gap = '8px';
    wrap.style.marginTop = '16px';
    wrap.style.marginBottom = '16px';

    const btn = document.createElement('button');
    btn.id = BUTTON_ID;
    btn.textContent = '💾 Download (yt-dlp)';
    btn.style.flex = '1 1 auto';
    btn.style.minWidth = '0';
    btn.style.boxSizing = 'border-box';
    btn.style.padding = '10px 12px';
    btn.style.fontSize = '14px';
    btn.style.cursor = 'pointer';

    const info = document.createElement('button');
    info.id = INFO_BUTTON_ID;
    info.textContent = '🛈';
    info.title = 'Info';
    info.style.flex = '0 0 40px';
    info.style.width = '40px';
    info.style.boxSizing = 'border-box';
    info.style.padding = '8px';
    info.style.fontSize = '14px';
    info.style.cursor = 'pointer';

    wrap.appendChild(btn);
    wrap.appendChild(info);
    return wrap;
  }

  function gatherData() {
    const authorEl = document.querySelector('.strapline-text a');
    const author = authorEl ? (authorEl.textContent || '').trim() || null : null;
    const url = location.href;
    const nameEl = document.querySelector('h1 .title') || document.querySelector('h1.title') || document.querySelector('h1');
    const name = nameEl ? (nameEl.textContent || '').trim() : null;
    return { author, url, name };
  }

  async function sendDownload(payload) {
    try {
      const resp = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!resp.ok) throw new Error('Non-OK response: ' + resp.status);
      return resp.json().catch(() => null);
    } catch (err) {
      console.error('Failed to send download request', err);
      throw err;
    }
  }

  function attachClickHandler(btn) {
    if (!btn || btn.dataset.handlerAttached) return;
    btn.dataset.handlerAttached = '1';
    btn.addEventListener('click', async () => {
      try {
        btn.disabled = true;
        const original = btn.textContent;
        btn.textContent = 'Sending...';
        const payload = gatherData();
        await sendDownload(payload);
        btn.textContent = 'Sent';
        setTimeout(() => (btn.textContent = original), 1500);
      } catch (e) {
        btn.textContent = 'Error';
        setTimeout(() => (btn.textContent = 'Error'), 2000);
      } finally {
        btn.disabled = false;
      }
    });
  }

  function insertAfterActionButtons() {
    const container = document.getElementById('action-buttons');
    if (!container) return false;
    let btn = document.getElementById(BUTTON_ID);
    if (!btn) {
      const row = createButtonRow();
      if (container.parentNode) container.parentNode.insertBefore(row, container.nextSibling);
      else return false;
      btn = document.getElementById(BUTTON_ID);
    }
    attachClickHandler(btn);
    const info = document.getElementById(INFO_BUTTON_ID);
    if (info && !info.dataset.handlerAttached) {
      info.dataset.handlerAttached = '1';
      info.addEventListener('click', () => window.open(INFO_LINK, '_blank'));
    }
    return true;
  }

  function insertAfterTitle() {
    const container = document.getElementById('description-inner');
    if (!container) return false;

    let btn = document.getElementById(BUTTON_ID);
    if (!btn) {
      const row = createButtonRow();
      container.insertBefore(row, container.firstChild);
      btn = document.getElementById(BUTTON_ID);
    }

    attachClickHandler(btn);
    const info = document.getElementById(INFO_BUTTON_ID);
    if (info && !info.dataset.handlerAttached) {
      info.dataset.handlerAttached = '1';
      info.addEventListener('click', () => window.open(INFO_LINK, '_blank'));
    }
    return true;
  }

  function insertButtons() {
    if (isYouTubeMusic()) return insertAfterActionButtons();
    if (isYouTube()) return insertAfterTitle();
    return false;
  }

  function handleManualInjectRequest() {
    if (insertButtons()) return true;

    // YouTube watch pages often render late in SPA navigation.
    if (isYouTube()) {
      startYouTubeInfoPolling();
      return true;
    }

    return false;
  }

  function hasYouTubeInfoElement() {
    return Boolean(document.getElementById('description-inner'));
  }

  let lastUrl = location.href;
  let insertTimer = null;
  let youtubePollTimer = null;

  function stopYouTubeInfoPolling() {
    if (!youtubePollTimer) return;
    clearInterval(youtubePollTimer);
    youtubePollTimer = null;
  }

  function startYouTubeInfoPolling() {
    stopYouTubeInfoPolling();
    const urlAtStart = location.href;

    youtubePollTimer = setInterval(() => {

      console.log('Polling for YouTube info element...');

      if (location.href !== urlAtStart || !isYouTube()) {
        console.log('URL changed or not YouTube, stopping polling.');
        stopYouTubeInfoPolling();
        return;
      }

      if (!hasYouTubeInfoElement()) {
        console.log('YouTube info element not found, continuing to poll...');
        return;
      };

      if (insertAfterTitle()) {
        console.log('YouTube info element found, stopping polling.');
        stopYouTubeInfoPolling();
      }

    }, 1000);
  }

  function queueInsertAfterUrlChange() {
    if (insertTimer) clearTimeout(insertTimer);
    stopYouTubeInfoPolling();

    if (isYouTube()) {

      setTimeout(() => {
        // if (location.href !== lastUrl) return;
        startYouTubeInfoPolling();
      }, 5000);

      return;
    }

    const urlAtSchedule = location.href;
    insertTimer = setTimeout(() => {
      if (location.href !== urlAtSchedule) return;
      insertButtons();
    }, 2000);
  }

  function handleLocationChange() {
    if (location.href === lastUrl) return;
    console.log('Location changed:', location.href);
    lastUrl = location.href;
    queueInsertAfterUrlChange();
  }

  const originalPushState = history.pushState;
  history.pushState = function (...args) {
    const result = originalPushState.apply(this, args);
    window.dispatchEvent(new Event('ytm:locationchange'));
    return result;
  };

  const originalReplaceState = history.replaceState;
  history.replaceState = function (...args) {
    const result = originalReplaceState.apply(this, args);
    window.dispatchEvent(new Event('ytm:locationchange'));
    return result;
  };

  window.addEventListener('popstate', () => window.dispatchEvent(new Event('ytm:locationchange')));
  window.addEventListener('hashchange', () => window.dispatchEvent(new Event('ytm:locationchange')));
  window.addEventListener('ytm:locationchange', handleLocationChange);

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || message.type !== 'ytm:inject-buttons') return;
    const queued = handleManualInjectRequest();
    sendResponse({ ok: queued });
  });

  // Run once for the initially loaded URL.
  if (!isYouTube()) {
    queueInsertAfterUrlChange();
  }

  if (isYouTube()) {
    setTimeout(() => {
      queueInsertAfterUrlChange();
    }, 1000);
  }
  
})();
