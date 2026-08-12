(() => {
  const utils = globalThis.YtdlpUtils || {};

  function createPathQuery(payload = {}) {
    const params = new URLSearchParams();
    const authorOverride = payload.authorOverride || payload.artistOverride || '';
    const titleOverride = payload.titleOverride || payload.nameOverride || '';
    const albumOverride = payload.albumOverride || '';
    const savePathOverride = payload.savePathOverride || payload.savePath || '';

    params.set('author', authorOverride || payload.author || 'unknown');
    params.set('name', titleOverride || payload.name || 'unknown');
    params.set('album', albumOverride || payload.album || '');
    params.set('isSingle', payload.isSingle ? 'true' : 'false');
    if (authorOverride) params.set('authorOverride', authorOverride);
    if (titleOverride) params.set('titleOverride', titleOverride);
    if (albumOverride) params.set('albumOverride', albumOverride);
    if (savePathOverride) params.set('savePathOverride', savePathOverride);
    return params;
  }

  Object.assign(utils, { createPathQuery });
  globalThis.YtdlpUtils = utils;
})();