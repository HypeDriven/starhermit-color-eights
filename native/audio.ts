// Sound, as the browser build's js/audio.js: the authored one-shots
// (sfx/<name>.opus) per game event from sfx/manifest.json, several clips per
// event taken in turn, and the quiet two-tone pad (C4 + E4 sines) as music.
//
// The browser build's buses become the runtime's (Options › Audio owns the
// volumes, the mute and the voice limit): music → "music", effects →
// "effects", the button tick → "interface"; its default levels (master 0.9,
// music 0.6, effects 0.8) are folded into each sound's gain. The pad, which
// the browser build played with two live oscillators, is rendered once into
// a seamless loop (createClip); the synthesized blips it played while a
// sample loaded are not ported (the engine's web runtime drops clip loads
// while a synthesis graph changes: the arrow-exodus finding). Clips load
// once the mixer runs (natively at once, in a browser after the first
// press), one at a time.
import { context, createClip, loadClip, play as playClip, type AudioClip, type Bus, type Sound } from "starhermit:audio";
import { files } from "starhermit:engine";

const MASTER = 0.9;
const LEVEL = { music: 0.6 * MASTER, effects: 0.8 * MASTER };
export type SfxEvent = "select" | "card" | "draw" | "action" | "win" | "lose" | "invalid" | "undo" | "turn" | "penalty" | "onecard" | "hint" | "achievement" | "shuffle";
// The table's cues load first.
const FIRST: SfxEvent[] = ["select", "card", "draw", "shuffle", "action", "turn"];

const byEvent = new Map<string, string[]>();
try {
  const list = files.readJson("sfx/manifest.json") as unknown as { name?: string; event?: string }[];
  for (const item of Array.isArray(list) ? list : []) {
    if (!item || !item.name || !item.event) continue;
    const names = byEvent.get(item.event) ?? [];
    names.push(item.name);
    byEvent.set(item.event, names);
  }
} catch (e) { console.warn(`sfx manifest: ${String(e)}`); }

const clips = new Map<string, AudioClip>();
const queue: string[] = [];
let loading = false;
let wantClips = false;
function load(name: string): void { if (!queue.includes(name) && !clips.has(name)) queue.push(name); }
function pump(): void {
  if (loading || !queue.length) return;
  const name = queue.shift()!;
  loading = true;
  loadClip(`sfx/${name}.opus`).then((c) => { clips.set(name, c); loading = false; }, (e: unknown) => { console.warn(`sfx ${name}: ${String(e)}`); loading = false; });
}
/** Asks for the clips; they load once the mixer runs (see update). */
export function loadSfx(): void { wantClips = true; }

const rotate = new Map<string, number>();
/** The event's next loaded clip (the browser build's sampleRotate). */
export function sfx(event: SfxEvent): void {
  const ready = (byEvent.get(event) ?? []).filter((n) => clips.has(n));
  if (!ready.length) return;
  const i = (rotate.get(event) ?? 0) % ready.length;
  rotate.set(event, i + 1);
  const name = ready[i]!;
  const bus: Bus = event === "select" ? "interface" : "effects";
  try { playClip(clips.get(name)!, { bus, gain: LEVEL.effects }); }
  catch { clips.delete(name); load(name); } // a clip the mixer lost: load it again
}

// -- the pad ----------------------------------------------------------------------------------
const RATE = 22050;
const LOOP_S = 4;
/** C4 and E4 sines at 0.08 and 0.10, each tuned to whole cycles in the loop so it repeats seamlessly. */
function padClip(): AudioClip {
  const n = LOOP_S * RATE;
  const out = new Float32Array(n);
  for (const [f, gain] of [[261.63, 0.08], [329.63, 0.1]] as const) {
    const cycles = Math.round(f * LOOP_S);
    for (let i = 0; i < n; i++) out[i]! += Math.sin((2 * Math.PI * cycles * i) / n) * gain;
  }
  return createClip([out], RATE);
}
let pad: AudioClip | null = null;
let padSound: Sound | null = null;

/** Each frame: the samples once the mixer runs (one at a time), then the pad, started in a frame of its own. */
export function update(): void {
  if (context.state !== "running") return;
  if (wantClips) {
    wantClips = false;
    for (const ev of FIRST) for (const n of byEvent.get(ev) ?? []) load(n);
    for (const names of byEvent.values()) for (const n of names) load(n);
  }
  pump();
  if (loading || queue.length) return;
  if (!pad) { try { pad = padClip(); } catch (e) { console.warn(`audio: ${String(e)}`); } return; }
  if (!padSound) {
    try { padSound = playClip(pad, { bus: "music", gain: 0.0001, loop: true }); padSound.fade(LEVEL.music, 1.5); }
    catch { padSound = null; }
  }
}
