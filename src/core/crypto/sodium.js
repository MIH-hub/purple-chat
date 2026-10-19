let _sodium = null;
let _promise = null;

export function getSodium() {
  if (_sodium) return Promise.resolve(_sodium);
  if (_promise) return _promise;

  _promise = (async () => {
    const mod = await import('libsodium-wrappers-sumo');
    const sodium = mod.default ?? mod;
    await sodium.ready;
    _sodium = sodium;
    console.log('libsodium загружен');
    return sodium;
  })();

  return _promise;
}

export function isSodiumReady() {
  return _sodium !== null;
}