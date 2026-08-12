(() => {
  const utils = globalThis.YtdlpUtils || {};

  function isYouTubeMusic() {
    return location.hostname === 'music.youtube.com';
  }

  function isYouTube() {
    return location.hostname === 'www.youtube.com' || location.hostname === 'youtube.com';
  }

  function getText(element) {
    const text = element ? (element.textContent || '').trim() : '';
    return text || null;
  }

  function getActiveAlbum(name) {
    if (!isYouTubeMusic()) return null;

    const primary = document.querySelector('#content-wrapper #contents #primary');
    const detailHeader = primary && primary.querySelector('ytmusic-detail-header-renderer');
    if (!detailHeader) return null;

    const albumTitle = detailHeader.querySelector('.title, #title, yt-formatted-string');
    const albumLink = detailHeader.querySelector('a[href*="/browse/"], a[href*="/album/"]');
    return getText(albumTitle) || getText(albumLink) || getText(detailHeader) || name || null;
  }

  function getYouTubeMusicListItemMetadata(item) {
    const flexColumns = item.querySelector('.flex-columns');
    const title = flexColumns && flexColumns.querySelector('.title');
    const secondaryColumns = flexColumns
      ? Array.from(flexColumns.querySelectorAll('.secondary-flex-columns > .secondary-flex-column'))
      : [];

    const getColumnLink = column => column && column.querySelector('a[href]');
    const getColumnText = column => getText(getColumnLink(column)) || getText(column);

    const artistColumn = secondaryColumns.find(column => {
      const link = getColumnLink(column);
      const href = link ? link.getAttribute('href') || '' : '';
      return href.includes('/channel/') || href.includes('/artist/') || href.startsWith('/@');
    });
    const albumColumn = secondaryColumns.find(column => {
      const link = getColumnLink(column);
      const href = link ? link.getAttribute('href') || '' : '';
      return href.includes('/browse/') || href.includes('/album/');
    });

    return {
      name: getText(title),
      author: getColumnText(artistColumn) || getColumnText(secondaryColumns[0]),
      album: getColumnText(albumColumn) || getColumnText(secondaryColumns[1])
    };
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
    const album = getActiveAlbum(name);
    return { author, album, url, name };
  }

  Object.assign(utils, {
    gatherData,
    getYouTubeMusicListItemMetadata,
    isYouTube,
    isYouTubeMusic
  });
  globalThis.YtdlpUtils = utils;
})();