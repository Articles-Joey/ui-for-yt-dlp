(() => {
  const BUTTON_ROW_ID = 'ytm-button-row';
  const BUTTON_ID = 'ytm-placeholder-button';
  let ENDPOINT = 'http://localhost:3060/download';
  let CHECK_ENDPOINT = 'http://localhost:3060/check';
  let OPEN_PATH_ENDPOINT = 'http://localhost:3060/open-path';
  const MORE_BUTTON_ID = 'ytm-more-button';
  const INFO_BUTTON_ID = 'ytm-info-button';
  let INFO_LINK = 'https://github.com/Articles-Joey/ui-for-yt-dlp';

  const { createPathQuery, gatherData, getYouTubeMusicListItemMetadata, isYouTube, isYouTubeMusic } = globalThis.YtdlpUtils;

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
    const params = createPathQuery(payload);

    const resp = await fetch(`${CHECK_ENDPOINT}?${params.toString()}`);
    if (!resp.ok) throw new Error('Non-OK response: ' + resp.status);
    return resp.json();
  }

  async function openExistingPath(payload) {
    const params = createPathQuery(payload);

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

  function createListButtons() {
    if (!isYouTubeMusic()) return;

    const listItems = document.querySelectorAll(
      '#contents #secondary #contents #contents ytmusic-responsive-list-item-renderer'
    );

    listItems.forEach(item => {
      const leftItems = item.querySelector('.left-items');
      if (!leftItems) return;

      const existing = item.querySelector('.ytm-list-log-button');
      if (existing) return;

      const listBtn = document.createElement('button');
      listBtn.className = 'ytm-list-log-button';
      listBtn.type = 'button';
      listBtn.textContent = '⚙️';
      listBtn.title = 'Advanced download options';
      listBtn.style.marginLeft = '8px';
      listBtn.style.marginRight = '1rem';
      listBtn.style.padding = '4px 8px';
      listBtn.style.fontSize = '12px';
      listBtn.style.cursor = 'pointer';

      listBtn.addEventListener('click', async event => {
        event.preventDefault();
        event.stopPropagation();

        const anchor =
          item.querySelector('a[href*="/watch"], a[href*="watch?v="]') ||
          item.querySelector('.flex-columns .title a[href], .title a[href], a[href]');
        const href = anchor ? anchor.getAttribute('href') : null;
        if (!href) {
          console.warn('No href found for list item');
          return;
        }

        let absoluteUrl = href;

        try {
          const parsed = new URL(href, location.origin);
          absoluteUrl = parsed.toString();
        } catch (err) {
          console.warn('Could not parse list href', err);
        }

        const payload = gatherData();
        const rowMetadata = getYouTubeMusicListItemMetadata(item);
        payload.url = absoluteUrl;
        payload.name = rowMetadata.name || null;
        payload.author = rowMetadata.author || null;
        payload.artist = rowMetadata.author || null;
        payload.album = rowMetadata.album || payload.album || null;

        await runAdvancedDownloadFlow(listBtn, payload);
      });

      leftItems.insertAdjacentElement('afterend', listBtn);
    });
  }

  function attachMoreClickHandler(btn) {
    if (!btn || btn.dataset.handlerAttached) return;
    btn.dataset.handlerAttached = '1';

    btn.addEventListener('click', async () => {
      const payload = gatherData();
      await runAdvancedDownloadFlow(btn, payload);
    });
  }

  async function runAdvancedDownloadFlow(btn, basePayload) {
      const original = btn.textContent;
      const payloadBase = Object.assign({}, basePayload || gatherData());

      const result = await showMoreOptionsModal(payloadBase);
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

        const payload = Object.assign({}, payloadBase);
        if (result.isSingle) payload.isSingle = true;
        if (params) payload.params = params;
        if (result.overrides) Object.assign(payload, result.overrides);

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
  }

  function showMoreOptionsModal(contextPayload) {
    return new Promise(resolve => {
      const activePayload = Object.assign({}, contextPayload || gatherData());
      if (!activePayload.url) activePayload.url = location.href;

      let isSingle = false;

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

      const activeUrlLabel = document.createElement('div');
      activeUrlLabel.textContent = 'Active URL';
      activeUrlLabel.style.fontSize = '13px';
      activeUrlLabel.style.fontWeight = '600';
      activeUrlLabel.style.marginBottom = '6px';

      const activeUrlValue = document.createElement('div');
      activeUrlValue.textContent = activePayload.url;
      activeUrlValue.style.fontSize = '12px';
      activeUrlValue.style.opacity = '0.9';
      activeUrlValue.style.wordBreak = 'break-all';
      activeUrlValue.style.marginBottom = '12px';

      const activeMetadataLabel = document.createElement('div');
      activeMetadataLabel.textContent = 'Active Metadata';
      activeMetadataLabel.style.fontSize = '13px';
      activeMetadataLabel.style.fontWeight = '600';
      activeMetadataLabel.style.marginBottom = '6px';

      const activeMetadataWrap = document.createElement('div');
      activeMetadataWrap.style.fontSize = '12px';
      activeMetadataWrap.style.opacity = '0.9';
      activeMetadataWrap.style.marginBottom = '12px';

      const activeAlbumValue = document.createElement('div');
      activeAlbumValue.textContent = `Active Album: ${activePayload.album || 'Not detected'}`;

      const activeArtistValue = document.createElement('div');
      activeArtistValue.textContent = `Active Artist: ${activePayload.author || activePayload.artist || 'Not detected'}`;

      activeMetadataWrap.appendChild(activeAlbumValue);
      activeMetadataWrap.appendChild(activeArtistValue);

      const overridesLabel = document.createElement('div');
      overridesLabel.textContent = 'Overrides (optional)';
      overridesLabel.style.fontSize = '13px';
      overridesLabel.style.fontWeight = '600';
      overridesLabel.style.marginBottom = '6px';

      const overridesWrap = document.createElement('div');
      overridesWrap.style.display = 'grid';
      overridesWrap.style.gap = '8px';
      overridesWrap.style.marginBottom = '12px';

      const createOverrideInput = (labelText, value, placeholder) => {
        const field = document.createElement('label');
        field.textContent = labelText;
        field.style.display = 'grid';
        field.style.gap = '4px';
        field.style.fontSize = '12px';

        const input = document.createElement('input');
        input.type = 'text';
        input.value = value || '';
        input.placeholder = placeholder;
        input.style.width = '100%';
        input.style.boxSizing = 'border-box';
        input.style.padding = '8px';

        field.appendChild(input);
        overridesWrap.appendChild(field);
        return input;
      };

      const artistOverrideInput = createOverrideInput(
        'Artist override',
        activePayload.author || activePayload.artist,
        'Leave blank to use the detected artist'
      );
      const titleOverrideInput = createOverrideInput(
        'Title override',
        activePayload.name,
        'Current title is prefilled'
      );
      const albumOverrideInput = createOverrideInput(
        'Album override',
        activePayload.album,
        'Leave blank to use the detected album'
      );
      const savePathOverrideInput = createOverrideInput(
        'Exact save location',
        activePayload.savePathOverride,
        'Example: D:\\Music\\Artist\\Album'
      );

      const collectOverrides = () => ({
        authorOverride: artistOverrideInput.value.trim(),
        titleOverride: titleOverrideInput.value.trim(),
        albumOverride: albumOverrideInput.value.trim(),
        savePathOverride: savePathOverrideInput.value.trim()
      });

      const quickActionsLabel = document.createElement('div');
      quickActionsLabel.textContent = 'Quick Actions';
      quickActionsLabel.style.fontSize = '13px';
      quickActionsLabel.style.fontWeight = '600';
      quickActionsLabel.style.marginBottom = '6px';

      const quickActionsWrap = document.createElement('div');
      quickActionsWrap.style.marginBottom = '12px';

      const toggleSingleQuickAction = document.createElement('button');
      toggleSingleQuickAction.type = 'button';
      toggleSingleQuickAction.textContent = 'Toggle Is Single: Off';
      toggleSingleQuickAction.style.padding = '8px 10px';
      toggleSingleQuickAction.style.cursor = 'pointer';

      const mp3QuickAction = document.createElement('button');
      mp3QuickAction.type = 'button';
      mp3QuickAction.textContent = 'Extract audio as MP3';
      mp3QuickAction.style.padding = '8px 10px';
      mp3QuickAction.style.cursor = 'pointer';
      mp3QuickAction.style.marginLeft = '8px';

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
      sendBtn.addEventListener('click', () => close({
        action: 'custom',
        customParamsText: customInput.value,
        isSingle,
        overrides: collectOverrides()
      }));
      mp3QuickAction.addEventListener('click', () => close({
        action: 'quick-mp3',
        isSingle,
        overrides: collectOverrides()
      }));
      toggleSingleQuickAction.addEventListener('click', () => {
        isSingle = !isSingle;
        toggleSingleQuickAction.textContent = `Toggle Is Single: ${isSingle ? 'On' : 'Off'}`;
      });
      checkExistingQuickAction.addEventListener('click', async () => {
        const originalText = checkExistingQuickAction.textContent;
        quickActionStatus.textContent = '';
        checkExistingQuickAction.disabled = true;
        checkExistingQuickAction.textContent = 'Checking...';

        try {
          const payload = Object.assign({}, activePayload);
          if (isSingle) payload.isSingle = true;
          Object.assign(payload, collectOverrides());
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

      quickActionsWrap.appendChild(toggleSingleQuickAction);
      quickActionsWrap.appendChild(mp3QuickAction);
      quickActionsWrap.appendChild(checkExistingQuickAction);
      quickActionsWrap.appendChild(quickActionStatus);
      actions.appendChild(cancelBtn);
      actions.appendChild(sendBtn);

      modal.appendChild(title);
      modal.appendChild(activeUrlLabel);
      modal.appendChild(activeUrlValue);
      modal.appendChild(activeMetadataLabel);
      modal.appendChild(activeMetadataWrap);
      modal.appendChild(overridesLabel);
      modal.appendChild(overridesWrap);
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

    createListButtons();
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
