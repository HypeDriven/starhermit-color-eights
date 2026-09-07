/* Color Eights — audio: WebAudio buses, procedural SFX + music, focus/background behavior. */
(function (global) {
  'use strict';

  const BUSES = ['music', 'effects', 'ambience'];
  let ctx = null;
  let masterGain = null, sfxGain = null, musGain = null, ambGain = null;
  let muted = false;
  let musicOn = false;
  let musicNodes = []; // live oscillator/gain nodes of the pad loop
  const busVolumes = { music: 0.6, effects: 0.8, ambience: 0.5 };

  // Authored sample SFX (sfx/<name>.opus), mapped from events via sfx/manifest.json.
  // Samples are lazy-fetched/decoded after the user-gesture unlock (ensureCtx);
  // the procedural synthesis below remains the fallback while loading/on failure.
  const sampleCache = new Map(); // name -> { status, buffer?, promise }
  const sampleRotate = new Map(); // event -> rotation index
  let manifestPromise = null;
  let eventSamples = null; // event -> [sample names]

  function loadManifest() {
    if (!manifestPromise) {
      manifestPromise = fetch('sfx/manifest.json')
        .then((r) => (r.ok ? r.json() : []))
        .then((list) => {
          eventSamples = {};
          (Array.isArray(list) ? list : []).forEach((item) => {
            if (item && item.name && item.event) {
              (eventSamples[item.event] = eventSamples[item.event] || []).push(item.name);
            }
          });
        })
        .catch(() => { eventSamples = {}; });
    }
    return manifestPromise;
  }

  function loadSample(name) {
    const entry = sampleCache.get(name);
    if (entry) return entry.promise;
    const c = ensureCtx();
    const promise = fetch('sfx/' + name + '.opus')
      .then((r) => {
        if (!r.ok) throw new Error('sfx http ' + r.status);
        return r.arrayBuffer();
      })
      .then((ab) => c.decodeAudioData(ab))
      .then((buffer) => {
        sampleCache.set(name, { status: 'ready', buffer, promise });
        return buffer;
      })
      .catch(() => {
        sampleCache.set(name, { status: 'error', promise });
        return null;
      });
    sampleCache.set(name, { status: 'loading', promise });
    return promise;
  }

  function playBuffer(buffer) {
    const c = ensureCtx();
    const src = c.createBufferSource();
    src.buffer = buffer;
    src.connect(sfxGain);
    src.onended = () => { try { src.disconnect(); } catch (e) {} };
    src.start();
  }

  // Returns true when an authored sample handled the event, false when the
  // caller should run the procedural synthesis fallback.
  function tryPlaySample(name) {
    loadManifest().then(() => {
      const names = eventSamples && eventSamples[name];
      if (names) names.forEach(loadSample);
    });
    const names = eventSamples && eventSamples[name];
    if (!names) return false;
    const ready = [];
    names.forEach((n) => {
      const entry = sampleCache.get(n);
      if (entry && entry.status === 'ready') ready.push(entry.buffer);
    });
    if (!ready.length) return false;
    const idx = (sampleRotate.get(name) || 0) % ready.length;
    sampleRotate.set(name, idx + 1);
    playBuffer(ready[idx]);
    return true;
  }

  function ensureCtx() {
    if (!ctx) {
      const AC = global.AudioContext || (global.window && global.window.AudioContext);
      ctx = new AC();
      masterGain = ctx.createGain(); masterGain.gain.value = 0.9; masterGain.connect(ctx.destination);
      sfxGain = ctx.createGain(); sfxGain.connect(masterGain);
      musGain = ctx.createGain(); musGain.connect(masterGain);
      ambGain = ctx.createGain(); ambGain.connect(masterGain);
      applyBusVolumes();
    }
    return ctx;
  }

  function blip(freq, dur, type, gain) {
    const c = ensureCtx();
    const o = c.createOscillator(), g = c.createGain();
    o.type = type || 'sine'; o.frequency.value = freq;
    g.gain.setValueAtTime(gain != null ? gain : 0.2, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
    o.connect(g); g.connect(sfxGain);
    o.start(); o.stop(c.currentTime + dur);
    o.onended = () => { try { o.disconnect(); } catch (e) {} };
  }

  function playSfx(name) {
    if (!name || muted) return;
    ensureCtx();
    if (tryPlaySample(name)) return;
    switch (name) {
      case 'select': blip(660, 0.12); break;
      case 'card': blip(440, 0.18); break;
      case 'draw': blip(330, 0.15); break;
      case 'action': blip(520, 0.22); break;
      case 'win': blip(784, 0.4); break;
      default: blip(440, 0.15);
    }
  }

  function applyBusVolumes() {
    if (!ctx) return;
    sfxGain.gain.value = muted ? 0 : busVolumes.effects;
    musGain.gain.value = muted ? 0 : busVolumes.music;
    ambGain.gain.value = muted ? 0 : busVolumes.ambience;
  }
  function setVolume(bus, v) {
    if (!BUSES.includes(bus)) return;
    busVolumes[bus] = Math.max(0, Math.min(1, Number(v) || 0));
    applyBusVolumes();
  }

  function startMusic() {
    if (musicOn) return;
    musicOn = true;
    const c = ensureCtx();
    applyBusVolumes();
    // simple ambient pad loop
    musicNodes = [261.63, 329.63].map((f, i) => {
      const o = c.createOscillator(), g = c.createGain();
      o.type = 'sine'; o.frequency.value = f;
      g.gain.value = 0.08 + i * 0.02;
      o.connect(g); g.connect(musGain);
      o.start();
      return { o, g };
    });
  }

  function stopMusic() {
    musicOn = false;
    for (const n of musicNodes) {
      try { n.g.gain.setTargetAtTime(0, ctx.currentTime, 0.05); n.o.stop(ctx.currentTime + 0.2); } catch (e) {}
    }
    musicNodes = [];
  }

  global.CEAudio = {
    BUSES, ensureCtx, playSfx, startMusic, stopMusic, setVolume,
    setMuted(m) { muted = !!m; applyBusVolumes(); }, isMuted() { return muted; },
    isPlaying: () => musicOn,
  };
})(typeof window !== 'undefined' ? window : globalThis);
