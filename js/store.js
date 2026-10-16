/* Color Eights — local persistence: settings, profile, progress, snapshots.
 * Versioned documents with checksums; cloud sync handled by platform.js. */
(function (global) {
  'use strict';
  const NS = 'coloreights.';
  const SETTINGS_VERSION = 2;
  const PROGRESS_VERSION = 2;

  function ls() {
    try { return global.localStorage; } catch (e) { return null; }
  }
  function get(key, dflt) {
    const s = ls(); if (!s) return dflt;
    try {
      const raw = s.getItem(NS + key);
      return raw == null ? dflt : JSON.parse(raw);
    } catch (e) { return dflt; }
  }
  function set(key, val) {
    const s = ls(); if (!s) return false;
    try {
      s.setItem(NS + key, JSON.stringify(val));
      // Mirror the save records to the platform cloud slot (debounced there).
      if ((key === 'settings' || key === 'progress') && global.CEPlatform && global.CEPlatform.hosted) {
        try {
          global.CEPlatform.saveCloud({ settings: get('settings', null), progress: get('progress', null) });
          if (key === 'settings') global.CEPlatform.mirrorSettings(unwrap(val, SETTINGS_VERSION) || {});
        } catch (e) { /* mirror errors never break saves */ }
      }
      return true;
    } catch (e) { return false; }
  }
  function del(key) { const s = ls(); if (s) try { s.removeItem(NS + key); } catch (e) {} }

  function checksum(doc) {
    const str = JSON.stringify([doc.version, doc.data]);
    let h = 0x811c9dc5 >>> 0;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return ('00000000' + h.toString(16)).slice(-8);
  }
  function wrap(version, data) {
    const doc = { version, data, updatedAt: Date.now() };
    doc.checksum = checksum(doc);
    return doc;
  }
  function unwrap(doc, expectVersion) {
    if (!doc || typeof doc !== 'object') return null;
    if (doc.version > expectVersion) return null;
    if (doc.checksum && doc.checksum !== checksum(doc)) return null; // corrupted
    return doc.data;
  }

  const DEFAULT_SETTINGS = {
    audio: { music: 0.6, effects: 0.8, ambience: 0.5, voice: 0.7, muted: false },
    graphics: { tier: 'auto', renderScale: 1, reducedMotion: false, postFx: true, gfx: { preset: 'auto' } },
    accessibility: {
      palette: 'standard',        // standard | contrast | deuteranopia | tritanopia
      largeText: false, highContrast: false, leftHanded: false,
      holdToConfirm: false, timingAssist: false, haptics: true,
      captions: true, screenReaderCues: true,
    },
    camera: { view: 'table' },    // table | low
    // keyboard bindings: StarHermit controls via CEPlatform.loadBindings()
    rulesOptions: { stacking: false, drawToMatch: false },
    tutorialDone: {},
    consent: { telemetry: false },
  };
  function loadSettings() {
    const data = unwrap(get('settings', null), SETTINGS_VERSION);
    const clone = typeof structuredClone === 'function'
      ? structuredClone(DEFAULT_SETTINGS)
      : JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    return mergeDeep(clone, data || {});
  }
  function saveSettings(s) { return set('settings', wrap(SETTINGS_VERSION, s)); }

  const DEFAULT_PROGRESS = {
    journey: {},        // stageId -> { stars, best, goalMet }
    tutorials: {},      // lessonId -> true
    achievements: {},   // key -> unlockedAt
    stats: { roundsPlayed: 0, wins: 0, winStreak: 0, bestWinStreak: 0, actionCardsUsed: 0, dailyCompleted: {} },
    mastery: { points: 0 },
    challenges: {},     // challengeId -> { completed, best }
  };
  function loadProgress() {
    const data = unwrap(get('progress', null), PROGRESS_VERSION);
    return mergeDeep(JSON.parse(JSON.stringify(DEFAULT_PROGRESS)), data || {});
  }
  function saveProgress(p) { return set('progress', wrap(PROGRESS_VERSION, p)); }

  function loadProfile() {
    return get('profile', null) || {
      id: 'guest-' + Math.random().toString(36).slice(2, 10),
      name: 'Guest', avatar: 'ember', signedIn: false, privacy: 'friends',
    };
  }
  function saveProfile(p) { set('profile', p); }

  function mergeDeep(base, over) {
    if (over === null || over === undefined) return base;
    if (Array.isArray(base) || Array.isArray(over) || typeof base !== 'object' || typeof over !== 'object') return over;
    const out = Object.assign({}, base);
    for (const k of Object.keys(over)) out[k] = k in base ? mergeDeep(base[k], over[k]) : over[k];
    return out;
  }

  // resume snapshot (last safe local snapshot)
  function saveSnapshot(snap) { return set('snapshot', snap); }
  function loadSnapshot() { return get('snapshot', null); }
  function clearSnapshot() { del('snapshot'); }

  // Cloud-save conflict (another device saved first): the better of both
  // progress records so neither device loses anything — per stage the goal met
  // on either side and the higher best/stars, every lesson, achievement
  // (earliest unlock), daily and challenge completion, the larger lifetime
  // stats; the running win streak stays this device's.
  function mergeProgress(local, remote) {
    const a = mergeDeep(JSON.parse(JSON.stringify(DEFAULT_PROGRESS)), local || {});
    const b = mergeDeep(JSON.parse(JSON.stringify(DEFAULT_PROGRESS)), remote || {});
    const out = JSON.parse(JSON.stringify(a));
    for (const [id, r] of Object.entries(b.journey)) {
      const l = out.journey[id];
      out.journey[id] = !l ? r : Object.assign({}, r, l, {
        goalMet: !!(l.goalMet || r.goalMet),
        best: Math.max(l.best || 0, r.best || 0),
        stars: Math.max(l.stars || 0, r.stars || 0),
      });
    }
    for (const [id, r] of Object.entries(b.challenges)) {
      const l = out.challenges[id];
      out.challenges[id] = !l ? r : { completed: !!(l.completed || r.completed), best: Math.max(l.best || 0, r.best || 0) };
    }
    Object.assign(out.tutorials, b.tutorials, a.tutorials);
    for (const [k, at] of Object.entries(b.achievements)) {
      out.achievements[k] = out.achievements[k] ? Math.min(out.achievements[k], at) : at;
    }
    for (const k of ['roundsPlayed', 'wins', 'bestWinStreak', 'actionCardsUsed']) {
      out.stats[k] = Math.max(Number(a.stats[k]) || 0, Number(b.stats[k]) || 0);
    }
    out.stats.dailyCompleted = Object.assign({}, b.stats.dailyCompleted, a.stats.dailyCompleted);
    out.mastery.points = Math.max(Number(a.mastery.points) || 0, Number(b.mastery.points) || 0);
    return out;
  }

  global.CEStore = {
    mergeProgress,
    NS, SETTINGS_VERSION, PROGRESS_VERSION,
    get, set, del, wrap, unwrap, checksum, mergeDeep,
    DEFAULT_SETTINGS, loadSettings, saveSettings,
    DEFAULT_PROGRESS, loadProgress, saveProgress,
    loadProfile, saveProfile,
    saveSnapshot, loadSnapshot, clearSnapshot,
  };
})(typeof window !== 'undefined' ? window : globalThis);
