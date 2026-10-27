/* Color Eights — the save model, pure (no storage of its own): the engine
 * client (native/platform.ts) keeps the document in the runtime's save
 * (starhermit:storage `saves`, on the device and in the player's cloud slot)
 * and the game's options in its settings; the Node tests run this file as is.
 *
 * - The save document: { v: 1, progress, snapshot } — progress (journey goals
 *   and bests, lessons, achievements, stats, daily wins, challenges, mastery
 *   points) and the "Save & quit" snapshot of a round in progress.
 * - mergeDocs: two devices' saves after a cloud conflict — the better of both
 *   progress records (mergeProgress); the resumable round stays this device's.
 * - fromBrowserSave: the browser build's cloud save (the JS SDK's save.json:
 *   { settings, progress } as checksummed { version, data, updatedAt,
 *   checksum } documents) → its progress and the options this game keeps.
 * - The game's options (the colour palette, the practice table's Stacking
 *   and Draw-to-match), their checks, and the browser build's per-player
 *   settings groups they migrate from.
 * Classic script / CommonJS: global CEStore.
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.CEStore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var SETTINGS_VERSION = 2;
  var PROGRESS_VERSION = 2;
  var SAVE_VERSION = 1;

  var obj = function (v) { return v && typeof v === 'object' && !Array.isArray(v) ? v : null; };
  var clone = function (v) { return JSON.parse(JSON.stringify(v)); };

  /** FNV-1a over [version, data], as the browser build checksummed its documents. */
  function checksum(doc) {
    var str = JSON.stringify([doc.version, doc.data]);
    var h = 0x811c9dc5 >>> 0;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return ('00000000' + h.toString(16)).slice(-8);
  }
  function wrap(version, data, at) {
    var doc = { version: version, data: data, updatedAt: at || 0 };
    doc.checksum = checksum(doc);
    return doc;
  }
  /** A checksummed document's data; null when corrupt, missing or from a newer version. */
  function unwrap(doc, expectVersion) {
    if (!obj(doc)) return null;
    if (doc.version > expectVersion) return null;
    if (doc.checksum && doc.checksum !== checksum(doc)) return null;
    return doc.data;
  }
  function mergeDeep(base, over) {
    if (over === null || over === undefined) return base;
    if (Array.isArray(base) || Array.isArray(over) || typeof base !== 'object' || typeof over !== 'object' || base === null) return over;
    var out = Object.assign({}, base);
    Object.keys(over).forEach(function (k) { out[k] = k in base ? mergeDeep(base[k], over[k]) : over[k]; });
    return out;
  }

  var DEFAULT_PROGRESS = {
    journey: {},        // stageId -> { goalMet, best }
    tutorials: {},      // lessonId -> true
    achievements: {},   // key -> unlockedAt
    stats: { roundsPlayed: 0, wins: 0, winStreak: 0, bestWinStreak: 0, actionCardsUsed: 0, dailyCompleted: {} },
    mastery: { points: 0 },
    challenges: {},     // challengeId -> { completed, best }
  };
  /** Progress with every part present. */
  function normalizeProgress(p) {
    return mergeDeep(clone(DEFAULT_PROGRESS), obj(p) || {});
  }

  /* Cloud-save conflict (another device saved first): the better of both
   * progress records so neither device loses anything — per stage the goal met
   * on either side and the higher best/stars, every lesson, achievement
   * (earliest unlock), daily and challenge completion, the larger lifetime
   * stats; the running win streak stays this device's. */
  function mergeProgress(local, remote) {
    var a = normalizeProgress(local);
    var b = normalizeProgress(remote);
    var out = clone(a);
    Object.keys(b.journey).forEach(function (id) {
      var r = b.journey[id], l = out.journey[id];
      out.journey[id] = !l ? r : Object.assign({}, r, l, {
        goalMet: !!(l.goalMet || r.goalMet),
        best: Math.max(l.best || 0, r.best || 0),
        stars: Math.max(l.stars || 0, r.stars || 0),
      });
    });
    Object.keys(b.challenges).forEach(function (id) {
      var r = b.challenges[id], l = out.challenges[id];
      out.challenges[id] = !l ? r : { completed: !!(l.completed || r.completed), best: Math.max(l.best || 0, r.best || 0) };
    });
    Object.assign(out.tutorials, b.tutorials, a.tutorials);
    Object.keys(b.achievements).forEach(function (k) {
      var at = b.achievements[k];
      out.achievements[k] = out.achievements[k] ? Math.min(out.achievements[k], at) : at;
    });
    ['roundsPlayed', 'wins', 'bestWinStreak', 'actionCardsUsed'].forEach(function (k) {
      out.stats[k] = Math.max(Number(a.stats[k]) || 0, Number(b.stats[k]) || 0);
    });
    out.stats.dailyCompleted = Object.assign({}, b.stats.dailyCompleted, a.stats.dailyCompleted);
    out.mastery.points = Math.max(Number(a.mastery.points) || 0, Number(b.mastery.points) || 0);
    return out;
  }

  /* ---------------------------------------------------------- the save */
  function validSnapshot(s) {
    return obj(s) && typeof s.state === 'string' ? s : null;
  }
  /** A save document with every part present. */
  function normalizeDoc(d) {
    var doc = obj(d) || {};
    return { v: SAVE_VERSION, progress: normalizeProgress(doc.progress), snapshot: validSnapshot(doc.snapshot) };
  }
  /** The document in an engine save's data, or null when it is not one. */
  function docFromSave(data) {
    var d = obj(data);
    if (!d || d.v !== SAVE_VERSION || !obj(d.progress)) return null;
    return normalizeDoc(d);
  }
  /** Two devices' documents: progress merged, the resumable round this device's (else the other's). */
  function mergeDocs(remote, local) {
    var r = remote ? normalizeDoc(remote) : null, l = local ? normalizeDoc(local) : null;
    if (!r) return l || normalizeDoc({});
    if (!l) return r;
    return { v: SAVE_VERSION, progress: mergeProgress(l.progress, r.progress), snapshot: l.snapshot || r.snapshot };
  }

  /* ----------------------------------------------------- game settings */
  var PALETTES = ['standard', 'contrast', 'deuteranopia', 'tritanopia'];
  var bool = function (v) { return typeof v === 'boolean'; };
  var CHECKS = {
    palette: function (v) { return PALETTES.indexOf(v) >= 0; },
    stacking: bool,
    drawToMatch: bool,
  };
  var DEFAULT_SETTINGS = { palette: 'standard', stacking: false, drawToMatch: false };
  var GAME_SETTING_KEYS = Object.keys(CHECKS);
  /** The value when it is valid for the key, else undefined. */
  function checkSetting(key, v) {
    return CHECKS[key] && CHECKS[key](v) ? v : undefined;
  }
  /** The game's options among the browser build's settings groups
   * (accessibility.palette, rulesOptions.stacking / drawToMatch). */
  function gameSettingsFrom(groups) {
    var g = obj(groups) || {};
    var out = {};
    var a = obj(g.accessibility), r = obj(g.rulesOptions);
    if (a && checkSetting('palette', a.palette) !== undefined) out.palette = a.palette;
    if (r && bool(r.stacking)) out.stacking = r.stacking;
    if (r && bool(r.drawToMatch)) out.drawToMatch = r.drawToMatch;
    return out;
  }
  /** The browser build's per-player settings keys (the JS SDK's settings KV
   * groups, and sh-language.js's language choice, now the runtime's). */
  var BROWSER_SETTING_KEYS = ['audio', 'graphics', 'accessibility', 'camera', 'rulesOptions', 'ui.language', 'tutorialDone', 'consent'];

  /** The browser build's cloud save text → { progress, settings } (either null when absent or corrupt). */
  function fromBrowserSave(text) {
    if (typeof text !== 'string') return { progress: null, settings: null };
    var env = null;
    try { env = JSON.parse(text); } catch (e) { env = null; }
    if (!obj(env)) return { progress: null, settings: null };
    var p = unwrap(env.progress, PROGRESS_VERSION);
    var s = unwrap(env.settings, SETTINGS_VERSION);
    var settings = obj(s) ? gameSettingsFrom(s) : null;
    return { progress: obj(p) ? normalizeProgress(p) : null, settings: settings && Object.keys(settings).length ? settings : null };
  }

  return {
    SETTINGS_VERSION: SETTINGS_VERSION, PROGRESS_VERSION: PROGRESS_VERSION, SAVE_VERSION: SAVE_VERSION,
    checksum: checksum, wrap: wrap, unwrap: unwrap, mergeDeep: mergeDeep,
    DEFAULT_PROGRESS: DEFAULT_PROGRESS, normalizeProgress: normalizeProgress, mergeProgress: mergeProgress,
    normalizeDoc: normalizeDoc, docFromSave: docFromSave, mergeDocs: mergeDocs,
    PALETTES: PALETTES, DEFAULT_SETTINGS: DEFAULT_SETTINGS, GAME_SETTING_KEYS: GAME_SETTING_KEYS,
    checkSetting: checkSetting, gameSettingsFrom: gameSettingsFrom, BROWSER_SETTING_KEYS: BROWSER_SETTING_KEYS,
    fromBrowserSave: fromBrowserSave,
  };
});
