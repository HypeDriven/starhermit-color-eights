/* Color Eights — StarHermit platform adapter (browser global: window.CEPlatform)
 * over window.StarHermit (starhermit-sdk.js, loaded and init()ed from
 * index.html before the game modules). The SDK reads the launch token
 * (#game_token / #access_token), strips it, renews it, and owns the profile
 * nickname, the cloud-save slot game:<slug> (settings/progress documents;
 * remote wins on boot; debounced saves with a pagehide flush), the settings
 * KV, control bindings, invite link and sign-in. Offline play is unchanged:
 * no token → localStorage only, local clock, and zero /api calls.
 */
(function (global) {
  'use strict';

  const SAVE_DEBOUNCE_MS = 2000;
  const sdk = () => global.StarHermit || null;
  const signedIn = () => { const s = sdk(); return !!(s && s.signedIn); };

  // Keyboard actions — declared as control.<action> in starhermit.txt.
  const DEFAULT_BINDINGS = {
    cancel: ['Escape'], pause: ['KeyP'], draw: ['KeyD'], hint: ['KeyH'], undo: ['KeyU'],
  };
  // Preference groups mirrored to the settings KV.
  const SYNCED_SETTINGS = ['audio', 'graphics', 'accessibility', 'camera', 'rulesOptions'];
  const cloneBindings = (b) => Object.fromEntries(Object.entries(b).map(([k, v]) => [k, v.slice()]));

  let accessToken = null;
  let profile = null;           // { name } for the signed-in player
  let sync = 'offline';         // offline | saving | synced (cloud mirror)
  let serverTimeOffsetMs = 0;   // round-trip adjusted offset (set by the caller)
  let lastServerSyncAt = 0;
  let syncListeners = [];
  let authListeners = [];
  let hooked = false;
  let bindings = cloneBindings(DEFAULT_BINDINGS);
  let codeMap = null;
  let kvReady = false, kvLast = null, kvTimer = null;

  function now() { return Date.now(); }
  function serverNow() { return now() + serverTimeOffsetMs; }

  function headers(extra) {
    const h = extra || {};
    const s = sdk();
    if (s && s.token) h.Authorization = 'Bearer ' + s.token;
    return h;
  }

  function setSync(state) {
    if (sync === state) return;
    sync = state;
    for (const fn of syncListeners) {
      try { fn(state); } catch (e) { /* listener errors never break */ }
    }
  }

  // Nickname (never /api/v1/me, never usernames), 'Player <id>' fallback.
  function profileFor(pid) {
    if (!pid || typeof pid !== 'string') return Promise.resolve('player');
    const s = sdk();
    if (!s || !s.signedIn) return Promise.resolve('Player ' + pid.slice(0, 6));
    return s.profile(pid).then((p) => (p && p.displayName) || 'Player ' + pid.slice(0, 6), () => 'Player ' + pid.slice(0, 6));
  }
  function fetchProfile() {
    const s = sdk();
    if (!s || !s.userId) return Promise.resolve(null);
    return profileFor(s.userId).then((n) => {
      profile = { name: n.slice(0, 40) };
      return profile;
    });
  }

  /* Cloud save: the wrapped {settings, progress} documents in game:<slug>.
   * The caller validates checksums through CEStore.unwrap. */
  function loadCloud() { return signedIn() ? sdk().loadJSON().catch(() => null) : Promise.resolve(null); }
  function saveCloud(doc) {
    if (!signedIn()) return Promise.resolve(false);
    setSync('saving');
    sdk().saveJSON(doc, SAVE_DEBOUNCE_MS);
    return Promise.resolve(true);
  }
  function flushSave() { return signedIn() ? sdk().flushSave(true) : Promise.resolve(false); }

  /* Settings KV: preference groups; patched after the KV was read once. */
  function pick(settings) {
    const out = {};
    for (const k of SYNCED_SETTINGS) if (settings && settings[k] != null) out[k] = settings[k];
    return out;
  }
  function getSettings() {
    if (!signedIn()) return Promise.resolve({});
    return sdk().getSettings().then((kv) => { kvReady = true; return pick(kv || {}); }, () => { kvReady = true; return {}; });
  }
  function mirrorSettings(settings) {
    if (!signedIn() || !kvReady) return;
    const patch = pick(settings);
    const json = JSON.stringify(patch);
    if (json === kvLast) return;
    clearTimeout(kvTimer);
    kvTimer = setTimeout(() => { kvLast = json; sdk().patchSettings(patch); }, 800);
  }

  /* Controls: platform overrides over DEFAULT_BINDINGS. */
  function loadBindings() {
    const s = sdk();
    const p = s && s.signedIn ? s.loadBindings(DEFAULT_BINDINGS).catch(() => cloneBindings(DEFAULT_BINDINGS))
      : Promise.resolve(cloneBindings(DEFAULT_BINDINGS));
    return p.then((b) => { bindings = b; codeMap = null; return b; });
  }
  function actionFor(e) {
    if (!codeMap) {
      codeMap = {};
      for (const [a, codes] of Object.entries(bindings)) for (const c of codes) codeMap[c] = a;
    }
    return codeMap[e.code] || null;
  }

  function inviteLink() { return signedIn() ? sdk().inviteLink() : null; }
  function copyInvite() {
    const link = inviteLink();
    if (!link) return Promise.resolve(false);
    try { return navigator.clipboard.writeText(link).then(() => true, () => false); } catch (e) { return Promise.resolve(false); }
  }

  function init() {
    const s = sdk();
    if (s && !hooked) {
      hooked = true;
      s.on('saved', (ok) => setSync(ok ? 'synced' : 'offline'));
      s.on('auth', (a) => {
        if (!a.signedIn) { profile = null; setSync('offline'); }
        for (const fn of authListeners) { try { fn(a); } catch (e) { /* ignore */ } }
      });
    }
    if (signedIn()) {
      try {
        global.addEventListener('pagehide', () => { flushSave(); });
        global.document.addEventListener('visibilitychange', () => { if (global.document.hidden) flushSave(); });
      } catch (e) { /* no window events available */ }
      fetchProfile().catch(() => {});
    }
    return signedIn();
  }

  global.CEPlatform = {
    setTokens(o) {
      if (o && o.access != null) accessToken = o.access;
      if (o && o.launch != null && sdk()) sdk().setToken(o.launch);
    },
    getAccessToken: () => accessToken,
    getLaunchToken: () => { const s = sdk(); return s ? s.token : null; },
    serverNow,
    syncServerTime(offsetMs) { serverTimeOffsetMs = offsetMs || 0; lastServerSyncAt = now(); },
    isOnline: () => signedIn(),
    init,
    headers,
    profileFor,
    fetchProfile,
    refreshToken() { const s = sdk(); return s ? s.refresh().then((t) => !!t) : Promise.resolve(false); },
    loadCloud,
    saveCloud,
    flushSave,
    getSettings,
    mirrorSettings,
    loadBindings,
    actionFor,
    inviteLink,
    copyInvite,
    canSignIn() { const s = sdk(); return !!(s && s.canSignIn()); },
    signIn() { const s = sdk(); return !!(s && s.signIn()); },
    onSync(fn) { if (typeof fn === 'function') syncListeners.push(fn); },
    onAuth(fn) { if (typeof fn === 'function') authListeners.push(fn); },
    get hosted() { return signedIn(); },
    get tokenHosted() { return signedIn(); },
    get profile() { return profile; },
    get sync() { return sync; },
    get userId() { const s = sdk(); return s ? s.userId : null; },
    get slug() { const s = sdk(); return s ? s.slug : null; },
  };
})(typeof window !== 'undefined' ? window : globalThis);
