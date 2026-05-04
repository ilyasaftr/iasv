// Injected into page context to block story view tracking
(function () {
  "use strict";

  if (window.__igav_injected) {
    return;
  }
  window.__igav_injected = true;

  const config = {
    debug: false,
    urlPatterns:
      /media\/seen|api\/v1\/stories\/seen|stories_record_view|StoriesViewEvent/i,
    bodyPatterns:
      /view_seen_at|viewSeenAt|mark_seen|stories_seen|StoriesViewEventRequestMutation|story_reel_view/i,
  };

  const log = (...args) => {
    if (config.debug) {
      console.log("[Instagram Anonymous Story Viewer]", ...args);
    }
  };

  const notifyBlocked = () => {
    try {
      window.postMessage({ source: "igav", type: "blocked" }, "*");
    } catch (_e) {
      // Ignore messaging errors.
    }
  };

  const isPlainObject = (value) =>
    Object.prototype.toString.call(value) === "[object Object]";

  const isGraphQLUrl = (url) => {
    if (!url || typeof url !== "string") return false;
    return /\/graphql\//i.test(url) || /graphql\/query/i.test(url);
  };

  const shouldBlockUrl = (url) => {
    if (!url || typeof url !== "string") return false;
    try {
      return config.urlPatterns.test(url);
    } catch (e) {
      log("Error checking request URL:", e);
      return false;
    }
  };

  const shouldInspectUrl = (url) => isGraphQLUrl(url) || shouldBlockUrl(url);

  const isAllowedContentType = (contentType) => {
    if (!contentType || typeof contentType !== "string") return true;
    return /application\/json|application\/x-www-form-urlencoded/i.test(
      contentType
    );
  };

  const getHeader = (headers, key) => {
    if (!headers || !key) return "";
    try {
      if (typeof headers.get === "function") {
        return headers.get(key) || "";
      }
      if (Array.isArray(headers)) {
        const found = headers.find(
          ([name]) => String(name).toLowerCase() === key.toLowerCase()
        );
        return found ? String(found[1] || "") : "";
      }
      if (typeof headers === "object") {
        for (const name of Object.keys(headers)) {
          if (name.toLowerCase() === key.toLowerCase()) {
            return String(headers[name] || "");
          }
        }
      }
    } catch (_e) {
      return "";
    }
    return "";
  };

  const bodyToString = (body) => {
    if (!body) return "";
    if (typeof body === "string") return body;
    if (body instanceof URLSearchParams) return body.toString();
    if (body instanceof FormData) {
      try {
        const params = new URLSearchParams();
        for (const [name, value] of body.entries()) {
          params.append(name, typeof value === "string" ? value : "[file]");
        }
        return params.toString();
      } catch (_e) {
        return "";
      }
    }
    if (Array.isArray(body) || isPlainObject(body)) {
      try {
        return JSON.stringify(body);
      } catch (_e) {
        return "";
      }
    }
    return "";
  };

  const shouldBlockBody = (bodyStr) => {
    if (!bodyStr) return false;
    try {
      return config.bodyPatterns.test(bodyStr);
    } catch (e) {
      log("Error checking request body:", e);
      return false;
    }
  };

  const originalXMLOpen = XMLHttpRequest.prototype.open;
  const originalXMLSetHeader = XMLHttpRequest.prototype.setRequestHeader;
  const originalXMLSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (...args) {
    try {
      const url = args[1];
      this._igav_url = typeof url === "string" ? url : String(url || "");
    } catch (_e) {
      this._igav_url = "";
    }
    return originalXMLOpen.apply(this, args);
  };
  XMLHttpRequest.prototype.setRequestHeader = function (name, value) {
    try {
      if (
        typeof name === "string" &&
        name.toLowerCase() === "content-type"
      ) {
        this._igav_content_type = String(value || "");
      }
    } catch (_e) {
      // Ignore header parsing errors.
    }
    return originalXMLSetHeader.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function (...args) {
    try {
      const url = this._igav_url || this.responseURL || "";
      if (shouldInspectUrl(url)) {
        if (isAllowedContentType(this._igav_content_type)) {
          const bodyStr = bodyToString(args[0]);
          if (shouldBlockUrl(url) || shouldBlockBody(bodyStr)) {
            log("Blocked XMLHttpRequest story seen tracking request");
            notifyBlocked();
            return;
          }
        }
      }
      return originalXMLSend.apply(this, args);
    } catch (e) {
      log("Error in XMLHttpRequest override:", e);
      return originalXMLSend.apply(this, args);
    }
  };

  const originalFetch = window.fetch;
  window.fetch = async function (...args) {
    try {
      const [resource, options = {}] = args;
      const body = options.body || null;
      const url =
        typeof resource === "string"
          ? resource
          : resource && resource.url
            ? resource.url
            : "";
      if (!shouldInspectUrl(url)) {
        return await originalFetch.apply(this, args);
      }

      const contentType = getHeader(options.headers, "content-type");
      if (!isAllowedContentType(contentType)) {
        return await originalFetch.apply(this, args);
      }

      const bodyStr = bodyToString(body);
      if (shouldBlockUrl(url) || shouldBlockBody(bodyStr)) {
        log("Blocked Fetch story seen tracking request");
        notifyBlocked();
        return new Promise(() => {});
      }

      return await originalFetch.apply(this, args);
    } catch (e) {
      log("Error in Fetch override:", e);
      return originalFetch.apply(this, args);
    }
  };

  const protectOverrides = () => {
    try {
      Object.defineProperty(window, "fetch", {
        value: window.fetch,
        writable: false,
        configurable: false,
      });

      Object.defineProperty(XMLHttpRequest.prototype, "send", {
        value: XMLHttpRequest.prototype.send,
        writable: false,
        configurable: false,
      });
    } catch (e) {
      log("Error protecting overrides:", e);
    }
  };

  try {
    protectOverrides();
    log("Script initialized successfully");
  } catch (e) {
    console.error("[Instagram Anonymous Story Viewer] Initialization error:", e);
  }
})();
