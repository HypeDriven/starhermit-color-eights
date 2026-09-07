/* Color Eights — ui: responsive DOM shell, focus, settings, overlays. */
(function (global) {
  'use strict';

  const root = () => global.document.getElementById('ce-root');
  function el(tag, cls, text) {
    const e = global.document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  let screenEl = null;
  function setScreen(cls) {
    if (screenEl && screenEl.className === 'ce-screen ' + cls) return;
    // First call replaces the static boot element (#ce-ui), never the canvas.
    const old = screenEl || global.document.getElementById('ce-ui');
    screenEl = el('div', 'ce-screen ' + cls);
    screenEl.id = 'ce-ui';
    if (old && old.parentNode) old.parentNode.replaceChild(screenEl, old);
    else root().appendChild(screenEl);
  }

  function clear() { if (screenEl) screenEl.innerHTML = ''; }

  function append(node) { if (screenEl) screenEl.appendChild(node); return node; }

  // Live region for announcements
  let liveRegion = null;
  function announce(text) {
    if (!liveRegion) {
      liveRegion = el('div', 'ce-live');
      liveRegion.setAttribute('role', 'status');
      liveRegion.setAttribute('aria-live', 'polite');
      root().appendChild(liveRegion);
    }
    liveRegion.textContent = text || '';
  }

  global.CEUI = { setScreen, clear, append, el, announce };
})(typeof window !== 'undefined' ? window : globalThis);
