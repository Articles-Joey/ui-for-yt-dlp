(() => {
  const BUTTON_ID = 'ytm-placeholder-button';
  let ENDPOINT = 'http://localhost:3060/download';
  const INFO_BUTTON_ID = 'ytm-info-button';
  let INFO_LINK = 'https://example.com';

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
    wrap.style.display = 'flex';
    wrap.style.gap = '8px';
    wrap.style.marginTop = '16px';

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
        setTimeout(() => (btn.textContent = 'Placeholder'), 2000);
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

  // Try inserting immediately
  insertAfterActionButtons();

  // Observe DOM changes to handle SPA navigation
  const observer = new MutationObserver(() => insertAfterActionButtons());
  observer.observe(document.documentElement || document.body, { childList: true, subtree: true });

  // Also run periodically for a short grace period in case mutations miss it
  let tries = 0;
  const interval = setInterval(() => {
    if (insertAfterActionButtons() || ++tries > 20) clearInterval(interval);
  }, 500);
})();
