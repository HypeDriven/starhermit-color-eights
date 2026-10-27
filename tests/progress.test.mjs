// progress.test.mjs — js/store.js: the engine save document, two devices'
// saves merged, the browser build's cloud save (the JS SDK's save.json:
// { settings, progress } as checksummed documents) and its per-player
// settings groups migrated into the game's options.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const S = require('../js/store.js');

test('save conflict merge keeps the better of both devices', () => {
  const local = { journey: { j01: { goalMet: false, best: 40 } }, tutorials: { l1: true }, achievements: { 'first-win': 500 },
    stats: { roundsPlayed: 4, wins: 2, winStreak: 2, bestWinStreak: 2, dailyCompleted: { '2026-01-01': true } }, mastery: { points: 30 } };
  const remote = { journey: { j01: { goalMet: true, best: 10 }, j02: { goalMet: true, best: 70 } }, tutorials: { l2: true },
    achievements: { 'first-win': 100, century: 300 }, stats: { roundsPlayed: 9, wins: 1, winStreak: 0, bestWinStreak: 5, dailyCompleted: { '2026-01-02': true } },
    mastery: { points: 12 }, challenges: { 'ch-mono': { completed: true, best: 55 } } };
  const m = S.mergeProgress(local, remote);
  assert.equal(m.journey.j01.goalMet, true);
  assert.equal(m.journey.j01.best, 40);
  assert.equal(m.journey.j02.best, 70);
  assert.deepEqual(m.tutorials, { l1: true, l2: true });
  assert.deepEqual(m.achievements, { 'first-win': 100, century: 300 });
  assert.equal(m.stats.roundsPlayed, 9);
  assert.equal(m.stats.wins, 2);
  assert.equal(m.stats.winStreak, 2);
  assert.equal(m.stats.bestWinStreak, 5);
  assert.deepEqual(m.stats.dailyCompleted, { '2026-01-01': true, '2026-01-02': true });
  assert.equal(m.mastery.points, 30);
  assert.deepEqual(m.challenges['ch-mono'], { completed: true, best: 55 });
});

test('engine save documents merge; the resumable round stays this device\'s', () => {
  const snap = { sessionId: 's1', mode: 'journey', humanId: 'p0', state: '{"phase":"active"}', humanDraws: 0, replay: null, savedAt: 1 };
  const local = S.normalizeDoc({ v: 1, progress: { tutorials: { l1: true } }, snapshot: snap });
  const remote = S.normalizeDoc({ v: 1, progress: { tutorials: { l2: true } }, snapshot: { ...snap, mode: 'daily' } });
  const m = S.mergeDocs(remote, local);
  assert.equal(m.v, 1);
  assert.equal(m.snapshot.mode, 'journey');
  assert.deepEqual(m.progress.tutorials, { l1: true, l2: true });
  assert.equal(S.mergeDocs(remote, S.normalizeDoc({})).snapshot.mode, 'daily');
  assert.equal(S.docFromSave({ progress: {} }), null);
  assert.equal(S.docFromSave(null), null);
  assert.deepEqual(S.docFromSave({ v: 1, progress: {}, snapshot: { bad: 1 } }).snapshot, null);
  assert.equal(S.normalizeDoc({}).progress.stats.roundsPlayed, 0);
});

test('the browser build\'s cloud save migrates its progress and the game\'s options', () => {
  const progress = { journey: { j03: { goalMet: true, best: 77 } }, tutorials: { l1: true }, achievements: {}, stats: { wins: 3 }, mastery: { points: 77 }, challenges: {} };
  const settings = { audio: { music: 0.2 }, accessibility: { palette: 'deuteranopia', largeText: true }, rulesOptions: { stacking: true, drawToMatch: false } };
  const text = JSON.stringify({ settings: S.wrap(2, settings, 5), progress: S.wrap(2, progress, 5) });
  const r = S.fromBrowserSave(text);
  assert.equal(r.progress.journey.j03.best, 77);
  assert.equal(r.progress.stats.wins, 3);
  assert.equal(r.progress.stats.roundsPlayed, 0);
  assert.deepEqual(r.settings, { palette: 'deuteranopia', stacking: true, drawToMatch: false });
  // A corrupt checksum, a newer version or junk yield nothing.
  const bad = S.wrap(2, progress, 5); bad.data = { ...progress, mastery: { points: 1e9 } };
  assert.equal(S.fromBrowserSave(JSON.stringify({ progress: bad })).progress, null);
  assert.equal(S.fromBrowserSave(JSON.stringify({ progress: S.wrap(3, progress, 5) })).progress, null);
  assert.deepEqual(S.fromBrowserSave('not json'), { progress: null, settings: null });
  assert.deepEqual(S.fromBrowserSave(null), { progress: null, settings: null });
});

test('the game\'s options: checks and the legacy settings groups', () => {
  assert.equal(S.checkSetting('palette', 'tritanopia'), 'tritanopia');
  assert.equal(S.checkSetting('palette', 'neon'), undefined);
  assert.equal(S.checkSetting('stacking', 'yes'), undefined);
  assert.equal(S.checkSetting('drawToMatch', true), true);
  assert.equal(S.checkSetting('volume', 1), undefined);
  assert.deepEqual(S.gameSettingsFrom({ accessibility: { palette: 'contrast' }, rulesOptions: { drawToMatch: true } }), { palette: 'contrast', drawToMatch: true });
  assert.deepEqual(S.gameSettingsFrom(null), {});
  assert.deepEqual(S.GAME_SETTING_KEYS, ['palette', 'stacking', 'drawToMatch']);
  for (const k of ['audio', 'graphics', 'accessibility', 'camera', 'rulesOptions', 'ui.language']) assert.ok(S.BROWSER_SETTING_KEYS.includes(k));
});
