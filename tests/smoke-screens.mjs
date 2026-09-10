// One-off targeted smoke of remaining screens (not part of the shipped test suite).
import { chromium } from 'playwright-core';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.opus': 'audio/ogg; codecs=opus' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent((req.url || '/').split('?')[0]);
  if (p === '/') p = '/index.html';
  const file = path.join(ROOT, p);
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    res.end(data);
  });
});
const noise = /GL Driver Message|GPU stall|swiftshader|AudioContext was not allowed/i;

await new Promise((r) => server.listen(process.env.PORT ? Number(process.env.PORT) : 0, '127.0.0.1', r));
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !noise.test(m.text())) errors.push('console: ' + m.text()); });
await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: 'networkidle' });
await page.waitForSelector('#ce-ui.ce-menu');

// Journey screen + stage intro + stage game start
await page.click('button:has-text("Journey")');
await page.waitForSelector('.ce-journey-grid');
const stageCount = await page.$$eval('.ce-stage-btn', (e) => e.length);
if (stageCount !== 40) throw new Error('journey grid count ' + stageCount);
await page.screenshot({ path: '/tmp/ce-smoke-journey.png' });
await page.click('.ce-stage-btn:first-child');
await page.waitForSelector('.ce-overlay');
await page.click('.ce-overlay button:has-text("Play")');
await page.waitForSelector('#ce-ui.ce-game');
await page.screenshot({ path: '/tmp/ce-smoke-stage.png' });
// pause -> quit to menu
await page.click('button:has-text("Pause")');
await page.click('.ce-overlay button:has-text("Save & quit to menu")');
await page.waitForSelector('#ce-ui.ce-menu');
// resume button appears after save&quit
const resume = await page.$('button:has-text("Resume round")');
if (!resume) throw new Error('resume snapshot button missing after save & quit');
const savedTitle = await page.evaluate(() => {
  const snap = CEStore.loadSnapshot();
  snap.humanDraws = 3;
  CEStore.saveSnapshot(snap);
  const id = JSON.parse(snap.state).config.contentId;
  const stage = CEContent.JOURNEY.find(s => s.id === id);
  return stage.index + '. ' + stage.name;
});
// Refresh the title so its Resume handler reads the updated saved metadata.
await page.reload();
await page.click('button:has-text("Resume round")');
await page.waitForSelector('#ce-ui.ce-game');
if (await page.locator('.ce-header .ce-title').textContent() !== savedTitle) throw new Error('Resume lost journey stage context');
await page.click('button:has-text("Pause")');
await page.click('.ce-overlay button:has-text("Save & quit to menu")');
const resumedDraws = await page.evaluate(() => CEStore.loadSnapshot().humanDraws);
if (resumedDraws !== 3) throw new Error('Resume lost the saved draw count');
console.log('ok - journey + save/quit/resume button');

// Learn: lesson 1 (must play an ember card)
await page.click('button:has-text("Learn")');
await page.waitForSelector('.ce-lesson-btn');
await page.locator('.ce-lesson-btn').first().click();
await page.waitForSelector('#ce-ui.ce-game .ce-lesson-banner');
// try an illegal (non-required) action first: pick a non-playable lesson card
const blocked = await page.evaluate(() => {
  const cards = [...document.querySelectorAll('.ce-card-btn:not([disabled])')];
  const wrong = cards.find((b) => !/Ember/.test(b.textContent));
  if (wrong) { wrong.click(); return true; }
  return false;
});
await page.waitForTimeout(300);
const stillLesson = await page.$('.ce-lesson-banner');
if (blocked && !stillLesson) throw new Error('lesson gating failed');
// now play the required ember card
await page.evaluate(() => {
  const cards = [...document.querySelectorAll('.ce-card-btn:not([disabled])')];
  const right = cards.find((b) => /Ember/.test(b.textContent));
  right.click();
});
await page.waitForSelector('.ce-overlay', { timeout: 5000 });
const done = await page.textContent('.ce-overlay');
if (!/lesson complete/i.test(done)) throw new Error('lesson completion overlay missing: ' + done);
await page.screenshot({ path: '/tmp/ce-smoke-lesson.png' });
await page.click('.ce-overlay button:has-text("Back to lessons")');
await page.waitForSelector('.ce-lesson-btn');
const marked = await page.textContent('.ce-lesson-btn');
if (!/✓/.test(marked)) throw new Error('lesson not marked complete');
console.log('ok - lesson gating + completion');

// back to title, settings overlay
await page.click('button:has-text("Back")');
await page.waitForSelector('#ce-ui.ce-menu');
await page.click('button:has-text("Settings")');
await page.waitForSelector('.ce-settings-row');
const rows = await page.$$eval('.ce-settings-row', (e) => e.length);
if (rows < 6) throw new Error('settings rows missing: ' + rows);
await page.selectOption('.ce-overlay select', 'contrast');
await page.click('.ce-overlay button:has-text("Close")');
const savedPal = await page.evaluate(() => CEStore.loadSettings().accessibility.palette);
if (savedPal !== 'contrast') throw new Error('palette setting not persisted');
console.log('ok - settings overlay + persistence');

// daily + challenges screens
await page.click('button:has-text("Daily Challenge")');
await page.waitForSelector('#ce-ui.ce-game');
console.log('ok - daily starts');
await page.click('button:has-text("Pause")');
await page.click('.ce-overlay button:has-text("Quit without saving")');
await page.waitForSelector('#ce-ui.ce-menu');
await page.click('button:has-text("Challenges")');
await page.waitForSelector('.ce-challenge-row');
await page.screenshot({ path: '/tmp/ce-smoke-challenges.png' });
await page.click('.ce-challenge-row button');
await page.waitForSelector('#ce-ui.ce-game');
console.log('ok - challenge starts');

// keyboard: Escape pauses, Escape resumes
await page.keyboard.press('Escape');
await page.waitForSelector('.ce-overlay');
await page.keyboard.press('Escape');
await page.waitForSelector('.ce-overlay', { state: 'detached' });
console.log('ok - keyboard pause/resume');

if (errors.length) throw new Error('page errors:\n' + errors.join('\n'));
console.log('SMOKE PASS');
await browser.close();
server.close();
