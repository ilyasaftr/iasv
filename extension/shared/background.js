(() => {
  "use strict";

  const api = typeof browser !== "undefined" ? browser : chrome;
  const SUPPORTED_PATTERNS = [
    "*://*.instagram.com/*",
    "*://*.facebook.com/*",
    "*://web.whatsapp.com/*",
  ];

  const reloadSupportedTabs = () => {
    SUPPORTED_PATTERNS.forEach((pattern) => {
      try {
        api.tabs.query({ url: pattern }, (tabs) => {
          if (api.runtime && api.runtime.lastError) {
            return;
          }
          (tabs || []).forEach((tab) => {
            if (tab && typeof tab.id === "number") {
              api.tabs.reload(tab.id);
            }
          });
        });
      } catch (_e) {
        // Ignore tab API errors.
      }
    });
  };

  const onMessage = (message, _sender, sendResponse) => {
    if (message && message.type === "igav_reload_tabs") {
      reloadSupportedTabs();
      sendResponse({ ok: true });
      return true;
    }
    return false;
  };

  try {
    if (api.runtime.onMessage.hasListener(onMessage)) {
      return;
    }
  } catch (_e) {
    // Ignore listener check errors.
  }

  api.runtime.onMessage.addListener(onMessage);
})();
