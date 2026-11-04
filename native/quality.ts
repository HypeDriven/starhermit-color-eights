// The look per graphics level. The engine-owned effects come from the frame's
// level (levelSettings()): shadows and their map size, ambient occlusion
// (resolution and samples), bloom resolution, the grade and anti-aliasing.
// The game's own art (materials, card and felt textures, round-geometry LOD,
// reflections, the detailed table and its ambience) stays keyed by the
// quality tier (frame().quality), as the browser build's presets were
// (js/gfx.js BUDGETS, each tuned to hold 60 FPS on the weakest GPU Auto gave
// it). The dust motes scale with the level's particle budget against the
// tier's anchor level (quantum, molecular, terrestrial, galactic), at most
// four times the tier's budget. The game sets the shadow-map size itself: at
// engine.minor 23 and up the runtime keeps a light's mapSize whatever the
// level. The runtime owns the rest of what the old Graphics tab did: Auto and
// the level choice, render scale and the pixel-ratio cap, adaptive
// resolution, the frame-rate limit and readout. The per-category overrides of
// the old tab are not offered (the runtime's Options choose a level).
import { levelSettings, type GraphicsLevel, type LevelSettings, type QualityTier } from "starhermit:engine";
import type { AntialiasMode } from "starhermit:scene";

export type Preset = QualityTier;
export interface Budget {
  /** Table, felt, rim, floor and cards: Lambert, standard PBR, or physical (clearcoat cards and rim). */
  material: "lambert" | "standard" | "physical";
  /** Card-face canvas width in px (the face is 1.5× as tall), at most the level's texture size. */
  cardTexture: number;
  /** Felt-fibre and wood-grain canvas width in px, at most the level's texture size. */
  feltTexture: number;
  /** Round-geometry LOD: table, felt and rim segments (at least 40 around), card corners and bevel. */
  segments: number;
  /** Lamp-light dust motes. */
  motes: number;
}
export interface Look {
  preset: Preset;
  /** The level's shadow-map size; 0: no shadows. */
  shadows: number;
  /** The level's ambient occlusion; null: off. */
  ao: { resolution: number; samples: number; denoiseSamples: number } | null;
  /** The level's bloom resolution; null: no bloom. */
  bloom: number | null;
  grade: boolean;
  antialias: AntialiasMode;
  /** RoomEnvironment reflections (clearcoat on the cards and rim). */
  reflections: boolean;
  /** Felt fibres with the printed ring, wood grain, rounded textured cards, far lamps, the detailed 2D cards. */
  detailed: boolean;
  /** The breathing colour glow, lamp flicker and twinkling far lamps. */
  ambience: boolean;
  budget: Budget;
}

type Art = Pick<Look, "reflections" | "detailed" | "ambience">;
const ART: Record<Preset, Art> = {
  low: { reflections: false, detailed: false, ambience: false },
  balanced: { reflections: true, detailed: true, ambience: true },
  high: { reflections: true, detailed: true, ambience: true },
  ultra: { reflections: true, detailed: true, ambience: true },
};
const BUDGETS: Record<Preset, Budget> = {
  low: { material: "lambert", cardTexture: 128, feltTexture: 256, segments: 0.5, motes: 0 },
  balanced: { material: "standard", cardTexture: 128, feltTexture: 256, segments: 0.75, motes: 40 },
  high: { material: "physical", cardTexture: 256, feltTexture: 512, segments: 1, motes: 120 },
  ultra: { material: "physical", cardTexture: 384, feltTexture: 1024, segments: 1.5, motes: 180 },
};
/** The browser build's Particles cap: Balanced's "low" tier 60, High and Ultra 600. */
const MOTE_CAP: Record<Preset, number> = { low: 0, balanced: 60, high: 600, ultra: 600 };
export const MAX_MOTES = 600;
/** Each tier's anchor level: its budgets are tuned for it. */
const ANCHOR: Record<Preset, GraphicsLevel> = { low: "quantum", balanced: "molecular", high: "terrestrial", ultra: "galactic" };

/** The look for a graphics level (default: this frame's). */
export function lookFor(s: LevelSettings = levelSettings()): Look {
  const preset = s.quality;
  const b = BUDGETS[preset];
  // The level's particle budget doubles a level: the motes grow with it
  // above the tier's anchor, at most four times the tier's budget.
  const k = Math.min(4, Math.max(1, s.particles / levelSettings(ANCHOR[preset]).particles));
  return {
    preset, ...ART[preset],
    shadows: s.shadows ? s.shadowMapSize : 0,
    ao: s.ao && { resolution: s.ao.resolution, samples: s.ao.samples, denoiseSamples: s.ao.denoiseSamples },
    bloom: s.bloom ? s.bloom.resolution : null,
    grade: s.grade,
    // Engine issue (1.36.1, reported 2026-11-04; fix due in 1.36.2): antialias "off" recolours fog,
    // haze and translucent overlays, so Low keeps the MSAA it always had until that release.
    antialias: s.antialias === "off" ? "msaa" : s.antialias,
    budget: {
      ...b,
      cardTexture: Math.min(b.cardTexture, s.maxTextureSize),
      feltTexture: Math.min(b.feltTexture, s.maxTextureSize),
      motes: Math.min(MOTE_CAP[preset], Math.round(b.motes * k)),
    },
  };
}
