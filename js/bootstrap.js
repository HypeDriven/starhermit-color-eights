/* Color Eights — ordered module loader (browser). */
import * as THREE from '../vendor/three.module.js';

// The existing game modules expose a small browser-global API. Static imports
// would evaluate render.js before this assignment, so load them in order.
window.THREE = THREE;
await import('./rules.js');
await import('./content.js');
await import('./session.js');
await import('./store.js');
await import('./audio.js');
await import('./platform.js');
await import('./render.js');
await import('./ui.js');
await import('./game.js');
