(() => {
  "use strict";

  const api = typeof browser !== "undefined" ? browser : chrome;
  const STORAGE_ENABLED = "enabled_instagram";
  const STORAGE_BLOCKED = "blocked_instagram";

  const i18nText = (key) => {
    try {
      if (api && api.i18n && typeof api.i18n.getMessage === "function") {
        return api.i18n.getMessage(key) || "";
      }
    } catch (_e) {
      return "";
    }
    return "";
  };

  const applyI18n = () => {
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      const key = el.getAttribute("data-i18n");
      const text = i18nText(key);
      if (text) {
        el.textContent = text;
      }
    });
  };

  const storageGet = () =>
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

  const storageSet = (value) =>
    new Promise((resolve) => {
      const payload = { [STORAGE_ENABLED]: value };
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

  const updateBlocked = (count) => {
    const el = document.getElementById("blockedCount");
    el.textContent = String(count || 0);
  };

  const updatePower = (enabled) => {
    const button = document.getElementById("powerToggle");
    const powerLabel = button.querySelector(".power-label");
    button.classList.toggle("is-on", enabled);
    button.setAttribute("aria-pressed", enabled ? "true" : "false");
    if (powerLabel) {
      powerLabel.textContent = enabled
        ? i18nText("power_on") || "ON"
        : i18nText("power_off") || "OFF";
    }
  };

  const reloadInstagramTabs = () => {
    try {
      api.runtime.sendMessage({ type: "igav_reload_tabs" });
    } catch (_e) {
      // Ignore messaging errors.
    }
  };

  const init = async () => {
    applyI18n();

    const button = document.getElementById("powerToggle");
    const data = await storageGet();

    const enabled = Boolean(data[STORAGE_ENABLED]);
    updateBlocked(data[STORAGE_BLOCKED]);
    updatePower(enabled);

    button.addEventListener("click", async () => {
      const next = !button.classList.contains("is-on");
      await storageSet(next);
      updatePower(next);
      reloadInstagramTabs();
    });
  };

  document.addEventListener("DOMContentLoaded", init);
})();
