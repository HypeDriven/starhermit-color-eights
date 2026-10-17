// Graphics benchmark hook for tools/gfx-bench.mjs (dev-only): picks a preset in the real Settings
// overlay (Graphics tab), starts a Practice round and keeps playing through the visible hand and draw
// pile (card drops, current-colour glow, motes, bokeh and the post chain all run), starting a new
// round from the results screen.
export const presets = ['low', 'balanced', 'high', 'ultra'];
export const levels = { low: 0, balanced: 4, high: 10, ultra: 17 };

export async function setPreset(page, preset) {
  await page.waitForSelector('#ce-ui.ce-menu button:has-text("Settings")', { timeout: 20000 });
  await page.click('#ce-ui.ce-menu button:has-text("Settings")');
  await page.click('[data-settings-tab="graphics"]');
  await page.waitForSelector('#gfx-preset', { timeout: 5000 });
  await page.selectOption('#gfx-preset', preset);
  await page.waitForFunction((p) => document.body.dataset.gfxPreset === p, preset);
  await page.click('.ce-overlay button:has-text("Close")');
}

async function startRound(page) {
  await page.click('button:has-text("Practice")');
  await page.waitForSelector('.ce-field select', { timeout: 5000 });
  await page.click('button:has-text("Start round")');
  await page.waitForSelector('#ce-ui.ce-game', { timeout: 5000 });
}

async function step(page) {
  if (await page.locator('button:has-text("Back to menu"):visible').count()) {
    await page.click('button:has-text("Back to menu")', { timeout: 5000 });
    await startRound(page);
    return;
  }
  if (await page.locator('.ce-color-btn:visible').count()) return page.locator('.ce-color-btn').first().click({ timeout: 5000 });
  const mine = await page.evaluate(() => /your turn/i.test((document.querySelector('.ce-turn-label') || {}).textContent || '') && !document.querySelector('.ce-overlay'));
  if (!mine) return;
  const playable = page.locator('.ce-card-btn.ce-playable:not([disabled])');
  if (await playable.count()) return playable.first().click({ timeout: 5000 });
  const draw = page.locator('.ce-draw-pile:not([disabled])');
  if (await draw.count()) return draw.click({ timeout: 5000 });
}

export async function start(page) {
  await startRound(page);
  let open = true;
  page.once('close', () => { open = false; });
  (async () => {
    while (open) {
      try { await step(page); await page.waitForTimeout(300); } catch (e) { if (!open) return; if (process.env.BENCH_DEBUG) console.error(e.message); }
    }
  })();
  await page.waitForTimeout(1000);
}
