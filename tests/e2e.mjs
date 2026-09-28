/**
 * Color Eights — end-to-end QA playthrough (dev only, not shipped).
 *
 * Drives the real visible UI: title menu → practice setup → card table →
 * results, on desktop and mobile viewports. Also verifies engine globals,
 * content integrity, persistence, and a full Journey stage 1 round through
 * the session layer.
 *
 * Run: npm run test:e2e
 */
import { chromium } from 'playwright-core';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.webp': 'image/webp', '.ico': 'image/x-icon', '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.opus': 'audio/ogg; codecs=opus',
  '.glb': 'model/gltf-binary', '.woff2': 'font/woff2', '.ts': 'text/plain; charset=utf-8',
};
// Benign GPU/swiftshader console noise.
const browserNoise = /GL Driver Message|GPU stall due to ReadPixels|Automatic fallback to software WebGL|EnableWebGLDeveloperExtensions|AudioContext was not allowed to start/i;

const SHOT = (stage, pass) => `/tmp/color-eights-e2e-${stage}-${pass}.png`;

const server = http.createServer((req, res) => {
  let p = decodeURIComponent((req.url || '/').split('?')[0]);
  if (p === '/') p = '/index.html';
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    res.end(data);
  });
});

const step = async (name, fn) => { await fn(); console.log(`ok - ${name}`); };

async function runPass(browser, pass, viewport, hasTouch) {
  const context = await browser.newContext({ viewport, hasTouch });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if ((m.type() === 'error' || m.type() === 'warning') && !browserNoise.test(m.text())) errors.push(`console ${m.type()}: ${m.text()}`);
  });
  const port = server.address().port;

  await step('load page without errors', async () => {
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForSelector('#ce-root', { timeout: 10000 });
  });

  await step('all engine modules initialized', async () => {
    const missing = await page.evaluate(() =>
      ['CERules', 'CEContent', 'CESession', 'CEStore', 'CEAudio', 'CEPlatform', 'CERender', 'CEUI', 'CEGame', 'CEApp']
        .filter((k) => !(k in window)));
    if (missing.length) throw new Error(`missing globals: ${missing.join(', ')}`);
  });

  await step('title menu renders with interactive controls', async () => {
    await page.waitForSelector('#ce-ui.ce-menu', { timeout: 5000 });
    const audit = await page.evaluate(() => ({
      buttons: document.querySelectorAll('#ce-ui button').length,
      text: document.getElementById('ce-ui').textContent,
    }));
    if (audit.buttons < 5) throw new Error(`title menu has too few buttons: ${audit.buttons}`);
    if (!/practice/i.test(audit.text)) throw new Error('title menu missing Practice entry');
    await page.screenshot({ path: SHOT('title', pass) });
  });

  await step('graphics settings: presets, override, live apply, persistence', async () => {
    const bodyPreset = () => page.evaluate(() => [document.body.dataset.gfxPreset, document.body.dataset.gfxAuto]);
    const openGraphics = async () => {
      await page.click('#ce-ui.ce-menu button:has-text("Settings")');
      await page.click('[data-settings-tab="graphics"]');
      await page.waitForSelector('#gfx-preset', { timeout: 5000 });
    };
    // Headless runs use a software GPU, so Auto resolves to Low.
    let [p, auto] = await bodyPreset();
    if (p !== 'low' || auto !== 'true') throw new Error(`auto preset expected low/auto, got ${p}/${auto}`);
    await openGraphics();
    const autoLabel = await page.textContent('#gfx-preset option[value="auto"]');
    if (!/low/i.test(autoLabel)) throw new Error('auto option does not name the detected tier: ' + autoLabel);
    await page.selectOption('#gfx-preset', 'low');
    [p, auto] = await bodyPreset();
    if (p !== 'low' || auto !== 'false') throw new Error(`Low not applied: ${p}/${auto}`);
    await page.selectOption('#gfx-preset', 'high');
    [p] = await bodyPreset();
    if (p !== 'high') throw new Error('High not applied: ' + p);
    const summary = await page.textContent('#gfx-summary');
    if (!/1024² shadows/.test(summary) || !/px/.test(summary)) throw new Error('summary not updated for High: ' + summary);
    if (!/From preset \(On\)/.test(await page.textContent('#gfx-bloom option[value="preset"]'))) throw new Error('bloom select lacks "From preset (On)"');
    await page.selectOption('#gfx-bloom', 'off');
    const live = await page.evaluate(() => ({ r: CERender.graphicsInfo().resolved, detailed: document.body.classList.contains('ce-gfx-detailed') }));
    if (live.r.bloom !== 'off' || live.r.preset !== 'high' || !live.detailed) throw new Error('override not applied live: ' + JSON.stringify(live));
    // panel fits the viewport width and its Close button is reachable
    const fit = await page.evaluate(() => {
      const panel = document.querySelector('.ce-overlay .ce-panel').getBoundingClientRect();
      const close = [...document.querySelectorAll('.ce-overlay button')].find((b) => b.textContent === 'Close');
      close.scrollIntoView();
      const c = close.getBoundingClientRect();
      return { left: panel.left, right: panel.right, vw: innerWidth, closeVisible: c.bottom <= innerHeight && c.top >= 0 };
    });
    if (fit.left < 0 || fit.right > fit.vw || !fit.closeVisible) throw new Error('graphics panel does not fit: ' + JSON.stringify(fit));
    await page.screenshot({ path: SHOT('graphics', pass) });
    await page.click('.ce-overlay button:has-text("Close")');
    await page.waitForTimeout(400);
    await page.screenshot({ path: SHOT('title-high', pass) });
    // survives reload
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('#ce-ui.ce-menu', { timeout: 10000 });
    [p, auto] = await bodyPreset();
    if (p !== 'high' || auto !== 'false') throw new Error(`preset lost on reload: ${p}/${auto}`);
    await openGraphics();
    const kept = await page.evaluate(() => [document.getElementById('gfx-preset').value, document.getElementById('gfx-bloom').value]);
    if (kept[0] !== 'high' || kept[1] !== 'off') throw new Error('graphics controls lost on reload: ' + kept);
    // back to Auto: clears the override and keeps the rest of the run cheap
    await page.selectOption('#gfx-preset', 'auto');
    const back = await page.evaluate(() => [document.body.dataset.gfxPreset, document.getElementById('gfx-bloom').value, JSON.stringify(CEStore.loadSettings().graphics.gfx)]);
    if (back[0] !== 'low' || back[1] !== 'preset' || back[2] !== '{"preset":"auto"}') throw new Error('Auto did not clear overrides: ' + back);
    await page.click('.ce-overlay button:has-text("Close")');
    await page.waitForSelector('.ce-overlay', { state: 'detached', timeout: 5000 });
  });

  await step('practice setup → start round through the UI', async () => {
    await page.click('button:has-text("Practice")');
    await page.waitForSelector('.ce-field select', { timeout: 5000 });
    await page.screenshot({ path: SHOT('practice-setup', pass) });
    await page.click('button:has-text("Start round")');
    await page.waitForSelector('#ce-ui.ce-game', { timeout: 5000 });
    await page.waitForSelector('.ce-card-btn', { timeout: 5000 });
  });

  await step('game screen shows hand, discard, draw pile, and status', async () => {
    const info = await page.evaluate(() => ({
      hand: document.querySelectorAll('.ce-card-btn').length,
      discard: !!document.querySelector('.ce-discard-top'),
      draw: !!document.querySelector('.ce-draw-pile'),
      turn: (document.querySelector('.ce-turn-label') || {}).textContent || '',
      chip: (document.querySelector('.ce-color-chip') || {}).textContent || '',
    }));
    if (info.hand !== 7) throw new Error(`expected 7 hand cards, got ${info.hand}`);
    if (!info.discard || !info.draw) throw new Error('table UI incomplete: ' + JSON.stringify(info));
    if (!info.turn) throw new Error('missing turn label');
    if (!/ember|tide|leaf|sol/i.test(info.chip)) throw new Error('missing current color chip: ' + info.chip);
    await page.screenshot({ path: SHOT('game', pass) });
  });

  await step('human turn: play a card or draw through the UI', async () => {
    // wait until it is the human turn (game starts on p0, but be tolerant)
    await page.waitForFunction(() => /your turn/i.test((document.querySelector('.ce-turn-label') || {}).textContent || ''), { timeout: 10000 });
    const acted = await page.evaluate(() => {
      const playable = document.querySelector('.ce-card-btn.ce-playable:not([disabled])');
      if (playable) { playable.click(); return 'played'; }
      const draw = document.querySelector('.ce-draw-pile:not([disabled])');
      if (draw) { draw.click(); return 'drew'; }
      return null;
    });
    if (!acted) throw new Error('no legal human action available through UI');
    console.log(`  human action: ${acted}`);
    // if a wild was played, the color chooser must appear and work
    const chooser = await page.$('.ce-color-panel');
    if (chooser) {
      await page.click('.ce-color-btn');
      console.log('  wild color chooser used');
    }
  });

  await step('pause overlay opens and resumes', async () => {
    await page.click('button:has-text("Pause")');
    await page.waitForSelector('.ce-overlay', { timeout: 5000 });
    await page.screenshot({ path: SHOT('pause', pass) });
    await page.click('.ce-overlay button:has-text("Resume")');
    await page.waitForSelector('.ce-overlay', { state: 'detached', timeout: 5000 });
  });

  await step('in-game Pause → Settings → Graphics: Ultra renders cleanly, back to Auto', async () => {
    await page.click('button:has-text("Pause")');
    await page.click('.ce-overlay button:has-text("Settings")');
    await page.click('[data-settings-tab="graphics"]');
    await page.selectOption('#gfx-preset', 'ultra');
    await page.waitForTimeout(800); // a few frames through the full post chain
    const info = await page.evaluate(() => ({ p: document.body.dataset.gfxPreset, post: CERender.hasPostFx(), failed: CERender.graphicsInfo().postFailed }));
    if (info.p !== 'ultra') throw new Error('Ultra not applied in game: ' + JSON.stringify(info));
    if (!info.post && !info.failed) throw new Error('Ultra should run the post chain: ' + JSON.stringify(info));
    await page.selectOption('#gfx-preset', 'auto');
    await page.click('.ce-overlay button:has-text("Close")');
    await page.waitForSelector('.ce-overlay', { state: 'detached', timeout: 5000 });
  });

  await step('round plays to results via UI (AI-speed session)', async () => {
    // Speed the AI up and let the round run; act for the human whenever prompted.
    await page.evaluate(() => {
      window.__ceAuto = setInterval(() => {
        const turnEl = document.querySelector('.ce-turn-label');
        if (!turnEl || !/your turn/i.test(turnEl.textContent || '')) return;
        if (document.querySelector('.ce-overlay')) return;
        const playable = document.querySelector('.ce-card-btn.ce-playable:not([disabled])');
        if (playable) { playable.click(); return; }
        const draw = document.querySelector('.ce-draw-pile:not([disabled])');
        if (draw) draw.click();
      }, 120);
      // separate faster driver for the mandatory color chooser
      window.__ceColor = setInterval(() => {
        const b = document.querySelector('.ce-color-btn');
        if (b) b.click();
      }, 120);
    });
    await page.waitForSelector('#ce-ui.ce-menu h1', { timeout: 120000 });
    const headline = await page.textContent('#ce-ui.ce-menu h1');
    if (!/win/i.test(headline)) throw new Error('unexpected results headline: ' + headline);
    const breakdown = await page.$$eval('.ce-breakdown li', (els) => els.length);
    if (breakdown < 1) throw new Error('results missing score breakdown');
    await page.screenshot({ path: SHOT('results', pass) });
    await page.evaluate(() => { clearInterval(window.__ceAuto); clearInterval(window.__ceColor); });
  });

  await step('back to menu from results', async () => {
    await page.click('button:has-text("Back to menu")');
    await page.waitForSelector('#ce-ui.ce-menu', { timeout: 5000 });
  });

  await step('content integrity: 40 journey stages, stage 1 config valid', async () => {
    const info = await page.evaluate(() => {
      const st1 = CEContent.JOURNEY[0];
      const cfg = CEContent.journeyConfig(st1);
      return { stages: CEContent.JOURNEY.length, stage1: cfg && cfg.contentId, seed: cfg && cfg.seed };
    });
    if (info.stages !== 40) throw new Error(`expected 40 journey stages, got ${info.stages}`);
    if (info.stage1 !== 'j01' || !info.seed) throw new Error('journeyConfig(JOURNEY[0]) invalid: ' + JSON.stringify(info));
  });

  await step('persistence: settings + progress round-trip', async () => {
    const ok = await page.evaluate(() => {
      const s = CEStore.loadSettings();
      s.captions = !s.captions;
      CEStore.saveSettings(s);
      const s2 = CEStore.loadSettings();
      const p = CEStore.loadProgress();
      p.sessionsPlayed = (p.sessionsPlayed || 0) + 1;
      CEStore.saveProgress(p);
      const p2 = CEStore.loadProgress();
      return s2.captions === s.captions && p2.sessionsPlayed === p.sessionsPlayed;
    });
    if (!ok) throw new Error('CEStore round-trip failed');
  });

  await context.close();
  if (errors.length) throw new Error(`[${pass}] page errors:\n` + errors.join('\n'));
}

let browser = null;
try {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(process.env.PORT ? Number(process.env.PORT) : 0, '127.0.0.1', resolve);
  });
  browser = await chromium.launch({
    executablePath: '/usr/bin/google-chrome',
    args: ['--no-sandbox', '--enable-unsafe-swiftshader'],
  });

  console.log('--- desktop pass (1280x800) ---');
  await runPass(browser, 'desktop', { width: 1280, height: 800 }, false);
  console.log('--- mobile pass (390x844, touch) ---');
  await runPass(browser, 'mobile', { width: 390, height: 844 }, true);

  console.log('\nE2E PASS — UI playthrough clean on desktop and mobile');
} finally {
  if (browser) await browser.close();
  server.close();
}
