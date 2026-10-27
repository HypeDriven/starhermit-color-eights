// The game's data and the StarHermit platform, on the runtime's modules:
// - progress (journey goals and bests, lessons, achievements, stats, daily
//   wins, challenges, mastery points) and the "Save & quit" round are the
//   game's save (starhermit:storage `saves`): { v: 1, progress, snapshot } on
//   the device and in the player's cloud slot, two devices' copies merged on
//   a conflict (js/store.js mergeDocs: the better of both progress records).
//   The slot the browser build wrote (the JS SDK's zipped save.json holding
//   its checksummed { settings, progress } documents) shows as foreign and
//   is merged in and replaced once;
// - the game's own options (the colour palette, the practice table's
//   Stacking and Draw-to-match) are `settings` (game.<key>, synced with the
//   account); the browser build's settings (its save's settings document
//   and the account's per-player settings groups audio, graphics,
//   accessibility, camera, rulesOptions and ui.language) are migrated, then
//   the legacy keys removed. Volumes, mute, graphics, the language, reduced
//   motion, high contrast and text size are the runtime's Options;
// - the player (signed in or a guest), the invite link, posting a won
//   round's points through score-script.js (a practice session whose socket
//   carries { type: 'result', scores }, as the JS SDK's submitScores did)
//   with the rank on the high-score board, and the platform's clock for the
//   daily's date.
import type { JsonValue } from "starhermit:engine";
import {
  connectGame, inviteLink as fetchInviteLink, leaderboards, onPlayerChange, player, serverNow, serverTime, sessions,
} from "starhermit:platform";
import { saves, settings as store, storage } from "starhermit:storage";
import { Store as M, type Doc, type GameSettings, type Progress } from "./classic.ts";

// --- the save ------------------------------------------------------------------------------
let doc: Doc = M.normalizeDoc({});
let lastSavedAt = 0;
const mergedListeners = new Set<() => void>();
/** fn() after progress from the account (another device, the browser build) was merged in. */
export function onProgressMerged(fn: () => void): void { mergedListeners.add(fn); }
function merged(): void { for (const fn of mergedListeners) fn(); }

export function getDoc(): Doc { return doc; }
export function progress(): Progress { return doc.progress; }
/** Writes the save (device at once, the account debounced by the runtime). */
export function persist(): void {
  try { saves.save(doc as unknown as JsonValue, { schema: 1 }); }
  catch (e) { console.warn(`save: ${String(e)}`); }
}

/** Takes a document in (merged with what this device has); whether it changed. */
function adopt(other: Doc | null): boolean {
  if (!other) return false;
  const before = JSON.stringify(doc);
  const next = M.mergeDocs(other, doc);
  if (JSON.stringify(next) === before) return false;
  doc = next;
  return true;
}

saves.onConflict((local, remote) => ({
  merged: M.mergeDocs(M.docFromSave(remote.data), M.docFromSave(local?.data)) as unknown as JsonValue,
}));
saves.onStatus((_status, state) => {
  if (state === "foreign") { migrateForeign(); return; }
  // The account's save replaced the device's (another device saved last): merge it in.
  const cur = saves.load();
  if (cur && cur.savedAt !== lastSavedAt) {
    lastSavedAt = cur.savedAt;
    if (adopt(M.docFromSave(cur.data))) { persist(); merged(); }
  }
});

/** The browser build's cloud save: merged with this device's progress, saved over it once. */
function migrateForeign(): void {
  const old = saves.foreign();
  if (!old) return;
  const { progress: p, settings: s } = M.fromBrowserSave(old.text);
  const changed = p ? adopt({ v: 1, progress: p, snapshot: null }) : false;
  if (s) for (const [k, v] of Object.entries(s)) adoptSetting(k, v);
  try { saves.save(doc as unknown as JsonValue, { schema: 1, replaceForeign: true }); }
  catch (e) { console.warn(`save migration: ${String(e)}`); }
  if (changed) merged();
}

/** For the title's account line: offline (a guest) | saving | synced | error. */
export function syncState(): "offline" | "saving" | "synced" | "error" {
  if (!player()) return "offline";
  const st = saves.state();
  if (st === "error" || st === "read-blocked") return "error";
  if (st === "loading" || st === "uploading" || st === "foreign" || saves.status() === "pending") return "saving";
  return "synced";
}
export function flush(): void { void saves.flush().catch(() => undefined); }

// --- the game's settings -------------------------------------------------------------------
export const settings: GameSettings = { ...M.DEFAULT_SETTINGS };
const settingsListeners = new Set<() => void>();
export function onSettingsChange(fn: () => void): void { settingsListeners.add(fn); }
function settingsChanged(): void { for (const fn of settingsListeners) fn(); }
function readSetting(key: string): void {
  let v: JsonValue | undefined;
  try { v = store.get(key); } catch { return; }
  const ok = M.checkSetting(key, v);
  if (ok !== undefined) settings[key] = ok;
}
/** A migrated value, kept unless this game set the key since. */
function adoptSetting(key: string, value: unknown): void {
  const v = M.checkSetting(key, value);
  if (v === undefined || store.get(key) !== undefined) return;
  try { store.set(key, v as JsonValue); settings[key] = v; settingsChanged(); } catch { /* keep the device's */ }
}
/** Changes one of the game's settings (device and account). */
export function setSetting(key: "palette" | "stacking" | "drawToMatch", value: boolean | string): void {
  if (settings[key] === value) return;
  (settings as Record<string, unknown>)[key] = value;
  try { store.set(key, value); } catch (e) { console.warn(`setting ${key}: ${String(e)}`); }
  settingsChanged();
}
// The browser build's per-player settings groups: the game's options among
// them carry over (unless this game set them since), then all are removed.
function importLegacy(): void {
  const keys = store.legacyKeys();
  if (!keys) return;
  const groups: Record<string, unknown> = {};
  for (const key of keys) if (key === "accessibility" || key === "rulesOptions") groups[key] = store.legacy(key);
  for (const [k, v] of Object.entries(M.gameSettingsFrom(groups))) adoptSetting(k, v);
  for (const key of keys) if (M.BROWSER_SETTING_KEYS.includes(key)) store.removeLegacy(key);
}

/** Reads the device's save and the game's settings (from onStart). */
export function initPlatform(): void {
  const cur = saves.load();
  lastSavedAt = cur?.savedAt ?? 0;
  const d = M.docFromSave(cur?.data);
  if (d) doc = d;
  else if (!cur) persist();
  for (const k of M.GAME_SETTING_KEYS) readSetting(k);
  store.onChange((key) => {
    if (!M.GAME_SETTING_KEYS.includes(key)) return;
    readSetting(key);
    settingsChanged();
  });
  store.onLegacy(importLegacy);
  importLegacy();
  if (saves.state() === "foreign") migrateForeign();
  settingsChanged();
  refreshPlayer();
  void serverTime().catch(() => undefined);
}

// --- the player ----------------------------------------------------------------------------
export function signedIn(): boolean { return !!player(); }
export function displayName(): string { return player()?.displayName ?? ""; }
let invite: string | null = null;
/** The invite link, fetched ahead so a button press can copy it at once. */
export function inviteLink(): string | null { return player() ? invite : null; }
function refreshPlayer(): void {
  invite = null;
  if (!player()) return;
  fetchInviteLink().then((u) => { invite = u; }, () => { invite = null; });
  void highScoreBoard().catch(() => null);
}
onPlayerChange(() => refreshPlayer());

/** Now in ms by the platform's clock when it has answered, else the device's. */
export function nowMs(): number { return serverNow() ?? Date.now(); }

// --- the StarHermit high-score board -------------------------------------------------------
const BOARD_KEY = "coloreights.board-id";
let boardId: string | null = null;
/** The high-score board's id: listed signed in, then kept on the device. */
async function highScoreBoard(): Promise<string | null> {
  if (boardId) return boardId;
  if (player()) {
    try {
      const list = await leaderboards.list();
      const b = list.find((x) => x.key === "high-score") ?? list[0];
      if (b) { boardId = b.id; try { storage.set(BOARD_KEY, b.id); } catch { /* full */ } }
    } catch { /* offline */ }
  }
  if (!boardId) { try { boardId = storage.getText(BOARD_KEY); } catch { boardId = null; } }
  return boardId;
}

/** Signed in only: post a won round's points through score-script.js; { posted, rank }. Never rejects. */
export async function postLeaderboard(total: number): Promise<{ posted: boolean; rank: number | null }> {
  const me = player();
  if (!me) return { posted: false, rank: null };
  const score = Math.max(0, Math.round(total));
  let accepted: string[] = [];
  try {
    const sessionId = await sessions.practice();
    accepted = await new Promise<string[]>((resolve) => {
      const socket = connectGame(sessionId);
      let done = false;
      const finish = (list: string[]): void => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        socket.close();
        resolve(list);
      };
      const timer = setTimeout(() => finish([]), 15000);
      socket.on("open", () => { socket.sendCommand({ type: "result", scores: { "high-score": score } }); });
      socket.on("game", (data) => {
        const d = data as { type?: string; accepted?: string[] } | null;
        if (d && d.type === "result-ack") finish(Array.isArray(d.accepted) ? d.accepted : []);
      });
      socket.on("error", () => finish([]));
      socket.on("stopped", () => finish([]));
      socket.on("abandoned", () => finish([]));
    });
  } catch { return { posted: false, rank: null }; }
  if (!accepted.includes("high-score")) return { posted: false, rank: null };
  try {
    const id = await highScoreBoard();
    if (!id) return { posted: true, rank: null };
    const r = await leaderboards.entries(id, { pageSize: 100 });
    const mine = r.items.find((e) => e.userId === me.userId);
    return { posted: true, rank: mine ? mine.rank : null };
  } catch { return { posted: true, rank: null }; }
}
