/* Color Eights — ordered module loader (browser). */
import * as THREE from '../vendor/three.module.js';

// The existing game modules expose a small browser-global API. Static imports
// would evaluate render.js before this assignment, so load them in order.
window.THREE = THREE;

// Startup watchdog: if the boot never replaces the Loading screen (a missing
// module, a thrown import, a stalled network) the player sees why and can retry
// instead of staring at "Loading…" forever.
const bootEl = document.getElementById('ce-ui');
const T = (k, v) => (window.CEI18N ? window.CEI18N.T(k, v) : String(k).replace(/\{(\w+)\}/g, (m, x) => (v && x in v ? v[x] : m)));
const watchdog = setTimeout(() => showBootFailure(T('The game is taking too long to start.')), 15000);
function showBootFailure(reason) {
  // Already replaced by the game (or a failure is already shown): nothing to do.
  if (!bootEl || !bootEl.isConnected || !bootEl.classList.contains('ce-boot') || bootEl.querySelector('button')) return;
  bootEl.innerHTML = '';
  const p = document.createElement('p');
  p.textContent = reason + ' ' + T('Check your connection and try again.');
  const b = document.createElement('button');
  b.className = 'ce-btn'; b.type = 'button'; b.textContent = T('Retry');
  b.addEventListener('click', () => location.reload());
  bootEl.append(p, b);
}
window.addEventListener('error', (e) => { if (e.message) showBootFailure(T('The game failed to start ({error}).', { error: e.message })); }, { once: true });
window.addEventListener('unhandledrejection', () => showBootFailure(T('The game failed to start.')), { once: true });

try {
await import('./rules.js');
await import('./content.js');
await import('./session.js');
await import('./store.js');
await import('./audio.js');
await import('./platform.js');
await import('./gfx.js');
// Post-processing / IBL addons are optional: without them the game renders directly.
try { await import('./post.js'); } catch (e) { window.CEPost = null; }
await import('./render.js');
await import('./gfx-ui.js');
await import('./ui.js');
await import('./game.js');
await import('./app.js');
} catch (err) {
  showBootFailure(T('The game failed to start ({error}).', { error: err && err.message ? err.message : 'module error' }));
  throw err;
}
clearTimeout(watchdog);
