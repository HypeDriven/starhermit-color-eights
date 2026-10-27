// The browser build's pure game scripts, shared with the Node tests: the
// rules engine, the content (themes, palettes, the Journey, lessons, the
// daily, challenges), the session controller (command dispatch with
// idempotent ids, undo, hints, AI scheduling, the turn timer, snapshots), the
// save model, and the string tables (js/*.js), evaluated as classic scripts
// so their globals are this module's exports.
import { loadClassic } from "starhermit:script";

for (const f of ["js/rules.js", "js/content.js", "js/session.js", "js/store.js", "js/strings.js", "js/i18n.js", "js/platform-strings.js"]) loadClassic(f);

// -- The shapes this client reads -------------------------------------------------
export type ColorId = "ember" | "tide" | "leaf" | "sol";
export type Kind = "number" | "skip" | "reverse" | "draw2" | "wild" | "wild4";
export interface Card { id: string; kind: Kind; color: ColorId | null; rank?: number }
export interface Player { id: string; name: string; isAI: boolean; aiLevel: string; connected: boolean; hand: Card[] }
export interface PlayerSpec { id: string; name: string; isAI: boolean; aiLevel?: string }
export interface Config {
  seed: string; playerCount: number; handSize?: number; stacking?: boolean; drawToMatch?: boolean; moveLimit?: number;
  turnTimerSec?: number; allowedKinds?: Kind[]; palette?: ColorId[]; contentId?: string; contentVersion?: number;
  assists?: { hint: boolean; undo: boolean };
}
export interface Breakdown { player: string; name: string; cardsLeft: number; handValue: number; detail: { label: string; value: number }[] }
export interface State {
  version: number; config: Config & { assists: { hint: boolean; undo: boolean }; turnTimerSec: number };
  players: Player[]; drawPile: Card[]; discardPile: Card[]; currentColor: ColorId; currentPlayer: number; direction: number;
  pendingDraw: number; phase: "active" | "finished"; turnNumber: number; turnCount: Record<string, number>;
  winner: string | null; terminalReason: "empty-hand" | "resignation" | "move-limit" | null;
  scores: { winner: string; total: number; breakdown: Breakdown[]; reason: string } | null;
  pendingColorChoice: { player: number } | null;
}
export interface Action { type: "play" | "draw" | "chooseColor"; cardId?: string; color?: ColorId }
export interface Command { type: string; player?: string; cardId?: string; color?: ColorId; id?: string }
export interface GameEvent { ev: string; player?: string; card?: Card; count?: number; amount?: number; color?: ColorId; next?: string; reason?: string; winner?: string }

export interface Snapshot { sessionId: string; mode: string; humanId: string; state: string; humanDraws: number; replay: unknown; savedAt: number }
export interface SessionInstance {
  id: string; mode: string; humanId: string; state: State; finished: boolean; humanDraws: number; replay: unknown;
  on(type: "events", fn: (events: GameEvent[]) => void): SessionInstance;
  on(type: "state", fn: (state: State) => void): SessionInstance;
  on(type: "error", fn: (e: unknown) => void): SessionInstance;
  dispatch(cmd: Command): { ok: boolean; reason?: string; duplicate?: boolean };
  undo(): { ok: boolean; reason?: string };
  canUndo(): boolean;
  hint(): { ok: boolean; action?: Action; reason?: string };
  turnTimeLeft(): number;
  snapshot(): Snapshot;
  pause(): void;
  resume(): void;
  isHumanTurn(): boolean;
}
export interface Timers { scheduler(fn: () => void, ms: number): number; canceler(h: number): void; clock(): number }

export interface Theme { id: string; name: string; felt: string; table: string; wall: string; floor: string; key: number; fill: number; accent: string; uiAccent: string; fog: string }
export interface Goal { type: "win" | "win-turns" | "win-no-draw" | "score-min"; turns?: number; points?: number }
export interface Stage { id: string; index: number; name: string; intro?: string; seed: string; playerCount: number; aiLevel?: string; stacking: boolean; mastery?: boolean; goal: Goal; theme?: string }
export interface Lesson {
  id: string; title: string; text: string; hintText: string; setup: Config;
  require: { type: "play" | "draw" | "finish"; match?: (c: Card) => boolean }; thenRequire?: { type: "chooseColor" };
}
export interface Challenge { id: string; name: string; desc: string; goalLabel: string; config: Config; aiLevel?: string; special?: string }
export interface Daily { id: string; date: string; config: Config }

export interface Progress {
  journey: Record<string, { goalMet: boolean; best: number; stars?: number }>; tutorials: Record<string, boolean>; achievements: Record<string, number>;
  stats: { roundsPlayed: number; wins: number; winStreak: number; bestWinStreak: number; actionCardsUsed: number; dailyCompleted: Record<string, boolean> };
  mastery: { points: number }; challenges: Record<string, { completed: boolean; best: number }>;
}
export interface Doc { v: number; progress: Progress; snapshot: Snapshot | null }
export interface GameSettings { palette: string; stacking: boolean; drawToMatch: boolean; [key: string]: unknown }

interface RulesApi {
  COLORS: ColorId[]; COLOR_INFO: Record<ColorId, { label: string; hex: string; shape: "diamond" | "wave" | "leaf" | "sun" }>;
  KIND_LABEL: Record<Kind, string>;
  legalActions(s: State, playerId: string): { ok: boolean; actions: Action[]; reason?: string };
  explainInvalid(s: State, playerId: string, cardId: string): string | null;
  topDiscard(s: State): Card | undefined;
  serialize(s: State): string;
  deserialize(json: string): State;
}
interface ContentApi {
  THEMES: Record<string, Theme>; DEFAULT_THEME: string; CVD_PALETTES: Record<string, Partial<Record<ColorId, string>> | null>;
  JOURNEY: Stage[]; LESSONS: Lesson[]; CHALLENGES: Challenge[];
  journeyConfig(st: Stage): Config; journeyTheme(st: Stage): string; goalMet(st: Stage, s: State, humanDraws: number): boolean;
  rigLessonState(R: RulesApi, ls: Lesson): State; dailyForDate(date: string): Daily;
}
interface SessionApi {
  createSession(opts: {
    config: Config; mode: string; players?: PlayerSpec[]; restoreState?: string; humanId?: string; sessionId?: string; aiDelayMs?: number;
    scheduler?: Timers["scheduler"]; canceler?: Timers["canceler"]; clock?: Timers["clock"];
  }): SessionInstance;
}
interface StoreApi {
  normalizeDoc(d: unknown): Doc; docFromSave(d: unknown): Doc | null; mergeDocs(remote: Doc | null, local: Doc | null): Doc;
  fromBrowserSave(text: string | null): { progress: Progress | null; settings: Partial<GameSettings> | null };
  gameSettingsFrom(groups: unknown): Partial<GameSettings>;
  GAME_SETTING_KEYS: string[]; BROWSER_SETTING_KEYS: string[]; DEFAULT_SETTINGS: GameSettings; PALETTES: string[];
  checkSetting(key: string, v: unknown): unknown;
}
interface I18nApi {
  T(key: string, vars?: Record<string, string | number> | null): string;
  setLocale(tag: string): string;
  readonly lang: string;
  locales: string[];
}
interface PlatformStringsApi {
  platformStrings(lang: string): Record<string, string>;
  fmtPlatform(s: string, vars?: Record<string, string | number>): string;
}

const g = globalThis as unknown as {
  CERules: RulesApi; CEContent: ContentApi; CESession: SessionApi; CEStore: StoreApi; CEI18N: I18nApi; PlatformStrings: PlatformStringsApi;
};
export const Rules = g.CERules;
export const Content = g.CEContent;
export const Sessions = g.CESession;
export const Store = g.CEStore;
export const I18n = g.CEI18N;
export const PlatformStrings = g.PlatformStrings;
