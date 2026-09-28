/* Color Eights — graphics quality model unit tests. Run: node --test tests/gfx.test.mjs */
import test from 'node:test';
import assert from 'node:assert/strict';
await import('../js/gfx.js');
const G = globalThis.CEGfx;

test('detectPreset: software renderers get low', () => {
  assert.equal(G.detectPreset('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)'), 'low');
  assert.equal(G.detectPreset('llvmpipe (LLVM 15.0.7, 256 bits)'), 'low');
  assert.equal(G.detectPreset('Microsoft Basic Render Driver'), 'low');
});

test('detectPreset: discrete GPUs and Apple M get high, integrated/unknown balanced', () => {
  assert.equal(G.detectPreset('ANGLE (NVIDIA, NVIDIA GeForce RTX 3070 Direct3D11 vs_5_0 ps_5_0)'), 'high');
  assert.equal(G.detectPreset('AMD Radeon RX 6800'), 'high');
  assert.equal(G.detectPreset('Apple M2 Pro'), 'high');
  assert.equal(G.detectPreset('ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11)'), 'balanced');
  assert.equal(G.detectPreset('AMD Radeon Graphics'), 'balanced');
  assert.equal(G.detectPreset('Mali-G78'), 'balanced');
  assert.equal(G.detectPreset(''), 'balanced');
});

test('detectPreset: touch devices cap Auto at balanced', () => {
  assert.equal(G.detectPreset('Apple M1', true), 'balanced');
  assert.equal(G.detectPreset('SwiftShader', true), 'low');
});

test('resolve: auto follows detection, explicit preset wins', () => {
  const a = G.resolve({}, 'low');
  assert.equal(a.preset, 'low'); assert.equal(a.auto, true); assert.equal(a.post, false);
  assert.equal(a.shadows, 'off'); assert.equal(a.particles, 'off'); assert.equal(a.cap, 1);
  const h = G.resolve({ preset: 'high' }, 'low');
  assert.equal(h.preset, 'high'); assert.equal(h.auto, false); assert.equal(h.post, true);
  assert.equal(h.shadows, G.presetTier('high', 'shadows'));
  assert.equal(G.resolve({ preset: 'bogus' }, 'ultra').preset, 'ultra');
});

test('resolve: per-category overrides apply, invalid tiers fall back to the preset', () => {
  const r = G.resolve({ preset: 'low', bloom: 'on', shadows: 'nope', detail: 'detailed' }, 'low');
  assert.equal(r.bloom, 'on'); assert.equal(r.post, true);
  assert.equal(r.shadows, 'off'); assert.equal(r.detail, 'detailed');
  assert.equal(G.resolve({ preset: 'high', antialias: 'msaa', ao: 'off', bloom: 'off', grade: 'off' }).post, false);
});

test('resolve: render scale clamps to 50–200% and multiplies the preset scale', () => {
  assert.equal(G.resolve({ preset: 'high', render_scale: 5 }).renderScale, 2);
  assert.equal(G.resolve({ preset: 'high', render_scale: 0.1 }).renderScale, 0.5);
  assert.equal(G.resolve({ preset: 'ultra', render_scale: 1 }).scale, 1.25);
  const d = G.resolve({});
  assert.equal(d.adaptive, true); assert.equal(d.showFps, false);
  assert.equal(G.resolve({ adaptive: false, show_fps: true }).adaptive, false);
});

test('withPreset clears category overrides but keeps scale/adaptive/fps', () => {
  const next = G.withPreset({ preset: 'high', bloom: 'off', shadows: 'high', render_scale: 1.5, adaptive: false, show_fps: true }, 'low');
  assert.deepEqual(next, { preset: 'low', render_scale: 1.5, adaptive: false, show_fps: true });
  assert.equal(G.withPreset({}, 'auto').preset, 'auto');
});

test('describe summarises cost and pixels', () => {
  const s = G.describe(G.resolve({ preset: 'high' }), [1280, 800]);
  assert.match(s, /1024² shadows/); assert.match(s, /bloom/); assert.match(s, /SMAA/); assert.match(s, /1280×800 px/);
  assert.match(G.describe(G.resolve({ preset: 'low' })), /no shadows/);
});

test('Graphics panel strings exist in every required locale', async () => {
  await import('../js/gfx-ui.js');
  const U = globalThis.CEGfxUI;
  const need = ['en-US', 'en-GB', 'es-419', 'es-ES', 'de-DE', 'fr-FR', 'fr-CA', 'pt-BR', 'it-IT'];
  const keys = Object.keys(U.STRINGS['en-US']);
  for (const loc of need) {
    assert.ok(U.STRINGS[loc], 'missing locale ' + loc);
    for (const k of keys) assert.ok(U.STRINGS[loc][k], loc + ' missing ' + k);
  }
  // every tier and category used by the model has a label
  for (const [cat, tiers] of Object.entries(G.CATEGORIES)) {
    assert.ok(keys.includes('c_' + cat), 'no label for ' + cat);
    for (const t of tiers) assert.ok(keys.includes('t_' + t), 'no label for tier ' + t);
  }
  assert.equal(U.pickLocale('es-MX'), 'es-419');
  assert.equal(U.pickLocale('fr-CA'), 'fr-CA');
  assert.equal(U.pickLocale('pt-PT'), 'pt-BR');
  assert.equal(U.pickLocale('ja-JP'), 'en-US');
});
