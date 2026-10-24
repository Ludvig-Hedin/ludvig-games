/* Each imported edition keeps its own scores and settings on the shared origin. */
(() => {
  const slug = document.currentScript.dataset.game;
  const prefix = `ludvig-games:${slug}:`;
  for (const name of ['localStorage', 'sessionStorage']) {
    try {
      const storage = window[name];
      const keys = () => Array.from({ length: storage.length }, (_, i) => storage.key(i))
        .filter(key => key && key.startsWith(prefix));
      const methods = {
        getItem: key => storage.getItem(prefix + String(key)),
        setItem: (key, value) => storage.setItem(prefix + String(key), value),
        removeItem: key => storage.removeItem(prefix + String(key)),
        clear: () => keys().forEach(key => storage.removeItem(key)),
        key: index => keys()[Number(index)]?.slice(prefix.length) ?? null,
      };
      const scoped = new Proxy(Object.create(null), {
        get: (_, key) => key === 'length' ? keys().length
          : Object.hasOwn(methods, key) ? methods[key]
          : typeof key === 'string' ? storage.getItem(prefix + key) ?? undefined : undefined,
        set: (_, key, value) => { methods.setItem(key, value); return true; },
        deleteProperty: (_, key) => { methods.removeItem(key); return true; },
        ownKeys: () => keys().map(key => key.slice(prefix.length)),
        getOwnPropertyDescriptor: (_, key) => storage.getItem(prefix + String(key)) === null
          ? undefined : { configurable: true, enumerable: true, writable: true, value: storage.getItem(prefix + String(key)) },
      });
      Object.defineProperty(window, name, { configurable: true, value: scoped });
    } catch { /* Games retain their own storage-unavailable handling. */ }
  }
})();
