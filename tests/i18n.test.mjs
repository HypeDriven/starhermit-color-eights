// Localization coverage: every English key the engine client (native/*.ts),
// the rules' labels and the content show is translated in every locale
// (en-GB → en-US, es-ES → es-419, fr-CA → fr-FR inherit), placeholders
// survive, no table keeps a key nothing shows, and the classic js/i18n.js
// switches locale as native/i18n.ts drives it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { loadTables, codeKeys, audit, bootI18n } from './i18n-common.mjs';

const require = createRequire(import.meta.url);
const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8');

export function usedKeys() {
  const keys = new Set();
  for (const f of readdirSync(new URL('native/', ROOT)).filter((n) => n.endsWith('.ts'))) {
    codeKeys(read('native/' + f), ['tr']).forEach((k) => keys.add(k));
  }
  require('../js/rules.js');
  require('../js/content.js');
  const R = globalThis.CERules, C = globalThis.CEContent;
  for (const c of R.COLORS) keys.add(R.COLOR_INFO[c].label);
  for (const k of Object.values(R.KIND_LABEL)) keys.add(k);
  for (const st of C.JOURNEY) { keys.add(st.name); if (st.intro) keys.add(st.intro); }
  for (const ls of C.LESSONS) { keys.add(ls.title); keys.add(ls.text); keys.add(ls.hintText); }
  for (const ch of C.CHALLENGES) { keys.add(ch.name); keys.add(ch.desc); keys.add(ch.goalLabel); }
  // The human seat's name, shown through playerName().
  keys.add('You');
  return [...keys].filter((k) => /[A-Za-z]/.test(k) && k !== 'Color Eights').sort();
}

test('every used key is translated in every locale; placeholders intact', () => {
  assert.deepEqual(audit(loadTables(ROOT, 'js/strings.js', 'CE_STRINGS'), usedKeys()), []);
});

test('the locale switches as the engine client sets it, with the regional tables', () => {
  const { I18N } = bootI18n(ROOT, { strings: 'js/strings.js', i18n: 'js/i18n.js', global: 'CEI18N' });
  assert.equal(I18N.lang, 'en-US');
  assert.equal(I18N.setLocale('de-DE'), 'de-DE');
  assert.equal(I18N.T('Resume'), 'Fortsetzen');
  I18N.setLocale('en-GB');
  assert.equal(I18N.T('Color palette'), 'Colour palette');
  assert.equal(I18N.T('Resume'), 'Resume');
  I18N.setLocale('es-ES');
  assert.equal(I18N.T('Reverse'), 'Cambio de sentido');
  assert.equal(I18N.T('Practice'), 'Práctica');
  assert.equal(I18N.setLocale('xx-YY'), 'en-US');
  assert.equal(I18N.T('{n} points', { n: 3 }), '3 points');
});
