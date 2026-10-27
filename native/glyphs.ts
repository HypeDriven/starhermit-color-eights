// The browser build's suit and card-kind symbols (◆ ≈ ♣ ☀ ★ ⊘ ⇄), drawn as
// shapes: text draws in the system's fonts, where such symbols depend on
// the system (tofu on some). One description in a unit box (−1…1, y down)
// draws on the 2D overlay (starhermit:draw, the hand and the chooser) and on
// canvases (the 3D card faces).
import * as draw from "starhermit:draw";
import type { OffscreenCanvasRenderingContext2D } from "starhermit:canvas";

export type GlyphName = "diamond" | "wave" | "leaf" | "sun" | "star" | "skip" | "reverse";
type Pt = [number, number];
type Part =
  | { poly: Pt[] }
  | { circle: [number, number, number] }
  | { line: Pt[]; w: number }
  | { ring: [number, number, number]; w: number };

function starPts(r: number, inner: number): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * inner : r;
    pts.push([Math.cos(a) * rr, Math.sin(a) * rr]);
  }
  return pts;
}
function wave(y: number): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i <= 12; i++) { const x = -0.9 + (1.8 * i) / 12; pts.push([x, y + Math.sin((i / 12) * Math.PI * 2) * -0.16]); }
  return pts;
}
const SHAPES: Record<GlyphName, Part[]> = {
  diamond: [{ poly: [[0, -1], [0.72, 0], [0, 1], [-0.72, 0]] }],
  wave: [{ line: wave(-0.3), w: 0.2 }, { line: wave(0.3), w: 0.2 }],
  leaf: [
    { circle: [0, -0.42, 0.36] }, { circle: [-0.42, 0.12, 0.36] }, { circle: [0.42, 0.12, 0.36] },
    { poly: [[-0.1, -0.05], [0.1, -0.05], [0.28, 0.95], [-0.28, 0.95]] },
  ],
  sun: [
    { circle: [0, 0, 0.42] },
    ...Array.from({ length: 8 }, (_, i): Part => {
      const a = (i * Math.PI) / 4;
      return { line: [[Math.cos(a) * 0.6, Math.sin(a) * 0.6], [Math.cos(a) * 0.95, Math.sin(a) * 0.95]], w: 0.16 };
    }),
  ],
  star: [{ poly: starPts(1, 0.42) }],
  skip: [{ ring: [0, 0, 0.78], w: 0.2 }, { line: [[-0.55, 0.55], [0.55, -0.55]], w: 0.2 }],
  reverse: [
    { line: [[-0.85, -0.38], [0.5, -0.38]], w: 0.18 }, { poly: [[0.95, -0.38], [0.45, -0.72], [0.45, -0.04]] },
    { line: [[0.85, 0.38], [-0.5, 0.38]], w: 0.18 }, { poly: [[-0.95, 0.38], [-0.45, 0.04], [-0.45, 0.72]] },
  ],
};
/** The suit glyph of a rules shape name (COLOR_INFO[c].shape). */
export const SUIT: Record<string, GlyphName> = { diamond: "diamond", wave: "wave", leaf: "leaf", sun: "sun" };

/** On the overlay, centred at (cx, cy), `s` pixels from the centre to the box's edge. */
export function drawGlyph(name: GlyphName, cx: number, cy: number, s: number, color: string): void {
  const P = (p: Pt): Pt => [cx + p[0] * s, cy + p[1] * s];
  for (const part of SHAPES[name]) {
    if ("poly" in part) draw.polygon(part.poly.map(P), color);
    else if ("circle" in part) { const [x, y, r] = part.circle; draw.roundRect(cx + (x - r) * s, cy + (y - r) * s, 2 * r * s, 2 * r * s, r * s, color); }
    else if ("ring" in part) { const [x, y, r] = part.ring; const w = part.w * s; draw.strokeRoundRect(cx + (x - r) * s - w / 2, cy + (y - r) * s - w / 2, 2 * r * s + w, 2 * r * s + w, r * s + w / 2, color, w); }
    else for (let i = 1; i < part.line.length; i++) { const a = P(part.line[i - 1]!), b = P(part.line[i]!); draw.line(a[0], a[1], b[0], b[1], color, part.w * s); }
  }
}

/** On a canvas, centred at (cx, cy) with half-size `s`, in the context's fill style. */
export function canvasGlyph(ctx: OffscreenCanvasRenderingContext2D, name: GlyphName, cx: number, cy: number, s: number, color: string): void {
  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const part of SHAPES[name]) {
    if ("poly" in part) {
      ctx.beginPath();
      part.poly.forEach(([x, y], i) => (i ? ctx.lineTo(cx + x * s, cy + y * s) : ctx.moveTo(cx + x * s, cy + y * s)));
      ctx.closePath();
      ctx.fill();
    } else if ("circle" in part) {
      const [x, y, r] = part.circle;
      ctx.beginPath(); ctx.arc(cx + x * s, cy + y * s, r * s, 0, Math.PI * 2); ctx.fill();
    } else if ("ring" in part) {
      const [x, y, r] = part.ring;
      ctx.lineWidth = part.w * s;
      ctx.beginPath(); ctx.arc(cx + x * s, cy + y * s, r * s, 0, Math.PI * 2); ctx.stroke();
    } else {
      ctx.lineWidth = part.w * s;
      ctx.beginPath();
      part.line.forEach(([x, y], i) => (i ? ctx.lineTo(cx + x * s, cy + y * s) : ctx.moveTo(cx + x * s, cy + y * s)));
      ctx.stroke();
    }
  }
  ctx.restore();
}
