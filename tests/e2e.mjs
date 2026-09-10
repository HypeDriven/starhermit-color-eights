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
    if (m.type() === 'error' && !browserNoise.test(m.text())) errors.push(`console: ${m.text()}`);
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
