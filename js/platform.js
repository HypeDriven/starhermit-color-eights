/* Color Eights — platform: token-aware adapter, time sync, presence, telemetry consent. */
(function (global) {
  'use strict';

  let accessToken = null;
  let launchToken = null;
  let serverTimeOffsetMs = 0; // round-trip adjusted offset from /api/v1/time
  let lastServerSyncAt = 0;

  function now() { return Date.now(); }
  function serverNow() { return now() + serverTimeOffsetMs; }

  global.CEPlatform = {
    setTokens(o) { if (o && o.access != null) accessToken = o.access; if (o && o.launch != null) launchToken = o.launch; },
    getAccessToken: () => accessToken,
    getLaunchToken: () => launchToken,
    serverNow,
    syncServerTime(offsetMs) { serverTimeOffsetMs = offsetMs || 0; lastServerSyncAt = now(); },
    isOnline: () => true, // local-only build
  };
})(typeof window !== 'undefined' ? window : globalThis);
