// Injected into page context to block story view tracking
(function () {
  "use strict";

  if (window.__igav_injected) {
    return;
  }
  window.__igav_injected = true;

  const config = {
    debug: false,
    maxSocketInspectBytes: 65536,
    platforms: [
      {
        name: "instagram",
        hostPattern: /(^|\.)instagram\.com$/i,
        graphQLPatterns: [/\/api\/graphql/i, /\/graphql\//i, /graphql\/query/i],
        urlPatterns:
          /media\/seen|api\/v1\/stories\/seen|stories_record_view|StoriesViewEvent/i,
        bodyPatterns:
          /view_seen_at|viewSeenAt|mark_seen|stories_seen|PolarisStoriesV3SeenMutation|StoriesViewEventRequestMutation|story_reel_view/i,
      },
      {
        name: "facebook",
        hostPattern: /(^|\.)facebook\.com$/i,
        graphQLPatterns: [/\/api\/graphql/i, /\/graphql/i],
        urlPatterns: /stories_record_view|StoriesViewEvent/i,
        bodyPatterns:
          /StoriesViewEvent|StoriesViewEventRequestMutation|storiesUpdateSeenStateMutation|direct_message_thread_update_seen_state|stories_record_view|story_view|story_seen|view_seen_at|viewSeenAt/i,
      },
      {
        name: "whatsapp",
        hostPattern: /^web\.whatsapp\.com$/i,
        graphQLPatterns: [],
        urlPatterns: /a^/,
        bodyPatterns: /a^/,
        socketPatterns:
          /\b(read|receipt|presence)\b|status@broadcast|sendReadStatus|readStatus/i,
      },
    ],
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

  const getCurrentPlatform = () => {
    const host = window.location && window.location.hostname;
    return config.platforms.find((platform) => platform.hostPattern.test(host));
  };

  const platform = getCurrentPlatform();

  const normalizeUrl = (url) => {
    if (!url) return "";
    try {
      return new URL(String(url), window.location.href).href;
    } catch (_e) {
      return typeof url === "string" ? url : String(url || "");
    }
  };

  const isGraphQLUrl = (url) => {
    if (!platform || !url || typeof url !== "string") return false;
    return platform.graphQLPatterns.some((pattern) => pattern.test(url));
  };

  const shouldBlockUrl = (url) => {
    if (!platform) return false;
    if (!url || typeof url !== "string") return false;
    try {
      return platform.urlPatterns.test(url);
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
    if (!platform) return false;
    if (!bodyStr) return false;
    try {
      return platform.bodyPatterns.test(bodyStr);
    } catch (e) {
      log("Error checking request body:", e);
      return false;
    }
  };

  const socketDataToString = (data) => {
    if (!data) return "";
    if (typeof data === "string") return data;
    if (typeof TextDecoder === "undefined") return "";
    try {
      const decoder = new TextDecoder();
      if (data instanceof ArrayBuffer) {
        return decoder.decode(data.slice(0, config.maxSocketInspectBytes));
      }
      if (ArrayBuffer.isView(data)) {
        const length = Math.min(data.byteLength, config.maxSocketInspectBytes);
        const bytes = new Uint8Array(data.buffer, data.byteOffset, length);
        return decoder.decode(bytes);
      }
    } catch (e) {
      log("Error decoding WebSocket payload:", e);
    }
    return "";
  };

  const shouldBlockSocketData = (data) => {
    if (!platform || platform.name !== "whatsapp") return false;
    const payload = socketDataToString(data);
    if (!payload) return false;
    try {
      return platform.socketPatterns.test(payload);
    } catch (e) {
      log("Error checking WebSocket payload:", e);
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
      const normalizedUrl = normalizeUrl(url);
      if (shouldInspectUrl(normalizedUrl)) {
        if (isAllowedContentType(this._igav_content_type)) {
          const bodyStr = bodyToString(args[0]);
          if (shouldBlockUrl(normalizedUrl) || shouldBlockBody(bodyStr)) {
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
      const normalizedUrl = normalizeUrl(url);
      if (!shouldInspectUrl(normalizedUrl)) {
        return await originalFetch.apply(this, args);
      }

      const contentType = getHeader(options.headers, "content-type");
      if (!isAllowedContentType(contentType)) {
        return await originalFetch.apply(this, args);
      }

      const bodyStr = bodyToString(body);
      if (shouldBlockUrl(normalizedUrl) || shouldBlockBody(bodyStr)) {
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

  const originalWebSocket = window.WebSocket;
  if (originalWebSocket) {
    const WrappedWebSocket = function (...args) {
      const socket = new originalWebSocket(...args);
      const originalSend = socket.send;
      try {
        socket.send = function (...sendArgs) {
          try {
            if (shouldBlockSocketData(sendArgs[0])) {
              log("Blocked WebSocket story seen tracking request");
              notifyBlocked();
              return;
            }
          } catch (e) {
            log("Error in WebSocket send override:", e);
          }
          return originalSend.apply(socket, sendArgs);
        };
      } catch (e) {
        log("Error wrapping WebSocket send:", e);
      }
      return socket;
    };

    try {
      Object.setPrototypeOf(WrappedWebSocket, originalWebSocket);
      WrappedWebSocket.prototype = originalWebSocket.prototype;
      ["CONNECTING", "OPEN", "CLOSING", "CLOSED"].forEach((key) => {
        Object.defineProperty(WrappedWebSocket, key, {
          value: originalWebSocket[key],
          enumerable: true,
        });
      });
      window.WebSocket = WrappedWebSocket;
    } catch (e) {
      log("Error installing WebSocket override:", e);
    }
  }

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

      if (originalWebSocket && window.WebSocket) {
        Object.defineProperty(window, "WebSocket", {
          value: window.WebSocket,
          writable: false,
          configurable: false,
        });
      }
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
