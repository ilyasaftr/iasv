(() => {
  "use strict";

  if (window.__igav_bootstrapped) {
    return;
  }
  window.__igav_bootstrapped = true;

  const api = typeof browser !== "undefined" ? browser : chrome;
  const STORAGE_ENABLED = "enabled_instagram";
  const STORAGE_BLOCKED = "blocked_instagram";
  let queue = Promise.resolve();

  const getStorage = () =>
    new Promise((resolve) => {
      const defaults = { [STORAGE_ENABLED]: true, [STORAGE_BLOCKED]: 0 };
      const handle = (result) => resolve(result || defaults);

      try {
        const maybePromise = api.storage.local.get(defaults);
        if (maybePromise && typeof maybePromise.then === "function") {
          maybePromise.then(handle).catch(() => resolve(defaults));
          return;
        }
      } catch (_e) {
        // Fall back to callback style below.
      }

      try {
        api.storage.local.get(defaults, handle);
      } catch (_e) {
        resolve(defaults);
      }
    });

  const setStorage = (payload) =>
    new Promise((resolve) => {
      const done = () => resolve();

      try {
        const maybePromise = api.storage.local.set(payload);
        if (maybePromise && typeof maybePromise.then === "function") {
          maybePromise.then(done).catch(done);
          return;
        }
      } catch (_e) {
        // Fall back to callback style below.
      }

      try {
        api.storage.local.set(payload, done);
      } catch (_e) {
        resolve();
      }
    });

  const incrementBlocked = () => {
    queue = queue.then(async () => {
      const current = await getStorage();
      const next = Number(current[STORAGE_BLOCKED] || 0) + 1;
      await setStorage({ [STORAGE_BLOCKED]: next });
    });
  };

  const injectScript = () => {
    const script = document.createElement("script");
    script.src = api.runtime.getURL("shared/inject.js");
    script.async = false;
    script.onload = () => script.remove();
    script.onerror = () => script.remove();
    (document.head || document.documentElement).appendChild(script);
  };

  const setupCounterListener = () => {
    window.addEventListener("message", (event) => {
      if (event.source !== window) return;
      const data = event.data || {};
      if (data.source !== "igav" || data.type !== "blocked") return;
      incrementBlocked();
    });
  };

  getStorage().then((current) => {
    if (current[STORAGE_ENABLED]) {
      setupCounterListener();
      injectScript();
    }
  });
})();
