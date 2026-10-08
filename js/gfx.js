/* Color Eights — graphics quality model: presets, per-category overrides, GPU detection, cost summary.
 * Pure (no three.js, no DOM) so the settings panel, the renderer and the unit tests agree on what a
 * setting means. Browser: window.CEGfx; Node: globalThis.CEGfx. */
(function (global) {
  'use strict';

  const PRESETS = ['low', 'balanced', 'high', 'ultra'];

  // Category → allowed tiers, cheapest first.
  const CATEGORIES = {
    shadows: ['off', 'low', 'medium', 'high'],
    ao: ['off', 'on', 'high'],
    bloom: ['off', 'on'],
    grade: ['off', 'on'],
    antialias: ['off', 'fxaa', 'smaa', 'msaa'],
    reflections: ['off', 'on'],
    detail: ['plain', 'detailed'],
    particles: ['off', 'low', 'high'],
    background: ['static', 'animated'],
  };

  // Each preset is a row of tiers, a render scale (multiplies the capped device pixel ratio) and a
  // pixel-ratio cap so Low never renders more pixels than the game did before the upgrade.
  const TABLE = {
    low: { scale: 1, cap: 1, shadows: 'off', ao: 'off', bloom: 'off', grade: 'off', antialias: 'msaa', reflections: 'off', detail: 'plain', particles: 'off', background: 'static' },
    balanced: { scale: 1, cap: 1.5, shadows: 'low', ao: 'off', bloom: 'on', grade: 'on', antialias: 'fxaa', reflections: 'on', detail: 'detailed', particles: 'low', background: 'animated' },
    high: { scale: 1, cap: 2, shadows: 'medium', ao: 'on', bloom: 'on', grade: 'on', antialias: 'smaa', reflections: 'on', detail: 'detailed', particles: 'high', background: 'animated' },
    ultra: { scale: 1.25, cap: 2, shadows: 'high', ao: 'high', bloom: 'on', grade: 'on', antialias: 'msaa', reflections: 'on', detail: 'detailed', particles: 'high', background: 'animated' },
  };

  const SHADOW_MAP = { off: 0, low: 512, medium: 1024, high: 2048 };
  const PARTICLE_COUNT = { off: 0, low: 60, high: 180 };

  /** Best preset for this GPU from the unmasked renderer string. Touch devices cap Auto at balanced. */
  function detectPreset(gpu, touch) {
    const g = String(gpu || '').toLowerCase();
    let p = 'balanced';
    if (/swiftshader|llvmpipe|softpipe|software|basic render|microsoft basic/.test(g)) p = 'low';
    else if (/nvidia|geforce|rtx|gtx|quadro|radeon rx|radeon pro|amd radeon(?!.*graphics)|apple m\d/.test(g)) p = 'high';
    if (touch && p === 'high') p = 'balanced';
    return p;
  }

  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }

  /**
   * Resolve saved settings into concrete tiers.
   * saved: { preset: 'auto'|preset, render_scale, adaptive, show_fps, <category>: 'preset'|tier }.
   */
  function resolve(saved, detected) {
    const s = saved || {};
    const auto = !PRESETS.includes(s.preset);
    const preset = auto ? (PRESETS.includes(detected) ? detected : 'balanced') : s.preset;
    const row = TABLE[preset];
    const out = {
      preset, auto,
      renderScale: clamp(Number(s.render_scale) || 1, 0.5, 2),
      cap: row.cap,
    };
    out.scale = row.scale * out.renderScale;
    for (const cat of Object.keys(CATEGORIES)) {
      out[cat] = CATEGORIES[cat].includes(s[cat]) ? s[cat] : row[cat];
    }
    out.adaptive = s.adaptive !== false;
    out.showFps = !!s.show_fps;
    // The composer runs only when an effect needs it; otherwise the canvas (native MSAA) is used.
    out.post = out.ao !== 'off' || out.bloom === 'on' || out.grade === 'on' || out.antialias === 'fxaa' || out.antialias === 'smaa';
    return out;
  }

  /** The preset's own tier for a category (for "From preset (…)" labels). */
  function presetTier(preset, cat) {
    return TABLE[preset] ? TABLE[preset][cat] : undefined;
  }

  /** Choosing a preset clears every per-category override (keeps scale / adaptive / fps). */
  function withPreset(saved, preset) {
    const out = {};
    const s = saved || {};
    for (const k of ['render_scale', 'adaptive', 'show_fps']) if (k in s) out[k] = s[k];
    out.preset = PRESETS.includes(preset) ? preset : 'auto';
    return out;
  }

  const EN = {
    noShadows: 'no shadows', shadows: '{n}² shadows', ao: 'ambient occlusion', aoHigh: 'full ambient occlusion',
    bloom: 'bloom', reflections: 'reflections', particles: 'particles', noAA: 'no anti-aliasing',
  };

  /** One-line cost summary. `words` lets the UI pass localized fragments. */
  function describe(r, pixels, words) {
    const w = Object.assign({}, EN, words || {});
    const parts = [
      r.shadows === 'off' ? w.noShadows : w.shadows.replace('{n}', SHADOW_MAP[r.shadows]),
      r.ao === 'off' ? null : r.ao === 'high' ? w.aoHigh : w.ao,
      r.bloom === 'on' ? w.bloom : null,
      r.reflections === 'on' ? w.reflections : null,
      r.particles !== 'off' ? w.particles : null,
      r.antialias === 'off' ? w.noAA : r.antialias.toUpperCase(),
      pixels ? pixels[0] + '×' + pixels[1] + ' px' : null,
    ];
    return parts.filter(Boolean).join(' · ');
  }

  global.CEGfx = { PRESETS, CATEGORIES, SHADOW_MAP, PARTICLE_COUNT, detectPreset, resolve, presetTier, withPreset, describe, clamp };
})(typeof window !== 'undefined' ? window : globalThis);
