(() => {
  const BUTTON_ROW_ID = 'ytm-button-row';
  const BUTTON_ID = 'ytm-placeholder-button';
  let ENDPOINT = 'http://localhost:3060/download';
  let CHECK_ENDPOINT = 'http://localhost:3060/check';
  let OPEN_PATH_ENDPOINT = 'http://localhost:3060/open-path';
  const MORE_BUTTON_ID = 'ytm-more-button';
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
      if (cfg.checkEndpoint) CHECK_ENDPOINT = cfg.checkEndpoint;
      if (cfg.openPathEndpoint) OPEN_PATH_ENDPOINT = cfg.openPathEndpoint;
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

    const downloadBtn = document.createElement('button');
    downloadBtn.id = BUTTON_ID;
    downloadBtn.textContent = '💾 Download (yt-dlp)';
    downloadBtn.style.flex = '1 1 auto';
    downloadBtn.style.minWidth = '0';
    downloadBtn.style.boxSizing = 'border-box';
    downloadBtn.style.padding = '10px 12px';
    downloadBtn.style.fontSize = '14px';
    downloadBtn.style.cursor = 'pointer';

    const moreBtn = document.createElement('button');
    moreBtn.id = MORE_BUTTON_ID;
    moreBtn.textContent = '⚙️';
    moreBtn.title = 'Advanced download options';
    moreBtn.style.flex = '0 0 48px';
    moreBtn.style.width = '48px';
    moreBtn.style.boxSizing = 'border-box';
    moreBtn.style.padding = '8px';
    moreBtn.style.fontSize = '14px';
    moreBtn.style.cursor = 'pointer';

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

    wrap.appendChild(downloadBtn);
    wrap.appendChild(moreBtn);
    wrap.appendChild(info);
    return wrap;
  }

  function gatherData() {
    let authorEl = null;
    if (isYouTube()) {
      authorEl = document.querySelector('#top-row #owner #upload-info #text-container a');
    } else if (isYouTubeMusic()) {
      authorEl = document.querySelector('.strapline-text a');
    }

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

  async function checkExistingPath(payload) {
    const params = new URLSearchParams();
    params.set('author', payload.author || 'unknown');
    params.set('name', payload.name || 'unknown');

    const resp = await fetch(`${CHECK_ENDPOINT}?${params.toString()}`);
    if (!resp.ok) throw new Error('Non-OK response: ' + resp.status);
    return resp.json();
  }

  async function openExistingPath(payload) {
    const params = new URLSearchParams();
    params.set('author', payload.author || 'unknown');
    params.set('name', payload.name || 'unknown');

    const resp = await fetch(`${OPEN_PATH_ENDPOINT}?${params.toString()}`);
    if (!resp.ok) throw new Error('Non-OK response: ' + resp.status);
    return resp.json();
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

  function attachMoreClickHandler(btn) {
    if (!btn || btn.dataset.handlerAttached) return;
    btn.dataset.handlerAttached = '1';

    btn.addEventListener('click', async () => {
      const original = btn.textContent;
      const result = await showMoreOptionsModal();
      if (!result || result.action === 'cancel') {
        return;
      }

      let params = null;
      if (result.action === 'quick-mp3') {
        params = { 'extract-audio': true, 'audio-format': 'mp3' };
      }

      if (result.action === 'custom') {
        const trimmedParams = (result.customParamsText || '').trim();
        if (trimmedParams) {
          try {
            const parsed = JSON.parse(trimmedParams);
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
              throw new Error('Params must be a JSON object');
            }
            params = parsed;
          } catch (err) {
            console.warn('Invalid advanced params JSON', err);
            btn.textContent = 'Bad JSON';
            setTimeout(() => (btn.textContent = original), 1800);
            return;
          }
        }
      }

      try {
        btn.disabled = true;
        btn.textContent = 'Sending...';

        const payload = gatherData();
        if (params) payload.params = params;

        await sendDownload(payload);
        btn.textContent = 'Sent';
        setTimeout(() => (btn.textContent = original), 1500);
      } catch (err) {
        console.error('Failed advanced download request', err);
        btn.textContent = 'Error';
        setTimeout(() => (btn.textContent = original), 1800);
      } finally {
        btn.disabled = false;
      }
    });
  }

  function showMoreOptionsModal() {
    return new Promise(resolve => {
      const overlay = document.createElement('div');
      overlay.style.position = 'fixed';
      overlay.style.inset = '0';
      overlay.style.background = 'rgba(0, 0, 0, 0.45)';
      overlay.style.zIndex = '2147483647';
      overlay.style.display = 'flex';
      overlay.style.alignItems = 'center';
      overlay.style.justifyContent = 'center';
      overlay.style.padding = '16px';

      const modal = document.createElement('div');
      modal.style.width = '100%';
      modal.style.maxWidth = '520px';
      modal.style.background = '#1f1f1f';
      modal.style.color = '#fff';
      modal.style.border = '1px solid #3f3f3f';
      modal.style.borderRadius = '10px';
      modal.style.padding = '14px';
      modal.style.boxSizing = 'border-box';
      modal.style.fontFamily = 'Arial, sans-serif';

      const title = document.createElement('div');
      title.textContent = 'Advanced Download Options';
      title.style.fontSize = '16px';
      title.style.fontWeight = '600';
      title.style.marginBottom = '10px';

      const quickActionsLabel = document.createElement('div');
      quickActionsLabel.textContent = 'Quick Actions';
      quickActionsLabel.style.fontSize = '13px';
      quickActionsLabel.style.fontWeight = '600';
      quickActionsLabel.style.marginBottom = '6px';

      const quickActionsWrap = document.createElement('div');
      quickActionsWrap.style.marginBottom = '12px';

      const mp3QuickAction = document.createElement('button');
      mp3QuickAction.type = 'button';
      mp3QuickAction.textContent = 'Extract audio as MP3';
      mp3QuickAction.style.padding = '8px 10px';
      mp3QuickAction.style.cursor = 'pointer';

      const checkExistingQuickAction = document.createElement('button');
      checkExistingQuickAction.type = 'button';
      checkExistingQuickAction.textContent = 'Check Existing';
      checkExistingQuickAction.style.padding = '8px 10px';
      checkExistingQuickAction.style.cursor = 'pointer';
      checkExistingQuickAction.style.marginLeft = '8px';

      const quickActionStatus = document.createElement('div');
      quickActionStatus.style.marginTop = '8px';
      quickActionStatus.style.fontSize = '12px';
      quickActionStatus.style.opacity = '0.9';

      const customLabel = document.createElement('div');
      customLabel.textContent = 'Custom Params (JSON object)';
      customLabel.style.fontSize = '13px';
      customLabel.style.fontWeight = '600';
      customLabel.style.marginBottom = '6px';

      const customInput = document.createElement('textarea');
      customInput.placeholder = '{"format":"bestaudio","extract-audio":true}';
      customInput.style.width = '100%';
      customInput.style.minHeight = '110px';
      customInput.style.resize = 'vertical';
      customInput.style.boxSizing = 'border-box';
      customInput.style.marginBottom = '12px';
      customInput.style.padding = '8px';

      const actions = document.createElement('div');
      actions.style.display = 'flex';
      actions.style.justifyContent = 'flex-end';
      actions.style.gap = '8px';

      const cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.textContent = 'Cancel';
      cancelBtn.style.padding = '8px 12px';
      cancelBtn.style.cursor = 'pointer';

      const sendBtn = document.createElement('button');
      sendBtn.type = 'button';
      sendBtn.textContent = 'Send';
      sendBtn.style.padding = '8px 12px';
      sendBtn.style.cursor = 'pointer';

      let settled = false;
      const close = result => {
        if (settled) return;
        settled = true;
        document.removeEventListener('keydown', onKeyDown);
        overlay.remove();
        resolve(result);
      };

      const onKeyDown = event => {
        if (event.key === 'Escape') {
          close({ action: 'cancel' });
        }
      };

      overlay.addEventListener('click', event => {
        if (event.target === overlay) {
          close({ action: 'cancel' });
        }
      });

      cancelBtn.addEventListener('click', () => close({ action: 'cancel' }));
      sendBtn.addEventListener('click', () => close({ action: 'custom', customParamsText: customInput.value }));
      mp3QuickAction.addEventListener('click', () => close({ action: 'quick-mp3' }));
      checkExistingQuickAction.addEventListener('click', async () => {
        const originalText = checkExistingQuickAction.textContent;
        quickActionStatus.textContent = '';
        checkExistingQuickAction.disabled = true;
        checkExistingQuickAction.textContent = 'Checking...';

        try {
          const payload = gatherData();
          const check = await checkExistingPath(payload);
          quickActionStatus.textContent = '';

          if (check && check.exists) {
            const existsLabel = document.createElement('span');
            existsLabel.textContent = 'Exists: ';

            const openLink = document.createElement('a');
            openLink.href = '#';
            openLink.textContent = 'Open folder';
            openLink.style.color = '#9cd2ff';
            openLink.style.textDecoration = 'underline';
            openLink.addEventListener('click', async event => {
              event.preventDefault();
              openLink.textContent = 'Opening...';
              try {
                await openExistingPath(payload);
                openLink.textContent = 'Opened';
              } catch (openErr) {
                console.error('Failed to open existing path', openErr);
                openLink.textContent = 'Open failed';
              }
            });

            const pathText = document.createElement('span');
            pathText.textContent = ` (${check.path})`;

            quickActionStatus.appendChild(existsLabel);
            quickActionStatus.appendChild(openLink);
            quickActionStatus.appendChild(pathText);
          } else {
            quickActionStatus.textContent = `Missing: ${check.path}`;
          }
        } catch (err) {
          console.error('Failed existing path check', err);
          quickActionStatus.textContent = 'Failed to check path.';
        } finally {
          checkExistingQuickAction.disabled = false;
          checkExistingQuickAction.textContent = originalText;
        }
      });

      quickActionsWrap.appendChild(mp3QuickAction);
      quickActionsWrap.appendChild(checkExistingQuickAction);
      quickActionsWrap.appendChild(quickActionStatus);
      actions.appendChild(cancelBtn);
      actions.appendChild(sendBtn);

      modal.appendChild(title);
      modal.appendChild(quickActionsLabel);
      modal.appendChild(quickActionsWrap);
      modal.appendChild(customLabel);
      modal.appendChild(customInput);
      modal.appendChild(actions);

      overlay.appendChild(modal);
      document.body.appendChild(overlay);
      document.addEventListener('keydown', onKeyDown);

      customInput.focus();
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
    const more = document.getElementById(MORE_BUTTON_ID);
    attachMoreClickHandler(more);
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
    const more = document.getElementById(MORE_BUTTON_ID);
    attachMoreClickHandler(more);
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
