/* Color Eights — ordered module loader (browser). */
import * as THREE from '../vendor/three.module.js';

// The existing game modules expose a small browser-global API. Static imports
// would evaluate render.js before this assignment, so load them in order.
window.THREE = THREE;

// Startup watchdog: if the boot never replaces the Loading screen (a missing
// module, a thrown import, a stalled network) the player sees why and can retry
// instead of staring at "Loading…" forever.
const bootEl = document.getElementById('ce-ui');
const watchdog = setTimeout(() => showBootFailure('The game is taking too long to start.'), 15000);
function showBootFailure(reason) {
  if (!bootEl || !bootEl.classList.contains('ce-boot') || !/Loading/.test(bootEl.textContent)) return;
  bootEl.innerHTML = '';
  const p = document.createElement('p');
  p.textContent = reason + ' Check your connection and try again.';
  const b = document.createElement('button');
  b.className = 'ce-btn'; b.type = 'button'; b.textContent = 'Retry';
  b.addEventListener('click', () => location.reload());
  bootEl.append(p, b);
}
window.addEventListener('error', (e) => { if (e.message) showBootFailure('The game failed to start (' + e.message + ').'); }, { once: true });
window.addEventListener('unhandledrejection', () => showBootFailure('The game failed to start.'), { once: true });

try {
await import('./rules.js');
await import('./content.js');
await import('./session.js');
await import('./store.js');
await import('./audio.js');
await import('./platform.js');
await import('./render.js');
await import('./ui.js');
await import('./game.js');
await import('./app.js');
} catch (err) {
  showBootFailure('The game failed to start (' + (err && err.message ? err.message : 'module error') + ').');
  throw err;
}
clearTimeout(watchdog);
