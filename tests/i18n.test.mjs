// Localization coverage: every English key the markup, code and content use is
// translated in every locale (en-GB → en-US, es-ES → es-419, fr-CA → fr-FR
// inherit), placeholders survive, and the language follows sh-language.js and
// switches live.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadTables, codeKeys, htmlKeys, audit, bootI18n } from './i18n-common.mjs';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8');

function loadGlobals() {
  const g = {};
  new Function('globalThis', 'window', read('js/rules.js'))(g, g);
  g.CERules = g.CERules || globalThis.CERules;
  new Function('globalThis', 'window', read('js/content.js'))(g, g);
  return { R: g.CERules || globalThis.CERules, C: g.CEContent || globalThis.CEContent };
}

export function usedKeys() {
  const keys = new Set(htmlKeys(read('index.html')));
  for (const f of ['js/app.js', 'js/bootstrap.js']) codeKeys(read(f)).forEach((k) => keys.add(k));
  codeKeys(read('js/platform.js'), ['tr']).forEach((k) => keys.add(k));
  const { R, C } = loadGlobals();
  for (const c of R.COLORS) keys.add(R.COLOR_INFO[c].label);
  for (const k of Object.values(R.KIND_LABEL)) keys.add(k);
  for (const st of C.JOURNEY) { keys.add(st.name); if (st.intro) keys.add(st.intro); }
  for (const ls of C.LESSONS) { keys.add(ls.title); keys.add(ls.text); keys.add(ls.hintText); }
  for (const ch of C.CHALLENGES) { keys.add(ch.name); keys.add(ch.desc); keys.add(ch.goalLabel); }
  return [...keys].filter((k) => /[A-Za-z]/.test(k) && k !== 'Color Eights').sort();
}

test('every used key is translated in every locale; placeholders intact', () => {
  assert.deepEqual(audit(loadTables(ROOT, 'js/strings.js', 'CE_STRINGS'), usedKeys()), []);
});

test('the locale follows sh-language and switches live', () => {
  const { I18N, events, doc } = bootI18n(ROOT, { strings: 'js/strings.js', i18n: 'js/i18n.js', global: 'CEI18N', languages: ['de-DE'] });
  assert.equal(I18N.lang, 'de-DE');
  assert.equal(doc.documentElement.lang, 'de-DE');
  assert.equal(I18N.T('Resume'), 'Fortsetzen');
  I18N.language.setChoice('fr-CA');
  assert.equal(I18N.lang, 'fr-CA');
  assert.equal(events.at(-1), 'fr-CA');
  I18N.language.setChoice('en-GB');
  assert.equal(I18N.T('Color palette'), 'Colour palette');
});
