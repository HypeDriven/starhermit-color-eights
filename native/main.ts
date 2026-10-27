// Color Eights on the StarHermit engine: the entry module (starhermit.txt
// engine.entry), played natively by the StarHermit client and in browsers by
// the engine's web runtime. The rules, content, session controller and save
// model are the browser build's js/*.js, unchanged in what they decide; this
// module is what js/app.js did around them — the screen flow (title →
// practice setup / journey grid and stage intro / daily / challenges / learn
// → the table ⇄ pause and settings → results → play again, next stage or
// next lesson), the human seat's commands with the lesson gate, the colour
// chooser, hints and undo, events → sounds and announcements, progress and
// achievements at a round's end, posting a won ranked round to the
// high-score board, "Save & quit" and Resume round, and the lifecycle (a
// hidden window pauses the AI and the turn timer). The screens are drawn by
// screens.ts (starhermit:ui), the lounge by render.ts (starhermit:scene).
//
// Time is the runtime's fixed steps (60 a second): the AI's replies, the
// turn timer and the results' delay count them, so pauses, a hidden window
// and slow frames never cost time and play scripts replay exactly.
import "./classic.ts";
import { frame, onFixedUpdate, onQuit, onRender, onResume, onStart, onSuspend, onUpdate, onPreferencesChange, preferences, setFixedRate, clipboard } from "starhermit:engine";
import { onAction } from "starhermit:input";
import * as ui from "starhermit:ui";
import { onSessionEnded, onPlayerChange, requestSignIn } from "starhermit:platform";
import {
  Content as C, Rules as R, Sessions,
  type Card, type ColorId, type Command, type Config, type GameEvent, type Lesson, type PlayerSpec, type SessionInstance, type Stage, type State, type Challenge, type Daily, type Snapshot,
} from "./classic.ts";
import * as audio from "./audio.ts";
import { sfx } from "./audio.ts";
import { tr, N, pt } from "./i18n.ts";
import * as platform from "./platform.ts";
import { lookFor } from "./quality.ts";
import * as render from "./render.ts";
import { drawScreens } from "./screens.ts";
import { initStyles, setDetailed } from "./style.ts";

export type Mode = "practice" | "journey" | "daily" | "challenge" | "learn";
export type ScreenName = "title" | "practice" | "journey" | "challenges" | "learn" | "game" | "results";
export type OverlayName = "stage" | "pause" | "settings" | "lesson";
export interface Toast { text: () => string; until: number }
export interface ModeCtx { stage?: Stage; lesson?: Lesson; challenge?: Challenge; daily?: Daily }
export interface ResultsInfo { st: State; humanWon: boolean; journeyMet: boolean | null }

const STEP_MS = 1000 / 60;
const AI_DELAY_MS = 650;
export const app = {
  screen: "title" as ScreenName,
  overlay: null as OverlayName | null,
  /** The stage whose intro is open. */
  stage: null as Stage | null,
  /** The lesson just completed (its dialog). */
  lessonDone: null as Lesson | null,
  /** Frame the screen or overlay opened on (the press that opened it must not also act on it). */
  openedFrame: 0,
  overlayOpenedFrame: 0,
  focusNext: null as string | null,
  /** The practice table's choices, kept while the setup screen is open. */
  practice: { players: 2, level: "medium", undo: true },
  results: null as ResultsInfo | null,
  lb: null as { state: "lbPosting" | "lbRank" | "lbPosted" | "lbNotPosted"; rank?: number | null } | null,
  toast: null as Toast | null,
  hint: null as { cardId: string; until: number } | null,
  signedOut: false,
};
export let session: SessionInstance | null = null;
export let mode: Mode | null = null;
export let modeCtx: ModeCtx | null = null;
export const settings = platform.settings;
let lessonAwaiting: string | null = null;
let progressRecorded = false;
let lastDrawPileLen = -1;
let suspended = false;
const now = (): number => frame().time;

export const ACHIEVEMENTS: Record<string, string> = {
  "first-win": N("Win your first round"),
  "all-lessons": N("Complete every lesson"),
  "journey-mastery": N("Complete a journey mastery stage"),
  "streak-3": N("Win three rounds in a row"),
  century: N("Score 100+ points in one round"),
};
const AI_NAMES = ["Vex", "Mira", "Tallo"];

// ------------------------------------------------------------------ helpers
export function progress(): ReturnType<typeof platform.progress> { return platform.progress(); }
export function announce(text: string): void { if (text) ui.announce(text.slice(0, 500), { politeness: "polite" }); }
/** A toast (3.5 s); `text` re-reads in the current language. */
export function toast(text: () => string): void {
  app.toast = { text, until: now() + 3.5 };
  announce(text());
}
/** The colour-vision palette's colour of a card (wilds are grey). */
export function cardHex(card: Pick<Card, "color"> | null | undefined): string {
  if (!card || !card.color) return "#9a93a3";
  return paletteHex(card.color);
}
export function paletteHex(c: ColorId): string {
  const cvd = C.CVD_PALETTES[settings.palette];
  return (cvd && cvd[c]) || R.COLOR_INFO[c].hex;
}
export function colorLabel(c: ColorId): string { return tr(R.COLOR_INFO[c].label); }
/** A card's name in the game language (the rules keep English labels for logs and replays). */
export function cardLabel(card: Card | null | undefined): string {
  if (!card) return tr("none");
  if (card.kind === "number") return tr("{color} {rank}", { color: colorLabel(card.color!), rank: card.rank ?? "" });
  if (card.kind === "wild" || card.kind === "wild4") return tr(R.KIND_LABEL[card.kind]);
  return tr("{color} {kind}", { color: colorLabel(card.color!), kind: tr(R.KIND_LABEL[card.kind]) });
}
/** Card labels in score details are recorded in English by the rules ("Ember 7", "Wild Draw Four"). */
export function labelFromEnglish(label: string): string {
  for (const kind of Object.keys(R.KIND_LABEL) as (keyof typeof R.KIND_LABEL)[]) if (label === R.KIND_LABEL[kind]) return tr(label);
  for (const c of R.COLORS) {
    const base = R.COLOR_INFO[c].label + " ";
    if (label.indexOf(base) === 0) {
      const rest = label.slice(base.length);
      const kind = (Object.keys(R.KIND_LABEL) as (keyof typeof R.KIND_LABEL)[]).find((k) => R.KIND_LABEL[k] === rest);
      return kind ? tr("{color} {kind}", { color: colorLabel(c), kind: tr(rest) }) : tr("{color} {rank}", { color: colorLabel(c), rank: rest });
    }
  }
  return label;
}
export function playerName(id: string | null | undefined): string {
  const p = session?.state.players.find((pl) => pl.id === id);
  if (p && !p.isAI) return tr("You");
  return p ? p.name : String(id ?? "");
}
const REASONS: Record<string, string> = {
  "not-your-turn": N("wait for your turn"),
  "no-color-or-rank-match": N("match the discard color or rank"),
  "must-draw-penalty": N("you must draw the penalty cards"),
  "stacking-requires-draw-card": N("stack a Draw card or take the penalty"),
  "card-not-in-hand": N("that card is not in your hand"),
  "round-finished": N("the round is over"),
};
export function reasonText(reason: string | null | undefined): string { return reason && REASONS[reason] ? tr(REASONS[reason]!) : String(reason ?? ""); }
export function goalText(g: Stage["goal"] | undefined): string {
  if (!g || g.type === "win") return tr("Goal: win the round.");
  if (g.type === "win-turns") return tr("Goal: win in at most {n} of your turns.", { n: g.turns ?? 0 });
  if (g.type === "win-no-draw") return tr("Goal: win without drawing a card.");
  if (g.type === "score-min") return tr("Goal: win with a score of at least {n}.", { n: g.points ?? 0 });
  return tr("Goal: win the round.");
}

// ------------------------------------------------------------------ timers on the fixed steps
interface Timer { id: number; left: number; fn: () => void }
const timers: Timer[] = [];
let timerSeq = 0;
let simMs = 0;
const stepTimers = {
  scheduler(fn: () => void, ms: number): number { const id = ++timerSeq; timers.push({ id, left: Math.max(1, Math.round(ms / STEP_MS)), fn }); return id; },
  canceler(id: number): void { const i = timers.findIndex((t) => t.id === id); if (i >= 0) timers.splice(i, 1); },
  clock(): number { return simMs; },
};

// ------------------------------------------------------------------ navigation
export function showScreen(name: ScreenName, focus: string | null = null): void {
  app.screen = name;
  app.openedFrame = frame().frame;
  app.focusNext = focus;
  ui.setFocus(null);
}
export function openOverlay(name: OverlayName): void {
  app.overlay = name;
  app.overlayOpenedFrame = frame().frame;
}
export function clearOverlay(): void { app.overlay = null; }
/** A non-mandatory dialog closed (Escape, Close, Resume): the round goes on. */
export function closeOverlay(): void {
  clearOverlay();
  if (session && !session.finished && !suspended) session.resume();
}
function currentTheme(): ReturnType<typeof themeOf> { return themeOf(mode === "journey" ? modeCtx?.stage ?? null : null); }
function themeOf(stage: Stage | null) { return C.THEMES[stage ? C.journeyTheme(stage) : C.DEFAULT_THEME]!; }

// ------------------------------------------------------------------ title and menus
export function titleScreen(): void {
  teardownSession();
  render.setTheme(themeOf(null));
  render.sync(null, null);
  showScreen("title", resumeSnapshot() ? "btn-resume-round" : "btn-practice");
  announce(tr("Color Eights main menu"));
}
export function practiceSetup(): void { showScreen("practice", "set-players"); }
export function journeyScreen(): void { showScreen("journey", "stage-1"); }
export function challengesScreen(): void { showScreen("challenges", "challenge-0"); }
export function learnScreen(): void { showScreen("learn", "lesson-0"); }
export function stageIntro(st: Stage): void { app.stage = st; openOverlay("stage"); }

/** The saved round, while it is still in play. */
export function resumeSnapshot(): Snapshot | null {
  const snap = platform.getDoc().snapshot;
  if (!snap || !snap.state) return null;
  try { const st = JSON.parse(snap.state) as State; if (st && st.phase === "active") return snap; } catch { /* corrupt */ }
  return null;
}
export function resumeRound(): void {
  const snap = resumeSnapshot();
  if (!snap) return;
  let st: State;
  try { st = JSON.parse(snap.state) as State; } catch { return; }
  teardownSession();
  mode = (snap.mode as Mode) || "practice";
  modeCtx = null;
  lessonAwaiting = null;
  const id = st.config.contentId ?? "";
  if (mode === "journey") { const stage = C.JOURNEY.find((s) => s.id === id); modeCtx = stage ? { stage } : null; }
  else if (mode === "challenge") { const challenge = C.CHALLENGES.find((c) => c.config.contentId === id); modeCtx = challenge ? { challenge } : null; }
  else if (mode === "daily" && /^daily-\d{4}-\d{2}-\d{2}$/.test(id)) modeCtx = { daily: C.dailyForDate(id.slice(6)) };
  session = Sessions.createSession({ config: st.config, restoreState: snap.state, mode, humanId: snap.humanId, sessionId: snap.sessionId, aiDelayMs: AI_DELAY_MS, ...stepTimers });
  session.humanDraws = Math.max(0, Number(snap.humanDraws) || 0);
  session.replay = snap.replay || null;
  wireSession();
  gameScreen();
}

function aiPlayers(count: number, level: string): PlayerSpec[] {
  const players: PlayerSpec[] = [{ id: "p0", name: "You", isAI: false }];
  for (let i = 1; i < count; i++) players.push({ id: "p" + i, name: AI_NAMES[i - 1]!, isAI: true, aiLevel: level });
  return players;
}
export function startPractice(): void {
  const f = app.practice;
  newSession({
    seed: "practice-" + Math.floor(platform.nowMs()).toString(36),
    playerCount: f.players,
    stacking: settings.stacking,
    drawToMatch: settings.drawToMatch,
    assists: { hint: true, undo: f.undo },
  }, "practice", null, aiPlayers(f.players, f.level));
}
export function startJourneyStage(st: Stage): void {
  const cfg = C.journeyConfig(st);
  newSession(cfg, "journey", { stage: st }, aiPlayers(cfg.playerCount, st.aiLevel || "easy"));
}
export function startDaily(): void {
  const dateStr = new Date(platform.nowMs()).toISOString().slice(0, 10);
  const daily = C.dailyForDate(dateStr);
  newSession(daily.config, "daily", { daily }, aiPlayers(daily.config.playerCount, "medium"));
}
export function startChallenge(ch: Challenge): void {
  newSession(ch.config, "challenge", { challenge: ch }, aiPlayers(ch.config.playerCount, ch.aiLevel || "medium"));
}
export function startLesson(ls: Lesson): void {
  const rigged = C.rigLessonState(R, ls);
  teardownSession();
  mode = "learn";
  modeCtx = { lesson: ls };
  lessonAwaiting = ls.require.type === "finish" ? "finish" : ls.require.type;
  session = Sessions.createSession({ config: rigged.config, restoreState: R.serialize(rigged), mode: "learn", aiDelayMs: AI_DELAY_MS, ...stepTimers });
  wireSession();
  gameScreen();
  sfx("shuffle");
  announce(tr(ls.title) + ". " + tr(ls.text));
}

// ------------------------------------------------------------------ the session
function newSession(config: Config, modeName: Mode, ctx: ModeCtx | null, players: PlayerSpec[]): void {
  teardownSession();
  mode = modeName;
  modeCtx = ctx;
  lessonAwaiting = null;
  session = Sessions.createSession({ config, mode: modeName, players, aiDelayMs: AI_DELAY_MS, ...stepTimers });
  wireSession();
  gameScreen();
  sfx("shuffle");
}
function wireSession(): void {
  const s = session!;
  progressRecorded = false;
  app.results = null;
  app.lb = null;
  app.hint = null;
  render.setTheme(currentTheme());
  s.on("events", onEvents);
  lastDrawPileLen = s.state.drawPile.length;
  s.on("state", (st) => {
    if (st.drawPile.length > lastDrawPileLen) sfx("shuffle"); // discard pile recycled
    lastDrawPileLen = st.drawPile.length;
    render.sync(st, cardHex);
    if (st.phase === "finished") onRoundEnd(st);
  });
  s.on("error", () => undefined);
  render.sync(s.state, cardHex);
}
function teardownSession(): void {
  if (session) { session.pause(); session = null; }
  timers.length = 0;
  app.overlay = null;
  app.hint = null;
}
function gameScreen(): void { showScreen("game", null); }

function onEvents(events: GameEvent[]): void {
  const s = session;
  if (!s) return;
  for (const ev of events) {
    switch (ev.ev) {
      case "cardPlayed": {
        const c = ev.card!;
        sfx(c.kind === "number" ? "card" : "action");
        announce(tr("{name} played {card}", { name: playerName(ev.player), card: cardLabel(c) }));
        break;
      }
      case "drew":
        sfx("draw");
        announce(tr(ev.count! > 1 ? "{name} drew {n} cards" : "{name} drew {n} card", { name: playerName(ev.player), n: ev.count ?? 1 }));
        break;
      case "penaltyTaken":
        sfx("penalty");
        announce(tr("{name} took the {n}-card penalty", { name: playerName(ev.player), n: ev.amount ?? 0 }));
        break;
      case "skipped": announce(tr("{name} was skipped", { name: playerName(ev.player) })); break;
      case "reversed": sfx("action"); announce(tr("Direction of play reversed")); break;
      case "colorChosen":
        announce(tr("Color is now {color}", { color: colorLabel(ev.color!) }));
        if (mode === "learn" && lessonAwaiting === "chooseColor" && ev.player === "p0" && modeCtx?.lesson) completeLesson(modeCtx.lesson);
        break;
      case "oneCardLeft": sfx("onecard"); announce(tr("{name} has one card left", { name: playerName(ev.player) })); break;
      case "turnTimeout": announce(tr("{name} ran out of time and drew", { name: playerName(ev.player) })); break;
      case "moveLimitHit": announce(tr("Move limit reached")); break;
      case "invalidAction":
        if (ev.player === s.humanId) { sfx("invalid"); announce(tr("That move is not legal: {reason}", { reason: reasonText(ev.reason) })); }
        break;
      case "undone": sfx("undo"); announce(tr("Move undone")); break;
      case "turnPassed": if (ev.next === s.humanId && !s.finished) sfx("turn"); break;
      case "roundEnd": sfx(ev.winner === s.humanId ? "win" : "lose"); break;
      default: break;
    }
  }
}

// ------------------------------------------------------------------ the human seat
/** Whether the human may act on the table now (no dialog, their turn or not). */
export function tableLive(): boolean { return !!session && app.screen === "game" && !session.finished && !app.overlay && !colorChoicePending(); }
/** The human must choose a colour (the mandatory chooser). */
export function colorChoicePending(): boolean {
  const st = session?.state;
  return !!st && !!st.pendingColorChoice && st.players[st.pendingColorChoice.player]?.id === session!.humanId && !session!.finished;
}
function lessonAllows(command: Command, card: Card | undefined): boolean {
  if (mode !== "learn" || !modeCtx?.lesson) return true;
  const ls = modeCtx.lesson;
  if (ls.require.type === "finish") return true;
  if (lessonAwaiting === "chooseColor") return command.type === "chooseColor";
  if (ls.require.type !== command.type) return false;
  if (ls.require.type === "play" && ls.require.match) return !!(card && ls.require.match(card));
  return true;
}
function lessonAdvanced(): void {
  if (mode !== "learn" || !modeCtx?.lesson) return;
  const ls = modeCtx.lesson;
  if (lessonAwaiting === "play" && ls.thenRequire) lessonAwaiting = ls.thenRequire.type;
  else if (lessonAwaiting !== "finish") completeLesson(ls);
}
function completeLesson(ls: Lesson): void {
  const p = progress();
  if (p.tutorials[ls.id]) return;
  p.tutorials[ls.id] = true;
  platform.persist();
  checkAchievements(null, false);
  sfx("achievement");
  app.lessonDone = ls;
  openOverlay("lesson");
}
function dispatchHuman(command: Command): void {
  const s = session;
  if (!s || s.finished) return;
  command.player = s.humanId;
  const card = command.cardId ? s.state.players[0]!.hand.find((c) => c.id === command.cardId) : undefined;
  if (!lessonAllows(command, card)) {
    announce(tr(modeCtx!.lesson!.hintText));
    sfx("invalid");
    return;
  }
  const res = s.dispatch(command);
  if (res.ok) lessonAdvanced();
}
export function playCard(cardId: string): void { sfx("select"); dispatchHuman({ type: "play", cardId }); }
export function drawCard(): void { dispatchHuman({ type: "draw" }); }
export function chooseColor(color: ColorId): void { sfx("select"); dispatchHuman({ type: "chooseColor", color }); }
export function showHint(): void {
  const s = session;
  if (!s) return;
  if (mode === "learn" && modeCtx?.lesson) { sfx("hint"); announce(tr(modeCtx.lesson.hintText)); return; }
  const h = s.hint();
  if (!h.ok || !h.action) { announce(tr("No hint available right now")); return; }
  sfx("hint");
  if (h.action.type === "play") {
    announce(tr("Hint: play {card}", { card: cardLabel(s.state.players[0]!.hand.find((c) => c.id === h.action!.cardId)) }));
    app.hint = { cardId: h.action.cardId!, until: now() + 1.6 };
  } else if (h.action.type === "draw") announce(tr("Hint: draw a card"));
  else announce(tr("Hint: choose your strongest color"));
}
export function doUndo(): void {
  const s = session;
  if (!s) return;
  const r = s.undo();
  if (!r.ok) announce(tr("Cannot undo: {reason}", { reason: reasonText(r.reason) }));
}

// ------------------------------------------------------------------ pause and settings
export function pauseGame(): void {
  if (!session || session.finished || app.screen !== "game" || app.overlay || colorChoicePending()) return;
  session.pause();
  openOverlay("pause");
}
export function openSettings(): void {
  if (session && !session.finished) session.pause();
  openOverlay("settings");
}
export function restartRound(): void {
  const s = session;
  if (mode === "journey" && modeCtx?.stage) return startJourneyStage(modeCtx.stage);
  if (mode === "challenge" && modeCtx?.challenge) return startChallenge(modeCtx.challenge);
  if (mode === "learn" && modeCtx?.lesson) return startLesson(modeCtx.lesson);
  if (mode === "daily") return startDaily();
  if (mode === "practice" && s) {
    return newSession(s.state.config, "practice", null, s.state.players.map((p) => ({ id: p.id, name: p.name, isAI: p.isAI, aiLevel: p.aiLevel })));
  }
  titleScreen();
}
export function saveAndQuit(): void {
  if (session && !session.finished) { platform.getDoc().snapshot = session.snapshot(); platform.persist(); }
  titleScreen();
}
export function quitWithoutSaving(): void {
  if (session && !session.finished) session.dispatch({ type: "resign", player: session.humanId, id: "resign-" + Math.floor(platform.nowMs()).toString(36) });
  titleScreen();
}

// ------------------------------------------------------------------ round end and results
function onRoundEnd(st: State): void {
  if (progressRecorded || !session) return;
  progressRecorded = true;
  const doc = platform.getDoc();
  doc.snapshot = null;
  const p = doc.progress;
  const humanWon = st.winner === session.humanId;
  const total = st.scores?.total ?? 0;
  p.stats.roundsPlayed++;
  if (humanWon) {
    p.stats.wins++;
    p.stats.winStreak++;
    p.stats.bestWinStreak = Math.max(p.stats.bestWinStreak, p.stats.winStreak);
    p.mastery.points += total;
  } else p.stats.winStreak = 0;
  let journeyMet: boolean | null = null;
  if (mode === "journey" && modeCtx?.stage) {
    journeyMet = C.goalMet(modeCtx.stage, st, session.humanDraws);
    const prev = p.journey[modeCtx.stage.id] || { goalMet: false, best: 0 };
    p.journey[modeCtx.stage.id] = { ...prev, goalMet: !!(prev.goalMet || journeyMet), best: Math.max(prev.best || 0, humanWon ? total : 0) };
  }
  if (mode === "challenge" && modeCtx?.challenge) {
    const prev = p.challenges[modeCtx.challenge.id] || { completed: false, best: 0 };
    p.challenges[modeCtx.challenge.id] = { completed: !!(prev.completed || humanWon), best: Math.max(prev.best || 0, humanWon ? total : 0) };
  }
  if (mode === "daily" && modeCtx?.daily && humanWon) p.stats.dailyCompleted[modeCtx.daily.date] = true;
  if (mode === "learn" && modeCtx?.lesson && humanWon && modeCtx.lesson.require.type === "finish") p.tutorials[modeCtx.lesson.id] = true;
  checkAchievements(st, humanWon);
  platform.persist();
  const info: ResultsInfo = { st, humanWon, journeyMet };
  stepTimers.scheduler(() => resultsScreen(info), 650);
}
function checkAchievements(st: State | null, humanWon: boolean): void {
  const p = progress();
  const unlock = (key: string): void => {
    if (p.achievements[key]) return;
    p.achievements[key] = Math.floor(platform.nowMs());
    sfx("achievement");
    announce(tr("Achievement unlocked: {name}", { name: ACHIEVEMENTS[key] ? tr(ACHIEVEMENTS[key]!) : key }));
  };
  if (humanWon) unlock("first-win");
  if (humanWon && st?.scores && st.scores.total >= 100) unlock("century");
  if (p.stats.winStreak >= 3) unlock("streak-3");
  if (mode === "journey" && modeCtx?.stage?.mastery && session && C.goalMet(modeCtx.stage, session.state, session.humanDraws)) unlock("journey-mastery");
  if (C.LESSONS.every((ls) => p.tutorials[ls.id])) unlock("all-lessons");
}
function resultsScreen(info: ResultsInfo): void {
  if (!session) return; // the player already left
  app.overlay = null;
  app.results = info;
  app.lb = null;
  // StarHermit high-score board: a won ranked round's points (not Practice or Learn).
  if (info.humanWon && mode !== "learn" && mode !== "practice" && platform.signedIn()) {
    const line = { state: "lbPosting" as const };
    app.lb = line;
    void platform.postLeaderboard(info.st.scores?.total ?? 0).then((r) => {
      if (app.lb !== line) return;
      app.lb = { state: !r.posted ? "lbNotPosted" : r.rank ? "lbRank" : "lbPosted", rank: r.rank };
    });
  }
  showScreen("results", "btn-play-again");
  const total = info.st.scores?.total ?? 0;
  announce(info.humanWon ? tr("You win.") + " " + tr("Score {n} points.", { n: total }) : tr("{name} wins.", { name: playerName(info.st.winner) }) + " " + tr("Score {n} points.", { n: total }));
}
export function nextStage(): void {
  const st = modeCtx?.stage;
  const next = st ? C.JOURNEY[st.index] : undefined; // index is 1-based: the next entry
  if (next) startJourneyStage(next);
}
export function nextLesson(): void {
  const ls = modeCtx?.lesson ?? app.lessonDone;
  const next = ls ? C.LESSONS[C.LESSONS.indexOf(ls) + 1] : undefined;
  clearOverlay();
  if (next) startLesson(next);
}

// ------------------------------------------------------------------ the platform
export async function copyInvite(): Promise<void> {
  const link = platform.inviteLink();
  let ok = false;
  if (link) { try { clipboard.writeText(link); ok = true; } catch { ok = false; } }
  toast(() => (ok ? pt("inviteCopied") : pt("inviteFailed")));
}
export function signIn(): void { void requestSignIn().catch(() => undefined); }

// ------------------------------------------------------------------ input
onAction((e) => {
  if (!e.pressed) return;
  const fresh = frame().frame !== app.openedFrame && frame().frame !== app.overlayOpenedFrame;
  if (e.action === "cancel") {
    if (app.overlay) { if (fresh) closeOverlay(); }
    else if (app.screen === "game" && session && !session.finished && fresh) pauseGame();
    else if (fresh && (app.screen === "practice" || app.screen === "journey" || app.screen === "challenges" || app.screen === "learn")) titleScreen();
    return;
  }
  if (!tableLive()) return;
  if (e.action === "pause") pauseGame();
  else if (e.action === "draw") { ui.setFocus(null); drawCard(); }
  else if (e.action === "hint") showHint();
  else if (e.action === "undo") doUndo();
});

// ------------------------------------------------------------------ boot and lifecycle
let lookKey = "";
function applyLook(): void {
  const f = frame();
  const key = `${f.quality}:${f.levelIndex}`;
  if (key === lookKey) return;
  lookKey = key;
  const look = lookFor(f.quality, f.levelIndex);
  setDetailed(look.detailed);
  render.applyLook(look);
}

onStart(() => {
  setFixedRate(60);
  initStyles();
  platform.initPlatform();
  audio.loadSfx();
  render.setReducedMotion(preferences().reducedMotion);
  applyLook();
  titleScreen();
});
onPreferencesChange((p) => render.setReducedMotion(p.reducedMotion));
platform.onSettingsChange(() => { if (session) render.sync(session.state, cardHex); });
onSessionEnded(() => {
  app.signedOut = true;
  toast(() => pt("signedOut"));
});
onPlayerChange((p) => { if (p) app.signedOut = false; });
onSuspend(() => {
  // A hidden window halts the AI and the turn timer (the browser build's visibilitychange).
  suspended = true;
  if (session && !session.finished) session.pause();
  platform.flush();
});
onResume(() => {
  suspended = false;
  if (session && !session.finished && !app.overlay) session.resume();
});
onQuit(() => { platform.flush(); });

onFixedUpdate(() => {
  if (suspended) return;
  simMs += STEP_MS;
  if (!timers.length) return;
  for (const t of [...timers]) {
    if (--t.left <= 0) { const i = timers.indexOf(t); if (i >= 0) timers.splice(i, 1); t.fn(); }
  }
});

let frameDt = 0;
onUpdate((dt) => {
  frameDt = dt;
  applyLook();
  audio.update();
  const t0 = now();
  if (app.toast && app.toast.until < t0) app.toast = null;
  if (app.hint && t0 > app.hint.until) app.hint = null;
});
onRender(() => {
  const f = frame();
  render.resize(f.width, f.height, f.width / ui.preferences().scale);
  drawScreens();
  render.update(frameDt);
});
