// platform.test.mjs — js/platform.js (window.CEPlatform) over starhermit-sdk.js
// with a stubbed fetch and launch fragment: token read, profile nickname,
// cloud save round-trip on game:<slug>, settings KV patch, bindings, invite
// link, and no network at all when standalone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { installHosted, installStandalone, UID } from './starhermit-harness.mjs';

const SLUG = 'color-eights';
const SRC = readFileSync(new URL('../js/platform.js', import.meta.url), 'utf8');
function loadPlatform(win, sdk) {
  win.StarHermit = sdk;
  win.document = globalThis.document;
  new Function('window', SRC)(win);
  return win.CEPlatform;
}

test('hosted: token, profile, cloud save game:<slug>, settings, bindings, invite', async () => {
  const { sdk, env, win } = installHosted(SLUG);
  const P = loadPlatform(win, sdk);
  assert.equal(sdk.userId, UID);
  assert.ok(!/game_token/.test(win.history.url || ''), 'fragment stripped');
  assert.equal(P.init(), true);
  assert.equal(P.slug, SLUG);
  assert.equal(P.getLaunchToken(), sdk.token);
  assert.equal((await P.fetchProfile()).name, 'Ada');

  assert.equal(await P.loadCloud(), null);
  P.saveCloud({ settings: { version: 2, data: { a: 1 } }, progress: null });
  assert.equal(await P.flushSave(), true);
  const put = env.calls.find((c) => c.method === 'PUT');
  assert.ok(put.url.endsWith('/cloud-saves/game%3Acolor-eights'), put.url);
  assert.deepEqual(await P.loadCloud(), { settings: { version: 2, data: { a: 1 } }, progress: null });
  assert.equal(P.sync, 'synced');

  assert.deepEqual(await P.getSettings(), {}, 'only preference groups pass');
  P.mirrorSettings({ audio: { music: 0.1 }, tutorialDone: { a: true } });
  await new Promise((r) => setTimeout(r, 900));
  const patch = env.calls.find((c) => c.method === 'PATCH');
  assert.deepEqual(JSON.parse(patch.init.body).settings, { audio: { music: 0.1 } });

  await P.loadBindings();
  assert.equal(P.actionFor({ code: 'KeyD' }), 'draw');
  assert.equal(P.actionFor({ code: 'Escape' }), 'cancel');
  assert.equal(P.inviteLink(), `https://dashboard.starhermit.com/game-invite/${UID}/${SLUG}`);
  assert.equal(P.canSignIn(), false);
});

test('standalone: no token, no network', async () => {
  const st = installStandalone();
  try {
    const P = loadPlatform(globalThis.window, st.sdk);
    assert.equal(P.init(), false);
    assert.equal(P.hosted, false);
    assert.equal(await P.loadCloud(), null);
    await P.saveCloud({});
    await P.flushSave();
    assert.deepEqual(await P.getSettings(), {});
    P.mirrorSettings({ audio: {} });
    await P.loadBindings();
    assert.equal(P.actionFor({ code: 'KeyU' }), 'undo');
    assert.equal(P.inviteLink(), null);
    assert.deepEqual(P.headers(), {});
    assert.deepEqual(st.calls, []);
  } finally { st.restore(); }
});
