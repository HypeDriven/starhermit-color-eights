// Sound, as the browser build's js/audio.js: the authored one-shots
// (sfx/<name>.opus) per game event from sfx/manifest.json, several clips per
// event taken in turn, and the quiet two-tone pad (C4 + E4 sines) as music.
//
// The browser build's buses become the runtime's (Options › Audio owns the
// volumes, the mute and the voice limit): music → "music", effects →
// "effects", the button tick → "interface"; its default levels (master 0.9,
// music 0.6, effects 0.8) are folded into each sound's gain. The pad, which
// the browser build played with two live oscillators, is rendered once into
// a seamless loop (OfflineAudioContext); the synthesized blips it played while a
// sample loaded are not ported (the engine's web runtime drops clip loads
// while a synthesis graph changes: the arrow-exodus finding). Every clip
// loads at once in onStart (each reaches the mixer when it is ready); the
// pad starts once the mixer runs (in a browser after the first press).
import { context, createClip, loadClip, OfflineAudioContext, play as playClip, SoundBank, type AudioClip, type Sound } from "starhermit:audio";
import { files } from "starhermit:engine";

const MASTER = 0.9;
const LEVEL = { music: 0.6 * MASTER, effects: 0.8 * MASTER };
export type SfxEvent = "select" | "card" | "draw" | "action" | "win" | "lose" | "invalid" | "undo" | "turn" | "penalty" | "onecard" | "hint" | "achievement" | "shuffle";

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

const banks = new Map<string, SoundBank>();
/** Loads every clip at once (onStart) and renders the pad; an event whose clips are still loading is silent. */
export function loadSfx(): void {
  const loads = new Map<string, Promise<AudioClip | null>>();
  const load = (name: string): Promise<AudioClip | null> => {
    let p = loads.get(name);
    if (!p) {
      p = loadClip(`sfx/${name}.opus`).catch((e: unknown) => { console.warn(`sfx ${name}: ${String(e)}`); return null; });
      loads.set(name, p);
    }
    return p;
  };
  for (const [event, names] of byEvent) {
    void Promise.all(names.map(load)).then((loaded) => {
      const list = loaded.filter((c) => c !== null);
      // In turn, as the browser build's sampleRotate.
      if (list.length) banks.set(event, new SoundBank({ clips: list, order: "sequence", bus: event === "select" ? "interface" : "effects", gain: LEVEL.effects }));
    });
  }
  renderPad().then((c) => { pad = c; }, (e: unknown) => console.warn(`audio: ${String(e)}`));
}

/** The event's next clip. */
export function sfx(event: SfxEvent): void {
  try { banks.get(event)?.play(); }
  catch { /* the mixer is full this frame: skip it */ }
}

// -- the pad ----------------------------------------------------------------------------------
const RATE = 22050;
const LOOP_S = 4;
/** C4 and E4 sines at 0.08 and 0.10, each tuned to whole cycles in the loop so it repeats seamlessly. */
async function renderPad(): Promise<AudioClip> {
  const off = new OfflineAudioContext(1, LOOP_S * RATE, RATE);
  for (const [f, level] of [[261.63, 0.08], [329.63, 0.1]] as const) {
    const osc = off.createOscillator();
    osc.frequency.value = Math.round(f * LOOP_S) / LOOP_S;
    const gain = off.createGain();
    gain.gain.value = level;
    osc.connect(gain).connect(off.destination);
    osc.start();
  }
  const r = await off.startRendering();
  return createClip(r);
}
let pad: AudioClip | null = null;
let padSound: Sound | null = null;

/** Each frame: once the pad is rendered and the mixer runs, starts it. */
export function update(): void {
  if (pad && !padSound && context.state === "running") {
    try { padSound = playClip(pad, { bus: "music", gain: 0.0001, loop: true }); padSound.fade(LEVEL.music, 1.5); }
    catch { padSound = null; }
  }
}
