// The lamp-lit lounge on starhermit:scene, as the browser build's
// js/render.js drew it behind its DOM layer: the round felt table inside a
// lacquered wood rim under a pendant-lamp spotlight whose pool fades into a
// dark lounge, a dim rim light and hemisphere fill, the floor, distant warm
// lamp glows at the far wall, dust motes drifting in the lamp cone, and the
// cards mirroring the rules state — the last four discards scattered at the
// centre (the top one straight, dropping in as it is played), the draw-pile
// stack whose height follows the pile, a face-down fan per opponent (up to
// 14 cards), and a soft ring of the current colour glowing round the discard
// (the theme's accent on the title, where the four eights lie fanned beside
// a pile). The content theme sets the room's colours; the graphics level
// sets the look (quality.ts): materials, texture sizes, geometry detail,
// shadows, reflections, post effects, motes and ambient motion (the glow
// breathes, the lamp flickers by a few percent, the far lamps twinkle; all
// frozen with reduced motion). The camera never moves.
import {
  ACESFilmicToneMapping, AdditiveBlending, BoxGeometry, BufferAttribute, BufferGeometry, CanvasTexture, CircleGeometry, Color,
  CylinderGeometry, DirectionalLight, ExtrudeGeometry, Fog, HemisphereLight, Mesh, MeshBasicMaterial, MeshLambertMaterial,
  MeshPhysicalMaterial, MeshStandardMaterial, PMREMGenerator, PerspectiveCamera, PlaneGeometry, Points, PointsMaterial,
  RepeatWrapping, RoomEnvironment, SRGBColorSpace, Shape, SpotLight, TorusGeometry, renderer, scene,
  type Material, type Texture,
} from "starhermit:scene";
import { OffscreenCanvas, type OffscreenCanvasRenderingContext2D } from "starhermit:canvas";
import { Rules as R, type Card, type State, type Theme } from "./classic.ts";
import { SUIT, canvasGlyph, type GlyphName } from "./glyphs.ts";
import type { Look } from "./quality.ts";

// Card dimensions in world units (cards lie flat on the felt).
const CARD_W = 1.0, CARD_H = 1.5, CARD_D = 0.02;
const TY = -1.15;            // table-top height
const FELT_R = 3.85, RIM_R = 4.05;
const POOL = 72;
const PI = Math.PI;
/** three.js's physically based intensities in the engine's units (÷ π). */
const KEY_INTENSITY = 85 / PI;

const camera = new PerspectiveCamera(45, 16 / 9, 0.1, 100);
renderer.toneMapping = ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.camera = camera;

let look: Look | null = null;
let theme: Theme | null = null;
let reducedMotion = false;
let time = 0;

// ---------------------------------------------------------------- procedural textures
/** Seeded value noise so textures are identical every load. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = Math.imul(s ^ (s >>> 15), s | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function canvasTex(w: number, h: number, paint: (g: OffscreenCanvasRenderingContext2D, w: number, h: number) => void): Texture {
  const c = new OffscreenCanvas(w, h);
  paint(c.getContext("2d"), w, h);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
const texSize = (key: "cardTexture" | "feltTexture", fallback: number): number => look?.budget[key] ?? fallback;
function roundRect(g: OffscreenCanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

let feltTex: Texture | null = null, woodTex: Texture | null = null, backTex: Texture | null = null;
function feltTexture(): Texture {
  if (feltTex) return feltTex;
  const n = texSize("feltTexture", 512);
  feltTex = canvasTex(n, n, (g) => {
    g.scale(n / 512, n / 512);
    const w = 512, h = 512;
    g.fillStyle = "#ffffff"; g.fillRect(0, 0, w, h);
    const r = rng(7);
    // fibres: short light/dark strokes
    for (let i = 0; i < 9000; i++) {
      const x = r() * w, y = r() * h, a = r() * PI, l = 2 + r() * 5;
      g.strokeStyle = r() < 0.5 ? "rgba(0,0,0,0.07)" : "rgba(255,255,255,0.06)";
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
    }
    // printed ring around the discard spot + darker edge
    g.strokeStyle = "rgba(255,236,200,0.22)"; g.lineWidth = 3;
    g.beginPath(); g.arc(w / 2, h / 2, w * 0.2, 0, PI * 2); g.stroke();
    g.lineWidth = 1.5; g.beginPath(); g.arc(w / 2, h / 2, w * 0.215, 0, PI * 2); g.stroke();
    g.strokeStyle = "rgba(255,236,200,0.12)"; g.lineWidth = 2;
    g.beginPath(); g.arc(w / 2, h / 2, w * 0.46, 0, PI * 2); g.stroke();
    const vg = g.createRadialGradient(w / 2, h / 2, w * 0.3, w / 2, h / 2, w * 0.5);
    vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(0,0,0,0.35)");
    g.fillStyle = vg; g.fillRect(0, 0, w, h);
  });
  return feltTex;
}
function woodTexture(): Texture {
  if (woodTex) return woodTex;
  const n = texSize("feltTexture", 512);
  woodTex = canvasTex(n, n / 8, (g) => {
    g.scale(n / 512, n / 512);
    const w = 512, h = 64;
    g.fillStyle = "#ffffff"; g.fillRect(0, 0, w, h);
    const r = rng(11);
    for (let i = 0; i < 70; i++) {
      const y = r() * h, a = 0.05 + r() * 0.12;
      g.strokeStyle = "rgba(40,20,10," + a.toFixed(3) + ")"; g.lineWidth = 0.6 + r() * 2;
      g.beginPath(); g.moveTo(0, y);
      for (let x = 0; x <= w; x += 32) g.lineTo(x, y + Math.sin(x * 0.02 + i) * 2.5);
      g.stroke();
    }
  });
  woodTex.wrapS = woodTex.wrapT = RepeatWrapping;
  woodTex.repeat.set(6, 1);
  return woodTex;
}
function backTexture(): Texture {
  if (backTex) return backTex;
  const n = texSize("cardTexture", 128);
  backTex = canvasTex(n, n * 1.5, (g) => {
    g.scale(n / 128, n / 128);
    const w = 128, h = 192;
    g.fillStyle = "#241c2c"; g.fillRect(0, 0, w, h);
    g.strokeStyle = "#ff7a4d"; g.lineWidth = 3; roundRect(g, 8, 8, w - 16, h - 16, 10); g.stroke();
    g.save();
    roundRect(g, 10, 10, w - 20, h - 20, 8); g.clip();
    g.strokeStyle = "rgba(255,122,77,0.28)"; g.lineWidth = 1.2;
    for (let i = -h; i < w + h; i += 12) { g.beginPath(); g.moveTo(i, 14); g.lineTo(i + h, h - 14); g.stroke(); g.beginPath(); g.moveTo(i + h, 14); g.lineTo(i, h - 14); g.stroke(); }
    g.restore();
    g.fillStyle = "#241c2c"; g.beginPath(); g.ellipse(w / 2, h / 2, 30, 38, 0, 0, PI * 2); g.fill();
    g.strokeStyle = "#ffcf4d"; g.lineWidth = 2.5; g.stroke();
    g.fillStyle = "#ffcf4d"; g.font = "bold 44px sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText("8", w / 2, h / 2 + 2);
  });
  return backTex;
}
function radialTexture(stops: [number, string][]): Texture {
  return canvasTex(128, 128, (g, w, h) => {
    const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    for (const [o, c] of stops) gr.addColorStop(o, c);
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
}

/** The card's corner and centre mark: its rank, a kind symbol, or +2 / +4. */
type Mark = { text: string } | { glyph: GlyphName };
const KIND_MARK: Record<string, Mark> = { skip: { glyph: "skip" }, reverse: { glyph: "reverse" }, draw2: { text: "+2" }, wild: { glyph: "star" }, wild4: { text: "+4" } };
function markOf(card: Card): Mark | null { return card.kind === "number" ? { text: String(card.rank) } : KIND_MARK[card.kind] ?? null; }
function suitOf(card: Card): GlyphName { return card.color ? SUIT[R.COLOR_INFO[card.color].shape] ?? "star" : "star"; }
function drawMark(g: OffscreenCanvasRenderingContext2D, m: Mark, x: number, y: number, size: number, color: string): void {
  if ("text" in m) { g.fillStyle = color; g.font = `bold ${size}px sans-serif`; g.fillText(m.text, x, y); }
  else canvasGlyph(g, m.glyph, x, y, size * 0.42, color);
}
const faceTexCache = new Map<string, Texture>();
function faceTexture(card: Card, hex: string): Texture {
  const mark = markOf(card);
  const glyph = suitOf(card);
  const n = texSize("cardTexture", 128);
  const key = `${hex}|${JSON.stringify(mark)}|${glyph}|${card.color ? "" : "wild"}|${n}`;
  const hit = faceTexCache.get(key);
  if (hit) return hit;
  const tex = canvasTex(n, n * 1.5, (g) => {
    g.scale(n / 128, n / 128);
    const w = 128, h = 192;
    g.fillStyle = "#e6dccb"; g.fillRect(0, 0, w, h);
    if (card.color) {
      g.fillStyle = hex; roundRect(g, 7, 7, w - 14, h - 14, 12); g.fill();
    } else {
      const cols = ["#e1483c", "#2f7fe0", "#37a24a", "#e8b32a"];
      for (let i = 0; i < 4; i++) { g.fillStyle = cols[i]!; g.fillRect(7 + (i % 2) * (w - 14) / 2, 7 + (i >> 1) * (h - 14) / 2, (w - 14) / 2, (h - 14) / 2); }
    }
    const sheen = g.createLinearGradient(0, 0, w, h);
    sheen.addColorStop(0, "rgba(255,255,255,0.22)"); sheen.addColorStop(0.5, "rgba(255,255,255,0)"); sheen.addColorStop(1, "rgba(0,0,0,0.18)");
    g.fillStyle = sheen; roundRect(g, 7, 7, w - 14, h - 14, 12); g.fill();
    g.fillStyle = "rgba(238,230,218,0.9)"; g.beginPath(); g.ellipse(w / 2, h / 2, 38, 54, -0.45, 0, PI * 2); g.fill();
    g.textAlign = "center"; g.textBaseline = "middle";
    const ink = card.color ? hex : "#2c2433";
    if (mark) drawMark(g, mark, w / 2, h / 2 + 2, 50, ink); else canvasGlyph(g, glyph, w / 2, h / 2, 22, ink);
    g.shadowColor = "rgba(0,0,0,0.5)"; g.shadowBlur = 3;
    if (mark) drawMark(g, mark, 22, 24, 22, "#ffffff");
    canvasGlyph(g, glyph, 22, 46, 8, "#ffffff");
    g.save(); g.translate(w - 22, h - 24); g.rotate(PI);
    if (mark) drawMark(g, mark, 0, 0, 22, "#ffffff");
    canvasGlyph(g, glyph, 0, -22, 8, "#ffffff");
    g.restore();
  });
  faceTexCache.set(key, tex);
  return tex;
}

// ---------------------------------------------------------------- card geometry + materials
const seg = (n: number, min = 1): number => Math.max(min, Math.round(n * (look?.budget.segments ?? 1)));
let geoPlain: BufferGeometry | null = null, geoRound: BufferGeometry | null = null;
function cardGeometries(): void {
  // A box's groups are +x, -x, +y, -y, +z, -z: the top face (+y) shows the face material (0), the rest the edge (1).
  const box = new BoxGeometry(CARD_W, CARD_D, CARD_H);
  const idx = [1, 1, 0, 1, 1, 1];
  box.groups.forEach((gr, i) => { gr.materialIndex = idx[i]!; });
  geoPlain = box;
  const r = 0.09, w = CARD_W / 2, h = CARD_H / 2;
  const s = new Shape();
  s.moveTo(-w + r, -h); s.lineTo(w - r, -h); s.quadraticCurveTo(w, -h, w, -h + r);
  s.lineTo(w, h - r); s.quadraticCurveTo(w, h, w - r, h); s.lineTo(-w + r, h);
  s.quadraticCurveTo(-w, h, -w, h - r); s.lineTo(-w, -h + r); s.quadraticCurveTo(-w, -h, -w + r, -h);
  const geo = new ExtrudeGeometry(s, { depth: CARD_D * 0.6, bevelEnabled: true, bevelThickness: CARD_D * 0.2, bevelSize: 0.008, bevelSegments: Math.max(1, seg(2)), curveSegments: Math.max(2, seg(4)) });
  // Face UVs from the shape's coordinates; the cap faces +Z before the card is laid flat (−Y would be the back).
  const pos = geo.getAttribute("position")!.array as Float32Array;
  const uvAttr = geo.getAttribute("uv")!;
  const uv = uvAttr.array as Float32Array;
  for (let i = 0, j = 0; i < pos.length; i += 3, j += 2) { uv[j] = (pos[i]! + w) / CARD_W; uv[j + 1] = (pos[i + 1]! + h) / CARD_H; }
  uvAttr.needsUpdate = true;
  geo.rotateX(-PI / 2);
  geo.translate(0, -CARD_D * 0.5, 0);
  geoRound = geo;
}

interface LitParams { color?: string | number; map?: Texture | null; roughness?: number; metalness?: number; clearcoat?: number; clearcoatRoughness?: number }
/** Lit material for the level's budget: Lambert on Low, Standard on Balanced, Physical (where `physical`) on High and Ultra. */
function lit(p: LitParams, physical = false): Material {
  const kind = look?.budget.material ?? "physical";
  const base = { color: new Color(p.color ?? 0xffffff), map: p.map ?? null };
  if (kind === "lambert") return new MeshLambertMaterial(base);
  const std = { ...base, roughness: p.roughness ?? 1, metalness: p.metalness ?? 0 };
  if (physical && kind === "physical") return new MeshPhysicalMaterial({ ...std, clearcoat: look?.reflections ? p.clearcoat ?? 0 : 0, clearcoatRoughness: p.clearcoatRoughness ?? 0 });
  return new MeshStandardMaterial(std);
}
let edgeMat: Material | null = null;
const matCache = new Map<string, Material>();
function faceMaterial(card: Card | null, hex: string): Material {
  const detailed = !!look?.detailed;
  const key = detailed ? `d|${card ? `${card.kind}|${card.rank}|${card.color}` : "back"}|${hex}` : `p|${hex}`;
  const hit = matCache.get(key);
  if (hit) return hit;
  const m = detailed
    ? lit({ map: card ? faceTexture(card, hex) : backTexture(), roughness: 0.42, metalness: 0, clearcoat: 0.7, clearcoatRoughness: 0.12 }, true)
    : lit({ color: hex, roughness: 0.5 });
  if ("envMapIntensity" in m) (m as MeshStandardMaterial).envMapIntensity = look?.reflections ? 0.35 : 0;
  matCache.set(key, m);
  return m;
}

// ---------------------------------------------------------------- the scene
const hemi = new HemisphereLight(0x7040a0, 0x1a0c0e, 0.4 / PI);
// Pendant-lamp key light: a soft spot pool over the table; its shadow is fitted to the felt.
const keyLight = new SpotLight(0xffb28a, KEY_INTENSITY, 0, 0.53, 0.45, 2);
keyLight.position.set(0, TY + 7.5, 0.4);
keyLight.target.position.set(0, TY, 0);
keyLight.shadow.bias = -0.0004;
keyLight.shadow.normalBias = 0.02;
keyLight.shadow.camera.near = 4;
keyLight.shadow.camera.far = 11;
const rimLight = new DirectionalLight(0xfff2e0, 0.5 / PI);
rimLight.position.set(-6, 8, -3);
scene.add(hemi, keyLight, keyLight.target, rimLight);
scene.background = new Color("#160a0c");
scene.fog = new Fog("#160a0c", 16, 34);

let tableMat: Material, feltMat: Material, rimMat: Material, floorMat: Material;
const tableMeshes: Record<"body" | "felt" | "rim", Mesh> = {} as never;
function tableGeometry(part: "body" | "felt" | "rim"): BufferGeometry {
  if (part === "body") return new CylinderGeometry(RIM_R, RIM_R + 0.35, 0.7, seg(64, 40));
  if (part === "felt") return new CircleGeometry(FELT_R + 0.05, seg(64, 40));
  return new TorusGeometry(RIM_R - 0.06, 0.2, seg(16, 8), seg(96, 48));
}
const floor = new Mesh(new PlaneGeometry(80, 80));
floor.rotation.x = -PI / 2;
floor.position.y = TY - 2.6;
floor.receiveShadow = true;
scene.add(floor);
for (const part of ["body", "felt", "rim"] as const) {
  const m = new Mesh(new BoxGeometry(1, 1, 1));
  tableMeshes[part] = m;
  scene.add(m);
}
tableMeshes.body.position.y = TY - 0.38;
tableMeshes.felt.rotation.x = -PI / 2;
tableMeshes.felt.position.y = TY;
tableMeshes.rim.rotation.x = -PI / 2;
tableMeshes.rim.position.y = TY + 0.02;
tableMeshes.rim.castShadow = true;
for (const m of Object.values(tableMeshes)) m.receiveShadow = true;

// the current-colour glow under the discard pile (bright enough to bloom)
const glowTex = radialTexture([[0, "rgba(255,255,255,0.0)"], [0.42, "rgba(255,255,255,0.0)"], [0.55, "rgba(255,255,255,0.9)"], [0.68, "rgba(255,255,255,0.35)"], [1, "rgba(255,255,255,0)"]]);
const glowMat = new MeshBasicMaterial({ map: glowTex, color: 0xe1483c, transparent: true, depthWrite: false, blending: AdditiveBlending, fog: false });
const glow = new Mesh(new PlaneGeometry(3.4, 3.4), glowMat);
glow.rotation.x = -PI / 2;
glow.position.set(0, TY + 0.004, 0.1);
glow.noAO = true;
glow.renderOrder = 1;
scene.add(glow);
let glowHex = "#ff7a4d";

// distant lounge lamps (bokeh) at the far wall
const dotTex = radialTexture([[0, "rgba(255,255,255,1)"], [0.25, "rgba(255,255,255,0.8)"], [0.6, "rgba(255,255,255,0.12)"], [1, "rgba(255,255,255,0)"]]);
const bokeh: { mesh: Mesh; mat: MeshBasicMaterial; phase: number }[] = [];
for (const [i, p] of ([[-14, -1.6, -16], [-8, -1.2, -19], [-2.5, -1.8, -21], [3.5, -1.3, -20], [9, -1.7, -18], [14.5, -1.2, -16]] as const).entries()) {
  const mat = new MeshBasicMaterial({ map: dotTex, color: new Color(0xffb070).multiplyScalar(1.2), transparent: true, depthWrite: false, blending: AdditiveBlending, fog: false });
  const m = new Mesh(new PlaneGeometry(1.3, 1.3), mat);
  m.position.set(p[0], p[1], p[2]);
  m.noAO = true;
  bokeh.push({ mesh: m, mat, phase: i * 1.7 });
  scene.add(m);
}

// the draw-pile body (scaled to the pile's size) and the pool of card meshes
const drawStack = new Mesh(new BoxGeometry(CARD_W * 0.98, 1, CARD_H * 0.98));
drawStack.castShadow = true; drawStack.receiveShadow = true;
drawStack.visible = false;
scene.add(drawStack);
interface PoolCard { mesh: Mesh<Material[]>; key: string }
const cardMeshes: PoolCard[] = [];
for (let i = 0; i < POOL; i++) {
  const blank = new MeshBasicMaterial();
  const mesh = new Mesh<Material[]>(new BoxGeometry(CARD_W, CARD_D, CARD_H), [blank, blank]);
  mesh.visible = false;
  mesh.castShadow = true; mesh.receiveShadow = true;
  scene.add(mesh);
  cardMeshes.push({ mesh, key: "" });
}

// dust motes in the lamp light
let motes: Points | null = null;
let moteBase: Float32Array | null = null, moteSeed: Float32Array | null = null;
function buildMotes(count: number): void {
  if (motes) { scene.remove(motes); motes = null; }
  if (!count) return;
  const r = rng(3);
  const pos = new Float32Array(count * 3), seed = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    // inside the lamp's light cone: narrower towards the lamp
    const hgt = r() * 5, a = r() * PI * 2, d = Math.sqrt(r()) * 3.0 * (1 - hgt / 7.5);
    pos[i * 3] = Math.cos(a) * d; pos[i * 3 + 1] = TY + 0.3 + hgt; pos[i * 3 + 2] = 0.4 + Math.sin(a) * d;
    seed[i] = r() * 100;
  }
  const geo = new BufferGeometry();
  geo.setAttribute("position", new BufferAttribute(pos, 3));
  moteBase = pos.slice();
  moteSeed = seed;
  motes = new Points(geo, new PointsMaterial({ map: dotTex, color: 0xffd8b0, size: 0.05, transparent: true, opacity: 0.4, depthWrite: false, blending: AdditiveBlending, fog: false }));
  scene.add(motes);
}
function animateMotes(t: number): void {
  if (!motes || !moteBase || !moteSeed) return;
  const attr = motes.geometry.getAttribute("position")!;
  const p = attr.array as Float32Array, b = moteBase, s = moteSeed;
  for (let i = 0; i < s.length; i++) {
    const k = s[i]!;
    p[i * 3] = b[i * 3]! + Math.sin(t * 0.21 + k) * 0.35;
    p[i * 3 + 1] = TY + 0.3 + ((b[i * 3 + 1]! - TY - 0.3 + t * 0.08 + k * 0.01) % 5);
    p[i * 3 + 2] = b[i * 3 + 2]! + Math.cos(t * 0.17 + k * 1.3) * 0.35;
  }
  attr.needsUpdate = true;
}

// ---------------------------------------------------------------- the look and theme
let envTex: Texture | null = null;
/** Rebuilds what the look decides: materials, textures, geometry detail, shadows, reflections, motes. */
function build(): void {
  if (!look) return;
  feltTex = woodTex = backTex = null;
  faceTexCache.clear();
  matCache.clear();
  const detailed = look.detailed;
  tableMat = lit({ color: "#3a1a16", roughness: 0.8 });
  feltMat = lit({ color: "#5a2320", roughness: 0.95, map: detailed ? feltTexture() : null });
  rimMat = lit({ color: "#6b3a26", roughness: 0.45, clearcoat: 0.8, clearcoatRoughness: 0.2, map: detailed ? woodTexture() : null }, true);
  floorMat = lit({ color: "#1a0c0e", roughness: 0.9 });
  edgeMat = lit({ color: "#cfc5b4", roughness: 0.8 });
  tableMeshes.body.geometry = tableGeometry("body");
  tableMeshes.felt.geometry = tableGeometry("felt");
  tableMeshes.rim.geometry = tableGeometry("rim");
  tableMeshes.body.material = tableMat;
  tableMeshes.felt.material = feltMat;
  tableMeshes.rim.material = rimMat;
  floor.material = floorMat;
  drawStack.material = edgeMat;
  cardGeometries();
  for (const c of cardMeshes) c.key = "";
  const shadows = look.shadows > 0;
  renderer.shadowMap.enabled = shadows;
  keyLight.castShadow = shadows;
  if (shadows) keyLight.shadow.mapSize = look.shadows;
  // Image-based lighting for glossy cards and the lacquered rim, kept dim so the room stays dark.
  if (look.reflections) {
    if (!envTex) {
      try { envTex = new PMREMGenerator(renderer).fromScene(new RoomEnvironment(renderer), 0.04).texture; }
      catch (e) { console.warn("environment:", e instanceof Error ? e.message : String(e)); }
    }
    scene.environment = envTex;
  } else scene.environment = null;
  // The studio environment is far brighter than a dim lounge: each surface's fill stays subtle,
  // adding sheen and highlights without greying the room (the browser build's envMapIntensity).
  const env = (m: Material, k: number): void => { if ("envMapIntensity" in m) (m as MeshStandardMaterial).envMapIntensity = k; };
  env(rimMat, 0.3); env(feltMat, 0.06); env(tableMat, 0.12); env(floorMat, 0.02); env(edgeMat, 0.15);
  // Without image-based fill the hemisphere carries more of the ambient light.
  hemi.intensity = (scene.environment ? 0.4 : 0.9) / PI;
  for (const b of bokeh) b.mesh.visible = detailed;
  buildMotes(look.budget.motes);
  applyThemeColors();
  if (lastState !== undefined) sync(lastState, lastColorFor);
}
function applyThemeColors(): void {
  const t = theme;
  if (!t || !look) return;
  const fog = new Color(t.fog || "#160a0c");
  scene.background = fog;
  (scene.fog as Fog).color.copy(fog);
  const set = (m: Material, c: Color): void => { (m as MeshStandardMaterial).color.copy(c); };
  set(feltMat, new Color(t.felt));
  set(tableMat, new Color(t.table));
  set(rimMat, new Color(t.table).lerp(new Color("#9a6040"), 0.45));
  set(floorMat, new Color(t.floor).multiplyScalar(0.5));
  keyLight.color.set(t.key);
  hemi.color.set(t.fill);
  hemi.groundColor.set(t.floor || "#1a0c0e");
  for (const b of bokeh) b.mat.color.set(t.key).multiplyScalar(1.2);
}
/** A content theme (CEContent.THEMES): background and fog, felt, table, rim, floor, lamp and fill. */
export function setTheme(t: Theme): void {
  if (theme && theme.id === t.id) return;
  theme = t;
  applyThemeColors();
  if (lastState === null) decorativeSpread();
}
export function applyLook(next: Look): void {
  if (look && JSON.stringify(look) === JSON.stringify(next)) return;
  look = next;
  renderer.ao = next.ao === "off" ? null : {
    blendIntensity: 0.75, radius: 0.5, distanceExponent: 1.5, thickness: 1.0, scale: 1.0, samples: next.ao === "high" ? 16 : 8, resolution: next.budget.aoRes,
    denoise: { lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: next.ao === "high" ? 6 : 4, rings: 2, samples: next.ao === "high" ? 16 : 8, radiusExponent: 2 },
  };
  // Bloom limited to the glow ring, the far lamps and the brightest highlights.
  renderer.bloom = next.bloom ? { strength: 0.5, radius: 0.45, threshold: 0.92, resolution: next.budget.bloomRes } : null;
  // The browser build's grade pass: a gentle S-curve, +10 % saturation, warm highlights / cool shadows, the 0.3 vignette.
  renderer.grade = next.grade ? {
    space: "display", contrast: 0.12, saturation: 1.1,
    shadows: [0.95, 0.97, 1.05], highlights: [1.05, 1.0, 0.94], split: [0.15, 0.8],
    vignette: { amount: 0.3, inner: 0.32, outer: 0.85 },
  } : null;
  renderer.antialias = next.antialias;
  build();
}
export function setReducedMotion(on: boolean): void { reducedMotion = on; }

// ---------------------------------------------------------------- state → table
function hash(str: string): number { let h = 0x811c9dc5; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h / 4294967296; }
let used = 0;
function put(card: Card | null, hex: string, x: number, y: number, z: number, rotY: number): Mesh<Material[]> | null {
  if (used >= cardMeshes.length || !geoPlain || !geoRound || !edgeMat) return null;
  const e = cardMeshes[used++]!;
  const detailed = !!look?.detailed;
  const key = (detailed ? "d" : "p") + (card ? card.id + hex : "back");
  if (e.key !== key) {
    e.mesh.geometry = detailed ? geoRound : geoPlain;
    e.mesh.material = [faceMaterial(card, card ? hex : "#241c2c"), edgeMat];
    e.key = key;
  }
  e.mesh.visible = true;
  e.mesh.position.set(x, TY + CARD_D / 2 + y, z);
  e.mesh.rotation.set(0, rotY, 0);
  return e.mesh;
}
function clearCards(): void {
  used = 0;
  for (const c of cardMeshes) c.mesh.visible = false;
  drawStack.visible = false;
}
function fan(seatX: number, seatZ: number, facing: number, count: number): void {
  const m = Math.min(count, 14);
  const spacing = Math.min(0.26, 2.4 / Math.max(1, m));
  const cos = Math.cos(facing), sin = Math.sin(facing);
  for (let j = 0; j < m; j++) {
    const off = j - (m - 1) / 2;
    const lx = off * spacing, lz = -Math.abs(off) * 0.03;
    put(null, "", seatX + lx * cos + lz * sin, j * 0.004, seatZ - lx * sin + lz * cos, facing + off * 0.05);
  }
}
function drawPile(n: number): void {
  if (n <= 0) return;
  const hgt = Math.min(0.36, Math.max(0.02, n * 0.0035));
  drawStack.visible = true;
  drawStack.scale.y = hgt;
  drawStack.position.set(-1.6, TY + hgt / 2, 0.15);
  drawStack.rotation.y = 0.06;
  put(null, "", -1.6, hgt, 0.15, 0.06);
}
function setGlow(hex: string): void {
  glowHex = hex;
  glowMat.color.set(hex).multiplyScalar(look?.bloom ? 1.3 : 0.9);
}

let lastState: State | null | undefined = undefined;
let lastColorFor: ((c: Card) => string) | null = null;
let topCardId: string | null = null;
let dropMesh: Mesh<Material[]> | null = null, dropStart = 0, dropRestY = 0;
/** Syncs the table to a rules state (null: the title's spread); colorFor(card) is its palette colour. */
export function sync(state: State | null, colorFor: ((c: Card) => string) | null): void {
  lastState = state;
  lastColorFor = colorFor;
  clearCards();
  if (!state) { decorativeSpread(); return; }
  const shown = state.discardPile.slice(-4);
  let top: { card: Card; mesh: Mesh<Material[]> } | null = null;
  shown.forEach((c, i) => {
    const r1 = hash(c.id), r2 = hash(c.id + "z");
    const isTop = i === shown.length - 1;
    const mesh = put(c, colorFor ? colorFor(c) : "#ffffff", isTop ? 0 : (r1 - 0.5) * 0.3, i * 0.006, 0.1 + (isTop ? 0 : (r2 - 0.5) * 0.25), isTop ? (r1 - 0.5) * 0.12 : (r2 - 0.5) * 0.8);
    if (isTop && mesh) top = { card: c, mesh };
  });
  drawPile(state.drawPile.length);
  const opps = state.players.slice(1);
  const seats = opps.length === 1 ? [[0, -2.55, 0]]
    : opps.length === 2 ? [[-2.2, -1.85, -0.75], [2.2, -1.85, 0.75]]
    : [[-2.75, -0.35, -1.35], [0, -2.6, 0], [2.75, -0.35, 1.35]];
  opps.forEach((p, i) => { const s = seats[i]; if (s) fan(s[0]!, s[1]!, s[2]!, p.hand.length); });
  const cc = state.currentColor;
  setGlow(cc ? (colorFor ? colorFor({ color: cc, kind: "number", id: "_" }) : R.COLOR_INFO[cc].hex) : "#9a93a3");
  // A newly played card drops onto the pile (not with reduced motion).
  const t = top as { card: Card; mesh: Mesh<Material[]> } | null;
  if (t && t.card.id !== topCardId) {
    if (topCardId !== null && !reducedMotion) { dropStart = time; dropMesh = t.mesh; dropRestY = t.mesh.position.y; }
    topCardId = t.card.id;
  } else dropMesh = null;
}
/** Title / no round: the four eights fanned on the felt, a draw pile beside them. */
function decorativeSpread(): void {
  if (lastState !== null && lastState !== undefined) return;
  clearCards();
  topCardId = null;
  R.COLORS.forEach((c, i) => {
    const off = i - 1.5;
    put({ id: "deco-" + c, kind: "number", color: c, rank: 8 }, R.COLOR_INFO[c].hex, off * 0.62, i * 0.006, 0.25 + Math.abs(off) * 0.12, -off * 0.18);
  });
  drawPile(40);
  glowHex = theme?.accent ?? "#ff7a4d";
  glowMat.color.set(glowHex).multiplyScalar(look?.bloom ? 1.4 : 0.9);
}

// ---------------------------------------------------------------- camera and frame
let size = { w: 0, h: 0 };
/** Frames the table for a window of w × h pixels: pulled back and higher on narrow windows. */
export function resize(w: number, h: number, logicalWidth: number): void {
  if (w === size.w && h === size.h && camera.userData.narrow === logicalWidth < 720) return;
  size = { w, h };
  camera.aspect = w / Math.max(1, h);
  camera.updateProjectionMatrix();
  // A higher, more top-down view keeps the opponents' fans visible above the 2D piles.
  camera.userData.narrow = logicalWidth < 720;
  if (logicalWidth < 720) camera.position.set(0, 10.5, 11.5); else camera.position.set(0, 7.4, 7.6);
  camera.lookAt(0, -1.4, 0.35);
}

/** Each frame: ambient motion (glow, lamp, far lamps, motes) and the drop of a newly played card. */
export function update(dtIn: number): void {
  const dt = Math.min(0.25, Math.max(0, dtIn));
  const moving = !reducedMotion;
  if (moving) time += dt;
  if (moving && look?.ambience) {
    const pulse = 0.5 + 0.5 * Math.sin(time * 1.6);
    glowMat.opacity = 0.8 + 0.2 * pulse;
    keyLight.intensity = KEY_INTENSITY * (1 + 0.025 * Math.sin(time * 2.3) + 0.012 * Math.sin(time * 7.1));
    for (const b of bokeh) b.mat.opacity = 0.75 + 0.25 * Math.sin(time * 1.1 + b.phase);
  } else {
    glowMat.opacity = 0.9; keyLight.intensity = KEY_INTENSITY;
    for (const b of bokeh) b.mat.opacity = 0.9;
  }
  if (moving) animateMotes(time);
  if (dropMesh) {
    if (!moving) { dropMesh.position.y = dropRestY; dropMesh.rotation.z = 0; dropMesh = null; }
    else {
      const k = Math.min(1, (time - dropStart) / 0.32);
      const e = 1 - Math.pow(1 - k, 3);
      dropMesh.position.y = dropRestY + (1 - e) * 0.9;
      dropMesh.rotation.z = (1 - e) * 0.25;
      if (k >= 1) dropMesh = null;
    }
  }
  void glowHex;
}
