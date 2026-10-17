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
    balanced: { scale: 0.9, cap: 1.5, shadows: 'low', ao: 'off', bloom: 'on', grade: 'on', antialias: 'fxaa', reflections: 'on', detail: 'detailed', particles: 'low', background: 'animated' },
    high: { scale: 1, cap: 2, shadows: 'medium', ao: 'on', bloom: 'on', grade: 'on', antialias: 'smaa', reflections: 'on', detail: 'detailed', particles: 'high', background: 'animated' },
    ultra: { scale: 1.25, cap: 2, shadows: 'high', ao: 'high', bloom: 'on', grade: 'on', antialias: 'msaa', reflections: 'on', detail: 'detailed', particles: 'high', background: 'animated' },
  };

  const SHADOW_MAP = { off: 0, low: 512, medium: 1024, high: 2048 };
  const PARTICLE_COUNT = { off: 0, low: 60, high: 180 };

  // Auto picks the preset from the StarHermit hardware level (0 = Galaxy S20 / Intel UHD or weaker, 20 = RTX
  // 5090; js/gpu-level.js → window.StarHermitGpu): Low from 0, Balanced from 4, High from 10, Ultra from 17.
  // Phones, tablets and ≤ 4 GB machines are capped at level 9 (Balanced); software renderers are level 0.
  const PRESET_LEVELS = { low: 0, balanced: 4, high: 10, ultra: 17 };
  const gpuApi = () => global.StarHermitGpu;

  /** Hardware level (0–20) for an unmasked renderer string plus StarHermitGpu.detectSystem() facts. */
  function detectLevel(gpu, system) {
    const G = gpuApi();
    if (!G) return PRESET_LEVELS.balanced;
    return G.detectLevel(Object.assign({}, system || {}, { gpu: String(gpu || '') }));
  }
  /** The preset Auto starts from for a hardware level. */
  function presetForLevel(level) {
    const G = gpuApi();
    if (G) return G.presetForLevel(level, PRESET_LEVELS);
    return level >= 17 ? 'ultra' : level >= 10 ? 'high' : level >= 4 ? 'balanced' : 'low';
  }
  /** Best preset for a GPU (the hardware level already caps phones/tablets at Balanced). */
  function detectPreset(gpu, system) { return presetForLevel(detectLevel(gpu, system)); }

  /** Scale a count tuned at the preset's floor level up for faster GPUs (≤ 4×, never below the floor). */
  function scaleCount(n, preset, level) {
    const G = gpuApi();
    const floor = PRESET_LEVELS[preset] || 0;
    return Math.round(G ? G.scaleBudget(n, Math.max(Number(level) || 0, floor), floor) : n);
  }

  /*
   * Per-preset asset and effect budget. Each preset is tuned to hold 60 FPS on the weakest GPU Auto gives
   * it (Low → level 0, Balanced → 4, High → 10, Ultra → 17; measured with tests/gfx-bench.mjs).
   *   material     table, felt, rim, floor and cards: 'lambert' | 'standard' | 'physical' (clear-coat cards/rim);
   *   cardTexture  card-face canvas width in px (the face is 1.5× as tall);
   *   feltTexture  felt-fibre and wood-grain canvas width in px;
   *   segments     round-geometry LOD: multiplies table/felt/rim segments (min 40 around) and the card
   *                corner curve/bevel segments;
   *   motes        lamp-light dust motes at the floor level (the Particles tier caps them: off 0, low 60);
   *   bloomRes / aoRes  bloom and GTAO resolution as a fraction of the frame.
   */
  const BUDGETS = {
    low: { material: 'lambert', cardTexture: 128, feltTexture: 256, segments: 0.5, motes: 0, bloomRes: 0.5, aoRes: 0.5 },
    balanced: { material: 'standard', cardTexture: 128, feltTexture: 256, segments: 0.75, motes: 40, bloomRes: 0.5, aoRes: 0.5 },
    high: { material: 'physical', cardTexture: 256, feltTexture: 512, segments: 1, motes: 120, bloomRes: 0.5, aoRes: 0.5 },
    ultra: { material: 'physical', cardTexture: 384, feltTexture: 1024, segments: 1.5, motes: 180, bloomRes: 1, aoRes: 1 },
  };
  const MOTE_CAP = { off: 0, low: 60, high: 600 };

  /** A preset's concrete budget for a hardware level and Particles tier. */
  function budgetFor(preset, level, particles) {
    const b = Object.assign({}, BUDGETS[preset] || BUDGETS.balanced);
    b.motes = Math.min(MOTE_CAP[particles] ?? MOTE_CAP.high, scaleCount(b.motes, preset, level));
    return b;
  }

  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }

  /**
   * Resolve saved settings into concrete tiers.
   * saved: { preset: 'auto'|preset, render_scale, adaptive, show_fps, <category>: 'preset'|tier }.
   */
  function resolve(saved, detected, level) {
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
    out.level = level == null ? PRESET_LEVELS[preset] : level;
    out.budget = budgetFor(preset, out.level, out.particles);
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

  global.CEGfx = { PRESETS, CATEGORIES, SHADOW_MAP, PARTICLE_COUNT, PRESET_LEVELS, BUDGETS, MOTE_CAP, detectLevel, presetForLevel, budgetFor, detectPreset, resolve, presetTier, withPreset, describe, clamp };
})(typeof window !== 'undefined' ? window : globalThis);
