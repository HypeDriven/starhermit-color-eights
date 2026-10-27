// The browser build's DOM layer (js/app.js screens over css/style.css) as
// starhermit:ui, built every frame over the lounge (render.ts): the title
// with its key art, account line and menu; the practice setup; the Journey
// grid and its stage intro; Challenges; Learn; the table (header with the
// mode's title and Pause, the lesson banner, the turn label, the colour chip
// and the opponents' counts, the draw pile and the discard top, the hand of
// cards — playable ones lifted and ringed, the rest dimmed, the hinted one
// outlined in gold — and the action row); the results with their art, goal
// line, score breakdown and leaderboard line; the dialogs (stage intro,
// pause, settings, the mandatory colour chooser, lesson complete) and the
// toast. The browser's clamp() sizes and media queries are computed from
// the window's logical size: narrow (< 720 px), short (≤ 560 px tall: smaller
// key art, no results art) and very short (≤ 480 px tall: tighter table).
// The cards, piles, chip and chooser are drawn by hand (Surface detail adds
// the sheen, bevel, lattice back and paper edges on the detailed levels).
import { frame, openMenu } from "starhermit:engine";
import { bindingLabel } from "starhermit:input";
import * as draw from "starhermit:draw";
import * as ui from "starhermit:ui";
import { TextureLoader, type Texture } from "starhermit:scene";
import { Content as C, Rules as R, type Card, type ColorId, type Stage } from "./classic.ts";
import { SUIT, drawGlyph, type GlyphName } from "./glyphs.ts";
import { tr, N, pt } from "./i18n.ts";
import * as platform from "./platform.ts";
import {
  app, cardHex, cardLabel, challengesScreen, chooseColor, clearOverlay, closeOverlay, colorChoicePending, colorLabel, copyInvite, doUndo, drawCard,
  goalText, journeyScreen, labelFromEnglish, learnScreen, mode, modeCtx, nextLesson, nextStage, openSettings, paletteHex, pauseGame, playCard,
  playerName, practiceSetup, progress, quitWithoutSaving, reasonText, restartRound, resumeRound, resumeSnapshot, saveAndQuit, session, settings,
  showHint, signIn, stageIntro, startChallenge, startDaily, startJourneyStage, startLesson, startPractice, tableLive, titleScreen,
} from "./main.ts";
import { isDetailed } from "./style.ts";
import { sfx } from "./audio.ts";

// ------------------------------------------------------------------ layout
interface Layout { lw: number; lh: number; sc: number; narrow: boolean; short: boolean; veryShort: boolean }
function layoutNow(): Layout {
  const f = frame();
  const sc = ui.preferences().scale;
  const sa = f.safeArea;
  const lw = Math.max(1, (f.width - sa.left - sa.right) / sc), lh = Math.max(1, (f.height - sa.top - sa.bottom) / sc);
  return { lw, lh, sc, narrow: lw < 720, short: lh <= 560, veryShort: lh <= 480 };
}
const clamp = (min: number, v: number, max: number): number => Math.max(min, Math.min(max, v));
const lastHeight = new Map<string, number>();

function textWidth(text: string, style: string | readonly (string | ui.Style)[], kind?: "button" | "heading"): number {
  return ui.measureText(text, { ...(kind ? { kind } : {}), style: typeof style === "string" ? style : [...style] }).width / ui.preferences().scale;
}

interface Btn { id: string; text: string; style?: (string | ui.Style)[]; disabled?: boolean; done?: boolean; act: () => void }
/** A primary button: the accent fill, with Surface detail's gradient on the detailed levels. */
const PRIMARY = (): string[] => (isDetailed() ? ["btn", "btn-primary", "btn-primary-detailed"] : ["btn", "btn-primary"]);
/** A button `width` wide (null: its text's); a label too long wraps inside; `done` adds a drawn check mark. */
function button(b: Btn, width: number | null = null): void {
  const style = b.style ?? ["btn"];
  const opts: ui.ButtonOptions = {};
  if (b.disabled) opts.disabled = true;
  const s: ui.Style = width != null ? { width } : {};
  const inner = width != null ? Math.max(20, width - 36 - (b.done ? 24 : 0)) : 0;
  const wraps = width != null && textWidth(b.text, style, "button") + (b.done ? 24 : 0) > width;
  if (b.done || wraps) {
    opts.content = () => ui.row(`${b.id}-face`, () => {
      if (wraps) ui.paragraph(b.text, inner); else ui.label(b.text);
      if (b.done) checkMark(16, style.includes("btn-primary") ? "#1c0d08" : "#ffffff");
    }, { spacing: 8, align: "center" });
  }
  if (ui.style(...style, s).id(b.id).button(b.text + (b.done ? " ✓" : ""), opts)) { sfx("select"); b.act(); }
}
/** Text up to `width` wide: one label when it fits, else a paragraph. */
function para(text: string, width: number, cls: string, id?: string, center = false, size?: number): void {
  if (!text) return;
  const styles: (string | ui.Style)[] = [cls];
  if (center) styles.push({ text: { align: "center" } });
  if (size) styles.push({ text: { size } });
  let u = ui.style(...styles);
  if (id) u = u.id(id);
  if (ui.measureText(text, { style: styles }).width / ui.preferences().scale <= width) u.label(text);
  else u.paragraph(text, width);
}
function heading(cls: string, text: string, width: number, id?: string, center = true): void {
  const styles: (string | ui.Style)[] = [cls, ...(center ? [{ text: { align: "center" as const } }] : [])];
  if (ui.measureText(text, { kind: "heading", style: styles }).width / ui.preferences().scale <= width) (id ? ui.id(id) : ui).style(...styles).heading(text);
  else (id ? ui.id(id) : ui).style(...styles).paragraph(text, width);
}
function checkMark(size: number, color: string): void {
  ui.widget("", {
    role: "none", size: { width: size, height: size }, draw: (r) => {
      const cx = r.x + r.width / 2, cy = r.y + r.height / 2, s = Math.min(r.width, r.height) / 2, w = Math.max(1.5, s * 0.28);
      draw.line(cx - s * 0.7, cy, cx - s * 0.2, cy + s * 0.55, color, w);
      draw.line(cx - s * 0.2, cy + s * 0.55, cx + s * 0.75, cy - s * 0.6, color, w);
    },
  });
}
/** "#rrggbb" with an alpha 0–1. */
function alpha(hex: string, a: number): string {
  if (a >= 1) return hex;
  return hex.slice(0, 7) + Math.round(Math.max(0, Math.min(1, a)) * 255).toString(16).padStart(2, "0");
}
function keyHint(action: string): string {
  const k = bindingLabel(action, "keyboard");
  return k ? ` (${k})` : "";
}

// ------------------------------------------------------------------ art
let keyArt: Texture | null = null;
const resultArt: { win: Texture | null; lose: Texture | null } = { win: null, lose: null };
let artAsked = false;
function loadArt(): void {
  if (artAsked) return;
  artAsked = true;
  const loader = new TextureLoader();
  // Decorative: a missing file just leaves the art out.
  loader.loadAsync("assets/key-art.webp").then((t) => { keyArt = t; }, () => undefined);
  loader.loadAsync("assets/results-win.webp").then((t) => { resultArt.win = t; }, () => undefined);
  loader.loadAsync("assets/results-lose.webp").then((t) => { resultArt.lose = t; }, () => undefined);
}
/** An illustration cover-fit into width × height (CSS object-fit: cover). */
function art(id: string, tex: Texture | null, width: number, height: number, cls: string): void {
  if (!tex) return;
  const tw = tex.width || 1280, th = tex.height || 720;
  const box = width / height, img = tw / th;
  const uv = box > img
    ? { min: [0, 0.5 - img / box / 2] as [number, number], max: [1, 0.5 + img / box / 2] as [number, number] }
    : { min: [0.5 - box / img / 2, 0] as [number, number], max: [0.5 + box / img / 2, 1] as [number, number] };
  ui.column(`${id}-frame`, () => ui.image("", tex, { width, height }, uv), { style: cls, clip: true, width, height });
}

// ------------------------------------------------------------------ the frame
export function drawScreens(): void {
  loadArt();
  const L = layoutNow();
  const f = frame();
  if (app.screen !== "game") {
    // .ce-menu: the lounge dimmed behind the menus.
    draw.box(0, 0, f.width, f.height, { background: { type: "linear", angle: 180, stops: [{ color: "#0c0a0e88", at: 0 }, { color: "#0c0a0e66", at: 1 }] } });
  }
  switch (app.screen) {
    case "title": titleScreen_(L); break;
    case "practice": practiceScreen(L); break;
    case "journey": journeyScreen_(L); break;
    case "challenges": challengesScreen_(L); break;
    case "learn": learnScreen_(L); break;
    case "game": gameScreen(L); break;
    case "results": resultsScreen(L); break;
  }
  overlays(L);
  toast(L);
  if (app.focusNext) {
    const age = f.frame - Math.max(app.openedFrame, app.overlay ? app.overlayOpenedFrame : 0);
    if (age >= 1) ui.setFocus(app.focusNext);
    if (age >= 3) app.focusNext = null;
  }
}

/** A menu screen (.ce-menu-inner): a centred column `maxW` wide at most, scrolling when taller than the window. */
function screen(key: string, L: Layout, maxW: number, build: (w: number) => void): void {
  const avail = Math.max(80, L.lh);
  const width = Math.max(200, Math.min(maxW, L.lw * (maxW > 600 ? 0.94 : 0.92)));
  const h = lastHeight.get(key) ?? 0;
  const top = Math.round(L.lh * (L.narrow ? 0.04 : 0.06)), bottom = Math.round(L.lh * 0.08);
  ui.place(`scr-${key}`, { anchor: "top-start", x: 0, y: 0 }, () => {
    const body = (): void => {
      const r = ui.column(`${key}-panel`, () => build(width), { width, spacing: 11, align: "stretch", padding: { top, bottom } });
      lastHeight.set(key, r.height / L.sc);
    };
    if (h > avail) {
      ui.scrollArea(`${key}-scroll`, { width: L.lw, height: avail }, () => {
        ui.column(`${key}-scroll-col`, body, { width: L.lw - 12, align: "center" });
      });
    } else ui.column(`${key}-center`, body, { height: avail, width: L.lw, align: "center" });
  }, { width: L.lw, height: avail });
}

// ------------------------------------------------------------------ title and menus
function accountLine(): string {
  if (!platform.signedIn()) return tr("Offline — progress is stored on this device.");
  const sync = platform.syncState();
  const syncTxt = sync === "synced" ? tr("progress synced") : sync === "saving" ? tr("saving…") : tr("cloud sync unavailable");
  return tr("Playing as {name} · {sync}", { name: platform.displayName(), sync: syncTxt });
}
function titleScreen_(L: Layout): void {
  screen("title", L, 460, (w) => {
    art("key-art", keyArt, w, L.short ? 96 : clamp(120, L.lh * 0.26, 300), "key-art");
    heading(L.lw < 520 ? "h1-small" : "h1", "Color Eights", w, "title-heading");
    para(tr("Match the discard by color or rank. Empty your hand first."), w, "tagline", "tagline", true);
    para(accountLine(), w, "tagline", "account-line", true);
    if (app.signedOut) para(pt("signedOut"), w, "tagline", "signed-out", true);
    const buttons: Btn[] = [];
    if (resumeSnapshot()) buttons.push({ id: "btn-resume-round", text: tr("Resume round"), style: PRIMARY(), act: resumeRound });
    buttons.push(
      { id: "btn-practice", text: tr("Practice"), style: PRIMARY(), act: practiceSetup },
      { id: "btn-journey", text: tr("Journey"), act: journeyScreen },
      { id: "btn-daily", text: tr("Daily Challenge"), act: startDaily },
      { id: "btn-challenges", text: tr("Challenges"), act: challengesScreen },
      { id: "btn-learn", text: tr("Learn"), act: learnScreen },
      { id: "btn-settings", text: tr("Settings"), act: openSettings },
    );
    if (platform.inviteLink()) buttons.push({ id: "btn-invite", text: pt("invite"), act: () => void copyInvite() });
    if (!platform.signedIn()) buttons.push({ id: "btn-signin", text: pt("signIn"), style: PRIMARY(), act: signIn });
    for (const b of buttons) button(b, w);
  });
}

function fieldRow(id: string, label: string, w: number, control: () => void): void {
  ui.row(`${id}-row`, () => {
    para(label, w * 0.6, "field-label");
    ui.spacer();
    control();
  }, { width: w, align: "center", spacing: 12, padding: { top: 4, bottom: 4 } });
}
function practiceScreen(L: Layout): void {
  const f = app.practice;
  screen("practice", L, 460, (w) => {
    heading(L.lw < 520 ? "h1-small" : "h1", tr("Practice"), w, "practice-heading");
    para(tr("Unranked. Optional undo assist."), w, "tagline", "practice-sub", true);
    fieldRow("set-players", tr("Players"), w, () => {
      const i = ui.id("set-players").select(tr("Players"), f.players - 2, ["2", "3", "4"]);
      if (i !== f.players - 2) f.players = i + 2;
    });
    fieldRow("set-level", tr("Opponent skill"), w, () => {
      const levels = ["easy", "medium", "hard"];
      const cur = Math.max(0, levels.indexOf(f.level));
      const i = ui.id("set-level").select(tr("Opponent skill"), cur, [tr("easy"), tr("medium"), tr("hard")]);
      if (i !== cur) f.level = levels[i]!;
    });
    const check = (id: string, label: string, cur: boolean, set: (v: boolean) => void): void => {
      ui.row(`${id}-row`, () => {
        const next = ui.id(id).checkbox(label, cur);
        if (next !== cur) set(next);
      }, { width: w, padding: { top: 4, bottom: 4 } });
    };
    check("set-stacking", tr("Stacking (Draw cards stack)"), settings.stacking, (v) => platform.setSetting("stacking", v));
    check("set-draw-to-match", tr("Draw-to-match (draw up to 3)"), settings.drawToMatch, (v) => platform.setSetting("drawToMatch", v));
    check("set-undo", tr("Undo assist"), f.undo, (v) => { f.undo = v; });
    button({ id: "btn-start-round", text: tr("Start round"), style: PRIMARY(), act: startPractice }, w);
    button({ id: "btn-back", text: tr("Back"), act: titleScreen }, w);
  });
}

function journeyScreen_(L: Layout): void {
  const p = progress();
  screen("journey", L, 880, (w) => {
    heading(L.lw < 520 ? "h1-small" : "h1", tr("Journey"), w, "journey-heading");
    para(tr("Forty stages. New mechanics arrive one at a time."), w, "tagline", "journey-sub", true);
    // CSS grid repeat(auto-fill, minmax(160px, 1fr)) with an 8 px gap
    const gap = 8;
    const cols = Math.max(1, Math.floor((w + gap) / (160 + gap)));
    const cw = (w - gap * (cols - 1)) / cols;
    const stages = C.JOURNEY;
    for (let i = 0; i < stages.length; i += cols) {
      ui.row(`journey-r${i}`, () => {
        for (const st of stages.slice(i, i + cols)) {
          const done = !!p.journey[st.id]?.goalMet;
          const style: (string | ui.Style)[] = ["btn", "btn-stage", ...(st.mastery ? ["btn-mastery"] : [])];
          stageButton(st, `${st.index}. ${tr(st.name)}`, done, style, cw);
        }
      }, { spacing: gap, align: "stretch" });
    }
    button({ id: "btn-back", text: tr("Back"), act: titleScreen }, w);
  });
}
function stageButton(st: Stage, text: string, done: boolean, style: (string | ui.Style)[], width: number): void {
  const inner = width - 32 - (done ? 22 : 0);
  if (ui.style(...style, { width }).id(`stage-${st.index}`).button(text + (done ? " ✓" : ""), {
    content: () => ui.row(`stage-${st.index}-face`, () => {
      if (textWidth(text, style, "button") > inner) ui.paragraph(text, inner); else ui.label(text);
      if (done) checkMark(14, "#ffffff");
    }, { spacing: 6, align: "center" }),
  })) { sfx("select"); stageIntro(st); }
}

function challengesScreen_(L: Layout): void {
  const p = progress();
  screen("challenges", L, 460, (w) => {
    heading(L.lw < 520 ? "h1-small" : "h1", tr("Challenges"), w, "challenges-heading");
    C.CHALLENGES.forEach((ch, i) => {
      ui.column(`challenge-row-${i}`, () => {
        button({ id: `challenge-${i}`, text: tr(ch.name), style: PRIMARY(), done: !!p.challenges[ch.id]?.completed, act: () => startChallenge(ch) }, w);
        para(tr(ch.desc) + " (" + tr(ch.goalLabel) + ")", w, "challenge-desc", `challenge-desc-${i}`);
      }, { spacing: 3, width: w });
    });
    button({ id: "btn-back", text: tr("Back"), act: titleScreen }, w);
  });
}

function learnScreen_(L: Layout): void {
  const p = progress();
  screen("learn", L, 460, (w) => {
    heading(L.lw < 520 ? "h1-small" : "h1", tr("Learn"), w, "learn-heading");
    para(tr("Interactive lessons: one rule at a time."), w, "tagline", "learn-sub", true);
    C.LESSONS.forEach((ls, i) => button({ id: `lesson-${i}`, text: tr(ls.title), done: !!p.tutorials[ls.id], act: () => startLesson(ls) }, w));
    button({ id: "btn-back", text: tr("Back"), act: titleScreen }, w);
  });
}

// ------------------------------------------------------------------ cards
function glyphOf(card: Pick<Card, "color">): GlyphName { return card.color ? SUIT[R.COLOR_INFO[card.color].shape] ?? "star" : "star"; }
/** Words in lines at most `max` pixels wide (a word longer than that keeps its own line). */
function wrapWords(text: string, max: number, size: number): string[] {
  const lines: string[] = [];
  let cur = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = cur ? `${cur} ${word}` : word;
    if (cur && draw.measureText(next, { size, weight: "700" }).width > max) { lines.push(cur); cur = word; }
    else cur = next;
  }
  if (cur) lines.push(cur);
  return lines;
}
/** The glyph and the label, white with a 1-px shadow, centred in the box (the browser build's card face). */
function cardText(x: number, y: number, w: number, h: number, glyph: GlyphName | null, label: string, size0: number, a: number, inline: boolean): void {
  // Smaller type where the longest word or the whole block would not fit (short landscape, long names).
  let size = size0;
  const fits = (sz: number): boolean => {
    const longest = Math.max(...label.split(/\s+/).map((wd) => draw.measureText(wd, { size: sz, weight: "700" }).width));
    const n = wrapWords(label, w - 6, sz).length;
    return longest <= w - 4 && n * sz * 1.15 + (glyph ? sz * 1.15 : 0) <= h - 4;
  };
  while (size > size0 * 0.6 && !fits(size)) size *= 0.92;
  const ink = alpha("#ffffff", a), shade = alpha("#000000", 0.66 * a);
  const g = glyph ? size * 0.5 : 0;
  const lh = size * 1.15;
  const firstWidth = (s: string): number => draw.measureText(s, { size, weight: "700" }).width;
  let lines = wrapWords(label, w - 6, size);
  // Inline (the discard top): the glyph leads the first line when it fits.
  const lead = inline && glyph && lines.length === 1 && firstWidth(lines[0]!) + g * 2.6 <= w - 6;
  if (lead) lines = [lines[0]!];
  const blockH = lines.length * lh + (glyph && !lead ? g * 2 + size * 0.15 : 0);
  let ty = y + (h - blockH) / 2;
  if (glyph && !lead) {
    drawGlyph(glyph, x + w / 2 + 1, ty + g + 1, g, shade);
    drawGlyph(glyph, x + w / 2, ty + g, g, ink);
    ty += g * 2 + size * 0.15;
  }
  for (const [i, line] of lines.entries()) {
    let cx = x + w / 2;
    if (lead && i === 0) {
      const tw = firstWidth(line) + g * 2.6;
      const gx = x + (w - tw) / 2 + g;
      drawGlyph(glyph!, gx + 1, ty + lh / 2 + 1, g, shade);
      drawGlyph(glyph!, gx, ty + lh / 2, g, ink);
      cx = gx + g * 1.6 + firstWidth(line) / 2;
    }
    draw.text(line, cx, ty + (lh - size) / 2, { size, weight: "700", color: ink, align: "center", shadow: { color: shade, x: 0, y: 1 } });
    ty += lh;
  }
}
/** Surface detail: the diagonal sheen and inner bevel of the detailed cards. */
function sheen(x: number, y: number, w: number, h: number, rad: number, sc: number, a: number): void {
  draw.box(x, y, w, h, {
    radius: rad / sc,
    background: { type: "linear", angle: 150, stops: [{ color: alpha("#ffffff", 0.25 * a), at: 0 }, { color: "#ffffff00", at: 0.42 }, { color: "#00000000", at: 0.6 }, { color: alpha("#000000", 0.22 * a), at: 1 }] },
  });
  draw.strokeRoundRect(x, y, w, h, rad, alpha("#ffffff", 0.3 * a), 2 * sc);
  draw.rect(x + rad, y + h - 3 * sc, w - 2 * rad, 3 * sc, alpha("#000000", 0.15 * a));
}
interface CardLook { playable: boolean; disabled: boolean; hinted: boolean; size: number }
function drawCardButton(r: ui.Rect, card: Card, o: CardLook, sc: number): void {
  const x = r.x, w = r.width, h = r.height - 6 * sc;
  const y = r.y + 6 * sc - (o.playable ? 4 * sc : 0);
  const rad = 9.6 * sc;
  const a = o.disabled ? 0.5 : 1;
  const detailed = isDetailed();
  if (o.playable || detailed) draw.roundRect(x, y + (o.playable ? 4 : 3) * sc, w, h, rad, o.playable ? "#00000070" : alpha("#000000", 0.45 * a));
  if (o.hinted) {
    if (detailed) draw.roundRect(x - 6 * sc, y - 6 * sc, w + 12 * sc, h + 12 * sc, rad + 6 * sc, "#ffcf4d44");
    draw.roundRect(x - 3 * sc, y - 3 * sc, w + 6 * sc, h + 6 * sc, rad + 3 * sc, "#ffcf4d");
  } else if (o.playable) draw.roundRect(x - 2 * sc, y - 2 * sc, w + 4 * sc, h + 4 * sc, rad + 2 * sc, "#ffffffcc");
  draw.roundRect(x, y, w, h, rad, alpha(cardHex(card), a));
  if (detailed) sheen(x, y, w, h, rad, sc, a);
  cardText(x, y, w, h, glyphOf(card), cardLabel(card), o.size * sc, a, false);
}
function drawDiscard(r: ui.Rect, card: Card | undefined, size: number, sc: number): void {
  const { x, y, width: w, height: h } = r;
  const rad = 9.6 * sc;
  const detailed = isDetailed();
  if (detailed) draw.roundRect(x - 1, y + 6 * sc, w + 2, h, rad, "#000000aa");
  draw.roundRect(x, y, w, h, rad, card ? cardHex(card) : "#444444");
  if (!card) return;
  if (detailed) sheen(x, y, w, h, rad, sc, 1);
  cardText(x + 3 * sc, y, w - 6 * sc, h, glyphOf(card), cardLabel(card), size * sc, 1, true);
}
function drawPileFace(r: ui.Rect, text: string, disabled: boolean, hovered: boolean, size: number, sc: number): void {
  const { x, y, width: w } = r;
  const h = r.height - 6 * sc;
  const rad = 9.6 * sc;
  const a = disabled ? 0.45 : 1;
  if (isDetailed()) {
    // a lattice card back on a paper-edge stack
    draw.roundRect(x, y + 10 * sc, w, h, rad, alpha("#000000", 0.6 * a));
    draw.roundRect(x, y + 6 * sc, w, h, rad, alpha("#d9cfc0", a));
    draw.roundRect(x, y + 3 * sc, w, h, rad, alpha("#efe6d8", a));
    draw.roundRect(x, y, w, h, rad, alpha(hovered && !disabled ? "#33283d" : "#241c2c", a));
    const clip = { x: x + 2 * sc, y: y + 2 * sc, width: w - 4 * sc, height: h - 4 * sc };
    const ink = alpha(hovered && !disabled ? "#ff7a4d33" : "#ff7a4d22", a);
    for (let d = -h; d < w + h; d += 10 * sc) {
      draw.line(x + d, y, x + d + h, y + h, ink, 2 * sc, { clip });
      draw.line(x + d + h, y, x + d, y + h, ink, 2 * sc, { clip });
    }
    draw.strokeRoundRect(x, y, w, h, rad, alpha("#ff7a4d", 0.8 * a), 2 * sc);
  } else draw.roundRect(x, y, w, h, rad, alpha(hovered && !disabled ? "#3d3247" : "#2c2433", a));
  cardText(x + 3 * sc, y, w - 6 * sc, h, null, text, size * sc, a, false);
}

// ------------------------------------------------------------------ the table
function modeTitle(): string {
  const titles: Record<string, string> = { practice: N("Practice"), journey: N("Journey"), daily: N("Daily"), challenge: N("Challenge"), learn: N("Learn") };
  if (mode === "journey" && modeCtx?.stage) return `${modeCtx.stage.index}. ${tr(modeCtx.stage.name)}`;
  if (mode === "challenge" && modeCtx?.challenge) return tr(modeCtx.challenge.name);
  if (mode === "learn" && modeCtx?.lesson) return tr(modeCtx.lesson.title);
  return mode && titles[mode] ? tr(titles[mode]!) : "Color Eights";
}
function turnText(): string {
  const s = session!;
  const st = s.state;
  let t: string;
  if (st.pendingColorChoice) {
    t = st.pendingColorChoice.player === 0 ? tr("Choose a color") : tr("{name} is choosing a color", { name: playerName(st.players[st.pendingColorChoice.player]!.id) });
  } else {
    t = s.isHumanTurn() ? tr("Your turn") : tr("{name} is thinking…", { name: playerName(st.players[st.currentPlayer]!.id) });
  }
  if (st.config.turnTimerSec && s.isHumanTurn() && s.turnTimeLeft() > 0) t += ` (${Math.ceil(s.turnTimeLeft())}s)`;
  return t;
}
function gameScreen(L: Layout): void {
  const s = session;
  if (!s) return;
  const st = s.state;
  const vw = L.lw / 100, vh = L.lh / 100;
  const live = tableLive();
  const la = R.legalActions(st, s.humanId);
  const canDraw = la.ok && la.actions.some((a) => a.type === "draw");
  const playable = new Set(la.ok ? la.actions.filter((a) => a.type === "play").map((a) => a.cardId!) : []);
  const bodySize = clamp(14, 2 * vw, 18);

  // header: the mode's title and Pause
  const hr = ui.place("game-header", { anchor: "top-start", x: 0, y: 0 }, () => {
    ui.row("game-header-row", () => {
      const titleW = L.lw - 28 - textWidth(tr("Pause"), ["btn"], "button") - 40;
      para(modeTitle(), titleW, "game-title", "game-title", false, clamp(20, 3 * vw, 30));
      ui.spacer();
      if (ui.style("btn", { text: { size: bodySize } }).id("btn-pause").button(tr("Pause"))) pauseGame();
    }, { width: L.lw - 28, align: "center", spacing: 8 });
  }, { width: L.lw, padding: { top: L.veryShort ? 6 : 14, start: 14, end: 14 } });
  const headerH = hr.height / L.sc;

  const availH = Math.max(120, L.lh - headerH);
  const cardW = clamp(50, 9 * vw, 64), cardH = L.veryShort ? clamp(52, 14 * vh, 88) : clamp(70, 12 * vw, 88);
  const pileW = clamp(58, 10 * vw, 74), pileH = L.veryShort ? clamp(60, 15 * vh, 104) : clamp(82, 13 * vw, 104);
  const cardFont = clamp(13, 2 * vw, 16);
  const contentH = lastHeight.get("game") ?? 0;
  const scroll = contentH > availH + 1;
  const main = (): void => {
    let natural = 0;
    const add = (r: ui.Rect): void => { natural += r.height / L.sc; };
    const r = ui.column("game-main", () => {
      // lesson banner, turn label, colour chip, opponents
      add(ui.column("table-info", () => {
        if (mode === "learn" && modeCtx?.lesson) para(tr(modeCtx.lesson.text), Math.min(L.lw - 26, 620), "lesson-banner", "lesson-banner", true, clamp(14, 2.2 * vw, 18));
        ui.style("turn-label", { text: { size: clamp(15, 2.4 * vw, 20) } }).id("turn-label").label(turnText());
        ui.row("color-chip", () => {
          const dot = Math.round(bodySize * 1.6);
          const c = st.currentColor;
          ui.widget("", {
            role: "none", size: { width: dot, height: dot }, draw: (rr, ws) => {
              const cx = rr.x + rr.width / 2, cy = rr.y + rr.height / 2, rad = rr.width / 2;
              if (isDetailed()) draw.roundRect(rr.x - 6 * ws.scale, rr.y - 6 * ws.scale, rr.width + 12 * ws.scale, rr.height + 12 * ws.scale, rad + 6 * ws.scale, alpha(paletteHex(c), 0.35));
              draw.roundRect(rr.x, rr.y, rr.width, rr.height, rad, paletteHex(c));
              if (isDetailed()) draw.strokeRoundRect(rr.x, rr.y, rr.width, rr.height, rad, "#ffffff55", 2 * ws.scale);
              drawGlyph(glyphOf({ color: c }), cx, cy, rad * 0.55, "#00000088");
            },
          });
          ui.style("chip-text", { text: { size: clamp(14, 2.2 * vw, 18) } }).id("color-chip-text").label(colorLabel(c) + (st.pendingDraw > 0 ? " · " + tr("draw {n} pending", { n: st.pendingDraw }) : ""));
        }, { spacing: 7, align: "center" });
        ui.style("draw-count", { text: { size: clamp(14, 2 * vw, 17) } }).id("opponents").label(st.players.slice(1).map((p) => `${p.name}: ${p.hand.length}`).join(" · "));
      }, { align: "center", spacing: L.veryShort ? 2 : 5, width: L.lw }));

      // the draw pile and the discard top
      add(ui.row("table-cards", () => {
        const drawText = tr("Draw ({n})", { n: st.drawPile.length });
        const res = ui.id("btn-draw").widget(tr("Draw from the pile, {n} cards left", { n: st.drawPile.length }), {
          role: "button", size: { width: pileW, height: pileH + 6 }, disabled: !canDraw || !live,
          draw: (rr, ws) => drawPileFace(rr, drawText, !canDraw, ws.hovered, clamp(13, 2 * vw, 16), ws.scale),
        });
        if (res.activated) { sfx("select"); drawCard(); }
        const top = R.topDiscard(st);
        ui.widget(tr("Top of discard: {card}", { card: top ? cardLabel(top) : tr("none") }), {
          role: "image", size: { width: pileW, height: pileH }, draw: (rr, ws) => drawDiscard(rr, top, clamp(11, 1.6 * vw, 14), ws.scale),
        });
      }, { spacing: 14, align: "center" }));

      // the hand, wrapping (flex-wrap) into rows
      const me = st.players[0]!;
      const gap = 6.4;
      const maxW = L.lw - 16;
      const perRow = Math.max(1, Math.floor((maxW + gap) / (cardW + gap)));
      const hinted = app.hint?.cardId ?? null;
      add(ui.column("hand", () => {
        for (let i = 0; i < me.hand.length; i += perRow) {
          ui.row(`hand-r${i}`, () => {
            for (const card of me.hand.slice(i, i + perRow)) {
              const ok = playable.has(card.id);
              const why = ok ? null : R.explainInvalid(st, s.humanId, card.id);
              const res = ui.id(`card-${card.id}`).widget(cardLabel(card), {
                role: "button", size: { width: cardW, height: cardH + 6 }, disabled: !ok || !live,
                ...(why ? { description: tr("not playable: {reason}", { reason: reasonText(why) }) } : {}),
                draw: (rr, ws) => drawCardButton(rr, card, { playable: ok, disabled: !ok, hinted: hinted === card.id, size: cardFont }, ws.scale),
              });
              if (res.activated) playCard(card.id);
            }
          }, { spacing: gap, align: "end" });
        }
      }, { align: "center", spacing: gap, width: L.lw }));

      // the action row
      const acts: { id: string; text: string; act: () => void }[] = [];
      if (st.config.assists?.hint) acts.push({ id: "btn-hint", text: mode === "learn" ? tr("Hint") : tr("Hint") + keyHint("hint"), act: showHint });
      if (s.canUndo()) acts.push({ id: "btn-undo", text: tr("Undo") + keyHint("undo"), act: doUndo });
      if (mode === "learn" && modeCtx?.lesson) { const ls = modeCtx.lesson; acts.push({ id: "btn-restart-lesson", text: tr("Restart lesson"), act: () => startLesson(ls) }); }
      add(ui.row("action-row", () => {
        for (const a of acts) if (ui.style("btn", { text: { size: bodySize } }).id(a.id).button(a.text, { disabled: !live })) { sfx("select"); a.act(); }
      }, { spacing: 8, align: "center", padding: { bottom: L.veryShort ? 6 : 16 } }));
    }, { width: L.lw, align: "center", justify: "space-between", spacing: L.veryShort ? 6 : 10, ...(scroll ? {} : { height: availH }), padding: { top: 6 } });
    // The column's own height: its children and their spacing (it is the window's height when it fits).
    void r;
    lastHeight.set("game", natural + 6 + 3 * (L.veryShort ? 6 : 10));
  };
  ui.place("game-body", { anchor: "top-start", x: 0, y: headerH }, () => {
    if (scroll) ui.scrollArea("game-scroll", { width: L.lw, height: availH }, main, { padding: 0 });
    else main();
  }, { width: L.lw, height: availH });
}
// ------------------------------------------------------------------ results
function resultsScreen(L: Layout): void {
  const info = app.results;
  if (!info) return;
  const { st, humanWon, journeyMet } = info;
  const total = st.scores?.total ?? 0;
  screen("results", L, 460, (w) => {
    heading(L.lw < 520 ? "h1-small" : "h1", humanWon ? tr("You win!") : tr("{name} wins", { name: playerName(st.winner) }), w, "results-heading");
    const reasons: Record<string, string> = { "empty-hand": N("Emptied their hand first."), resignation: N("Round ended by resignation."), "move-limit": N("Move limit reached.") };
    para(st.terminalReason && reasons[st.terminalReason] ? tr(reasons[st.terminalReason]!) : String(st.terminalReason ?? ""), w, "tagline", "results-reason", true);
    if (!L.short) ui.row("results-art-row", () => art("results-art", humanWon ? resultArt.win : resultArt.lose, Math.min(w, 520), clamp(100, L.lh * 0.22, 240), "results-art"), { width: w, justify: "center" });
    if (journeyMet !== null) para(journeyMet ? tr("Stage goal met ✓") : tr("Stage goal not met — {goal}", { goal: goalText(modeCtx?.stage?.goal) }), w, "goal-line", "goal-line", true);
    heading("h2", tr("Score: {n} points", { n: total }), w, "results-score", false);
    ui.column("breakdown", () => {
      for (const [i, b] of (st.scores?.breakdown ?? []).entries()) {
        const p = st.players.find((pl) => pl.name === b.name);
        const who = p && !p.isAI ? tr("You") : b.name;
        const hand = b.cardsLeft === 1 ? tr("{n} card left", { n: b.cardsLeft }) : tr("{n} cards left", { n: b.cardsLeft });
        const detail = b.detail.length ? " (" + b.detail.map((d) => labelFromEnglish(d.label) + " " + d.value).join(", ") + ")" : "";
        para(`${who} — ${hand}, ${tr("{n} points", { n: b.handValue })}${detail}`, w, "breakdown", `breakdown-${i}`);
      }
    }, { spacing: 5, width: w });
    if (app.lb) para(app.lb.state === "lbRank" ? pt("lbRank", { rank: app.lb.rank ?? "" }) : pt(app.lb.state), w, "goal-line", "results-lb", true);
    button({ id: "btn-play-again", text: tr("Play again"), style: PRIMARY(), act: restartRound }, w);
    if (mode === "journey" && modeCtx?.stage && C.JOURNEY[modeCtx.stage.index]) button({ id: "btn-next-stage", text: tr("Next stage"), act: nextStage }, w);
    if (mode === "learn" && modeCtx?.lesson && C.LESSONS[C.LESSONS.indexOf(modeCtx.lesson) + 1]) button({ id: "btn-next-lesson", text: tr("Next lesson"), act: nextLesson }, w);
    button({ id: "btn-menu", text: tr("Back to menu"), act: titleScreen }, w);
  });
}

// ------------------------------------------------------------------ dialogs
/** A dialog (.ce-overlay > .ce-panel): `closable` ones close on Escape, never on the press that opened them. */
function dialogFrame(label: string, L: Layout, maxW: number, closable: boolean, build: (w: number) => void): void {
  const w = Math.min(maxW, L.lw * 0.92) - 44;
  const avail = L.lh - 32 - 44;
  const h = lastHeight.get(`dlg-${label}`) ?? 0;
  const body = (): void => {
    const r = ui.column(`${label}-body`, () => build(w), { spacing: 10, width: w });
    lastHeight.set(`dlg-${label}`, r.height / L.sc);
  };
  const open = ui.dialog(label, "", true, () => {
    if (h > avail) ui.scrollArea(`${label}-scroll`, { width: w + 14, height: avail }, body);
    else body();
  });
  if (!open && closable && frame().frame !== app.overlayOpenedFrame) closeOverlay();
}
function overlays(L: Layout): void {
  // The colour chooser is mandatory: it shows whenever the human must choose, over everything but a dialog they opened.
  if (!app.overlay && app.screen === "game" && colorChoicePending()) { colorDialog(L); return; }
  switch (app.overlay) {
    case "stage": {
      const st = app.stage;
      if (!st) { clearOverlay(); break; }
      dialogFrame("overlay-stage", L, 780, true, (w) => {
        heading("h2", `${st.index}. ${tr(st.name)}`, w, "stage-heading", false);
        if (st.intro) para(tr(st.intro), w, "body", "stage-intro");
        para(goalText(st.goal), w, "body", "stage-goal");
        const levels: Record<string, string> = { easy: N("{n} players · easy opponents"), medium: N("{n} players · medium opponents"), hard: N("{n} players · hard opponents") };
        para(tr(levels[st.aiLevel || "easy"] ?? levels.easy!, { n: st.playerCount }) + (st.stacking ? " · " + tr("stacking") : ""), w, "body", "stage-meta");
        button({ id: "btn-stage-play", text: tr("Play"), style: PRIMARY(), act: () => { clearOverlay(); startJourneyStage(st); } }, w);
        button({ id: "btn-stage-cancel", text: tr("Cancel"), act: clearOverlay }, w);
      });
      break;
    }
    case "pause":
      dialogFrame("overlay-pause", L, 780, true, (w) => {
        heading("h2", tr("Paused"), w, "pause-heading", false);
        button({ id: "btn-resume", text: tr("Resume"), style: PRIMARY(), act: closeOverlay }, w);
        button({ id: "btn-restart", text: tr("Restart round"), act: () => { clearOverlay(); restartRound(); } }, w);
        button({ id: "btn-pause-settings", text: tr("Settings"), act: openSettings }, w);
        button({ id: "btn-save-quit", text: tr("Save & quit to menu"), act: saveAndQuit }, w);
        button({ id: "btn-quit", text: tr("Quit without saving"), act: quitWithoutSaving }, w);
      });
      break;
    case "settings":
      dialogFrame("overlay-settings", L, 780, true, (w) => {
        heading("h2", tr("Settings"), w, "settings-heading", false);
        ui.row("palette-row", () => {
          para(tr("Color palette"), w * 0.5, "field-label");
          ui.spacer();
          const ids = ["standard", "contrast", "deuteranopia", "tritanopia"];
          const cur = Math.max(0, ids.indexOf(settings.palette));
          const i = ui.id("set-palette").select(tr("Color palette"), cur, [N("standard"), N("contrast"), N("deuteranopia"), N("tritanopia")].map((k) => tr(k)));
          if (i !== cur) platform.setSetting("palette", ids[i]!);
        }, { width: w, align: "center", spacing: 12, style: "settings-row" });
        ui.row("palette-swatches", () => {
          for (const c of R.COLORS) {
            ui.widget("", {
              role: "none", size: { width: 30, height: 30 }, draw: (rr) => {
                draw.roundRect(rr.x, rr.y, rr.width, rr.height, rr.width / 2, paletteHex(c));
                drawGlyph(glyphOf({ color: c }), rr.x + rr.width / 2, rr.y + rr.height / 2, rr.width * 0.28, "#00000088");
              },
            });
          }
        }, { spacing: 8, align: "center" });
        ui.column("options-note", () => {
          para(tr("Sound volumes, graphics quality, the language, controls, reduced motion, high contrast and text size are in the StarHermit Options (F1)."), w, "note", "options-note");
          button({ id: "btn-open-options", text: tr("Open Options"), act: () => openMenu() });
        }, { spacing: 8, width: w, style: "settings-row" });
        button({ id: "btn-settings-close", text: tr("Close"), style: PRIMARY(), act: closeOverlay }, w);
      });
      break;
    case "lesson": {
      const ls = app.lessonDone;
      if (!ls) { clearOverlay(); break; }
      dialogFrame("overlay-lesson", L, 780, true, (w) => {
        heading("h2", tr("Lesson complete"), w, "lesson-heading", false);
        para(tr("{title} — well done.", { title: tr(ls.title) }), w, "body", "lesson-done");
        if (C.LESSONS[C.LESSONS.indexOf(ls) + 1]) button({ id: "btn-next-lesson", text: tr("Next lesson"), style: PRIMARY(), act: nextLesson }, w);
        button({ id: "btn-back-lessons", text: tr("Back to lessons"), act: () => { clearOverlay(); learnScreen(); } }, w);
      });
      break;
    }
    default: break;
  }
}
function colorDialog(L: Layout): void {
  const w = Math.min(780, L.lw * 0.92) - 44;
  ui.dialog("overlay-color", "", true, () => {
    ui.column("color-body", () => {
      heading("h2", tr("Choose a color"), w, "color-heading");
      // .ce-color-row: 110 × 56 buttons, wrapping
      const gap = 10, bw = 110;
      const per = Math.max(1, Math.min(4, Math.floor((w + gap) / (bw + gap))));
      for (let i = 0; i < R.COLORS.length; i += per) {
        ui.row(`color-r${i}`, () => {
          for (const c of R.COLORS.slice(i, i + per) as ColorId[]) {
            const label = colorLabel(c);
            const res = ui.id(`color-${c}`).widget(label, {
              role: "button", size: { width: bw, height: 56 },
              draw: (rr, ws) => {
                const sc = ws.scale, rad = 11 * sc;
                if (isDetailed()) draw.roundRect(rr.x, rr.y + 4 * sc, rr.width, rr.height, rad, "#00000099");
                draw.roundRect(rr.x, rr.y, rr.width, rr.height, rad, paletteHex(c));
                if (ws.hovered) draw.roundRect(rr.x, rr.y, rr.width, rr.height, rad, "#ffffff22");
                if (isDetailed()) sheen(rr.x, rr.y, rr.width, rr.height, rad, sc, 1);
                cardText(rr.x + 4 * sc, rr.y, rr.width - 8 * sc, rr.height, glyphOf({ color: c }), label, 16 * sc, 1, true);
              },
            });
            if (res.activated) chooseColor(c);
          }
        }, { spacing: gap, align: "center" });
      }
    }, { spacing: 12, width: w, align: "center" });
  });
}

// ------------------------------------------------------------------ toast
function toast(L: Layout): void {
  if (!app.toast) return;
  const text = app.toast.text();
  const w = Math.min(L.lw * 0.92, 520);
  ui.place("toast", { anchor: "bottom", y: 20 }, () => {
    const fits = textWidth(text, "toast") + 40 <= w;
    if (fits) ui.style("toast").id("toast").label(text);
    else ui.style("toast").id("toast").paragraph(text, w - 34);
  }, { width: w, align: "center" });
}
