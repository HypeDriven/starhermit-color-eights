// The look per graphics level: the browser build's four presets and budgets
// (js/gfx.js TABLE / BUDGETS, each tuned to hold 60 FPS on the weakest GPU
// Auto gave it) keyed by the runtime's quality tier (frame().quality), with
// the dust motes scaled within the tier by the level (frame().levelIndex),
// as the browser build scaled them by its hardware level. The runtime owns
// the rest of what the old Graphics tab did: Auto and the level choice,
// render scale and the pixel-ratio cap, adaptive resolution, the frame-rate
// limit and readout, and the shadow-map size and MSAA samples it holds to
// the level. The per-category overrides of the old tab are not offered (the
// runtime's Options choose a level).
import type { QualityTier } from "starhermit:engine";
import type { AntialiasMode } from "starhermit:scene";

export type Preset = QualityTier;
export interface Budget {
  /** Table, felt, rim, floor and cards: Lambert, standard PBR, or physical (clearcoat cards and rim). */
  material: "lambert" | "standard" | "physical";
  /** Card-face canvas width in px (the face is 1.5× as tall). */
  cardTexture: number;
  /** Felt-fibre and wood-grain canvas width in px. */
  feltTexture: number;
  /** Round-geometry LOD: table, felt and rim segments (at least 40 around), card corners and bevel. */
  segments: number;
  /** Lamp-light dust motes. */
  motes: number;
  bloomRes: number;
  aoRes: number;
}
export interface Look {
  preset: Preset;
  shadows: 0 | 512 | 1024 | 2048;
  ao: "off" | "on" | "high";
  bloom: boolean;
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

const TABLE: Record<Preset, Omit<Look, "preset" | "budget">> = {
  low: { shadows: 0, ao: "off", bloom: false, grade: false, antialias: "msaa", reflections: false, detailed: false, ambience: false },
  balanced: { shadows: 512, ao: "off", bloom: true, grade: true, antialias: "fxaa", reflections: true, detailed: true, ambience: true },
  high: { shadows: 1024, ao: "on", bloom: true, grade: true, antialias: "smaa", reflections: true, detailed: true, ambience: true },
  ultra: { shadows: 2048, ao: "high", bloom: true, grade: true, antialias: "msaa", reflections: true, detailed: true, ambience: true },
};
const BUDGETS: Record<Preset, Budget> = {
  low: { material: "lambert", cardTexture: 128, feltTexture: 256, segments: 0.5, motes: 0, bloomRes: 0.5, aoRes: 0.5 },
  balanced: { material: "standard", cardTexture: 128, feltTexture: 256, segments: 0.75, motes: 40, bloomRes: 0.5, aoRes: 0.5 },
  high: { material: "physical", cardTexture: 256, feltTexture: 512, segments: 1, motes: 120, bloomRes: 0.5, aoRes: 0.5 },
  ultra: { material: "physical", cardTexture: 384, feltTexture: 1024, segments: 1.5, motes: 180, bloomRes: 1, aoRes: 1 },
};
/** The browser build's Particles cap: Balanced's "low" tier 60, High and Ultra 600. */
const MOTE_CAP: Record<Preset, number> = { low: 0, balanced: 60, high: 600, ultra: 600 };
export const MAX_MOTES = 600;
/** The first level index of each tier (quantum, molecular, terrestrial, galactic). */
const TIER_FLOOR: Record<Preset, number> = { low: 0, balanced: 2, high: 4, ultra: 7 };

/** The look for a quality tier at a level index (0 quantum … 9 infinite). */
export function lookFor(preset: Preset, levelIndex: number): Look {
  const b = { ...BUDGETS[preset] };
  // Levels are about 1.64× apart in GPU throughput: the motes grow with the
  // level above the tier's first, at most four times the tier's budget.
  const k = Math.min(4, Math.pow(1.64, Math.max(0, levelIndex - TIER_FLOOR[preset])));
  b.motes = Math.min(MOTE_CAP[preset], Math.round(b.motes * k));
  return { preset, ...TABLE[preset], budget: b };
}
