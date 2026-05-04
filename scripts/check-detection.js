#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");

const config = {
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

const getPlatform = (host) =>
  config.platforms.find((platform) => platform.hostPattern.test(host));

const normalizeUrl = (url, origin) => {
  try {
    return new URL(url, origin).href;
  } catch (_e) {
    return String(url || "");
  }
};

const isGraphQLUrl = (platform, url) =>
  Boolean(platform) && platform.graphQLPatterns.some((pattern) => pattern.test(url));

const shouldBlockUrl = (platform, url) =>
  Boolean(platform) && Boolean(url) && platform.urlPatterns.test(url);

const shouldBlockBody = (platform, body) =>
  Boolean(platform) && Boolean(body) && platform.bodyPatterns.test(body);

const shouldInspectUrl = (platform, url) =>
  isGraphQLUrl(platform, url) || shouldBlockUrl(platform, url);

const isAllowedContentType = (contentType) => {
  if (!contentType || typeof contentType !== "string") return true;
  return /application\/json|application\/x-www-form-urlencoded/i.test(contentType);
};

const shouldBlockHttp = ({ host, url, body = "", contentType = "" }) => {
  const platform = getPlatform(host);
  const normalizedUrl = normalizeUrl(url, `https://${host}/`);
  if (!shouldInspectUrl(platform, normalizedUrl)) return false;
  if (!isAllowedContentType(contentType)) return false;
  return shouldBlockUrl(platform, normalizedUrl) || shouldBlockBody(platform, body);
};

const socketDataToString = (data) => {
  if (!data) return "";
  if (typeof data === "string") return data;
  if (data instanceof ArrayBuffer) return new TextDecoder().decode(data);
  if (ArrayBuffer.isView(data)) return new TextDecoder().decode(data);
  return "";
};

const shouldBlockSocket = ({ host, data }) => {
  const platform = getPlatform(host);
  if (!platform || platform.name !== "whatsapp") return false;
  const payload = socketDataToString(data);
  return Boolean(payload) && platform.socketPatterns.test(payload);
};

const encoder = new TextEncoder();
const cases = [
  [
    "instagram direct media seen URL blocks",
    shouldBlockHttp({
      host: "www.instagram.com",
      url: "/media/seen",
      contentType: "application/json",
    }),
    true,
  ],
  [
    "instagram committed body marker blocks",
    shouldBlockHttp({
      host: "www.instagram.com",
      url: "/graphql/query",
      body: '{"viewSeenAt":1}',
      contentType: "application/json",
    }),
    true,
  ],
  [
    "instagram api graphql seen mutation blocks",
    shouldBlockHttp({
      host: "www.instagram.com",
      url: "/api/graphql",
      body: "fb_api_req_friendly_name=PolarisStoriesV3SeenMutation&variables=%7B%22viewSeenAt%22%3A1777858343%7D",
      contentType: "application/x-www-form-urlencoded",
    }),
    true,
  ],
  [
    "facebook GraphQL story marker blocks",
    shouldBlockHttp({
      host: "www.facebook.com",
      url: "/api/graphql",
      body: "fb_api_req_friendly_name=StoriesViewEventRequestMutation",
      contentType: "application/x-www-form-urlencoded",
    }),
    true,
  ],
  [
    "facebook stories seen state mutation blocks",
    shouldBlockHttp({
      host: "www.facebook.com",
      url: "/api/graphql/",
      body: "fb_api_req_friendly_name=storiesUpdateSeenStateMutation&variables=%7B%22input%22%3A%7B%22story_id%22%3A%22UzpfSVNDOjI1MjQ5MTUwMDQ2MzQxNTc%3D%22%7D%7D",
      contentType: "application/x-www-form-urlencoded",
    }),
    true,
  ],
  [
    "facebook unrelated GraphQL passes",
    shouldBlockHttp({
      host: "www.facebook.com",
      url: "/api/graphql",
      body: "fb_api_req_friendly_name=CometNotificationsQuery",
      contentType: "application/x-www-form-urlencoded",
    }),
    false,
  ],
  [
    "whatsapp status read WebSocket text blocks",
    shouldBlockSocket({
      host: "web.whatsapp.com",
      data: '<message to="status@broadcast" type="read"><receipt /></message>',
    }),
    true,
  ],
  [
    "whatsapp status read WebSocket bytes block",
    shouldBlockSocket({
      host: "web.whatsapp.com",
      data: encoder.encode('{"to":"status@broadcast","type":"read"}'),
    }),
    true,
  ],
  [
    "whatsapp unrelated WebSocket payload passes",
    shouldBlockSocket({
      host: "web.whatsapp.com",
      data: '{"type":"chat","body":"hello"}',
    }),
    false,
  ],
  [
    "non-supported host passes",
    shouldBlockHttp({
      host: "example.com",
      url: "/api/graphql",
      body: '{"viewSeenAt":1}',
      contentType: "application/json",
    }),
    false,
  ],
  [
    "non-json content type passes",
    shouldBlockHttp({
      host: "www.instagram.com",
      url: "/graphql/query",
      body: '{"viewSeenAt":1}',
      contentType: "text/plain",
    }),
    false,
  ],
];

for (const [name, actual, expected] of cases) {
  assert.equal(actual, expected, name);
  console.log(`PASS ${name}`);
}
