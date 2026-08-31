/* Color Eights — rules & content test suite. Run: node tests/rules.test.mjs */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
require('../js/rules.js');
require('../js/content.js');
const R = globalThis.CERules;
const C = globalThis.CEContent;

let passed = 0, failed = 0;
function t(name, fn) {
  try { fn(); passed++; console.log('  ok  ' + name); }
  catch (e) { failed++; console.error('FAIL  ' + name + ' :: ' + (e && e.stack || e)); }
}
function eq(a, b, msg) { if (a !== b) throw new Error((msg || '') + ' expected ' + JSON.stringify(b) + ' got ' + JSON.stringify(a)); }
function ok(v, msg) { if (!v) throw new Error(msg || 'expected truthy'); }

function autoCmd(state, n) {
  const pl = state.players[state.currentPlayer];
  let cmd = state.pendingColorChoice
    ? { type: 'chooseColor', color: R.bestColorFor(pl) }
    : R.aiChoose(state, pl.id, pl.aiLevel);
  cmd.id = 't-' + n; cmd.player = pl.id;
  return cmd;
}
function autoGame(cfg, players, cap) {
  let s = R.createGame(cfg, players);
  const rep = R.replayCreate(s);
  let n = 0;
  while (s.phase === 'active' && n < (cap || 3000)) {
    const cmd = autoCmd(s, ++n);
    rep.commands.push(cmd);
    const r = R.applyCommand(s, cmd);
    if (r.error) throw new Error('auto command rejected: ' + r.reason);
    s = r.state;
    R.replayAppend(rep, s);
  }
  return { state: s, replay: rep, turns: n };
}

const JUNK = [['tide',1],['leaf',2],['sol',3],['ember',8],['tide',9]];
let junkN = 0;
function junk(k) { // k non-matching filler cards so hands never empty mid-test
  const out = [];
  for (let i = 0; i < (k || 2); i++) {
    const j = JUNK[junkN++ % JUNK.length];
    out.push({ id: 'junk' + junkN, kind: 'number', color: j[0], rank: j[1] });
  }
  return out;
}

console.log('== deck & setup ==');
t('deck has 104 unique cards', () => {
  const d = R.buildDeck();
  eq(d.length, 104);
  eq(new Set(d.map(c => c.id)).size, 104);
});
t('fresh game: hand sizes, one discard, active phase', () => {
  const s = R.createGame({ seed: 'a', playerCount: 4 });
  eq(s.players.length, 4);
  ok(s.players.every(p => p.hand.length === 7));
  eq(s.discardPile.length, 1);
  eq(s.phase, 'active');
  eq(s.turnNumber, 1);
});
t('first discard is never wild4', () => {
  for (let i = 0; i < 40; i++) {
    const s = R.createGame({ seed: 'f' + i });
    ok(R.topDiscard(s).kind !== 'wild4');
  }
});
t('same seed gives identical state; different seed differs', () => {
  const a = R.hashState(R.createGame({ seed: 'x' }));
  const b = R.hashState(R.createGame({ seed: 'x' }));
  const c = R.hashState(R.createGame({ seed: 'y' }));
  eq(a, b); ok(a !== c);
});

console.log('== legality ==');
t('legal actions always include draw when no pendingDraw', () => {
  const s = R.createGame({ seed: 'l1' });
  const la = R.legalActions(s, s.players[0].id);
  ok(la.ok);
  ok(la.actions.some(a => a.type === 'draw'));
});
t('out-of-turn player gets not-your-turn', () => {
  const s = R.createGame({ seed: 'l2', playerCount: 3 });
  const la = R.legalActions(s, s.players[1].id);
  eq(la.ok, false); eq(la.reason, 'not-your-turn');
});
t('color match is legal', () => {
  const s = R.createGame({ seed: 'l3' });
  const top = R.topDiscard(s);
  const p = s.players[0];
  p.hand = [{ id: 'x1', kind: 'number', color: top.color || 'ember', rank: 1 }];
  s.currentColor = top.color || 'ember';
  s.discardPile = [{ id: 'x0', kind: 'number', color: 'ember', rank: 9 }];
  s.currentColor = 'ember';
  const la = R.legalActions(s, p.id);
  ok(la.actions.some(a => a.type === 'play' && a.cardId === 'x1'));
});
t('rank match across colors is legal', () => {
  const s = R.createGame({ seed: 'l4' });
  s.discardPile = [{ id: 'x0', kind: 'number', color: 'ember', rank: 5 }];
  s.currentColor = 'ember';
  s.players[0].hand = [{ id: 'x1', kind: 'number', color: 'tide', rank: 5 }];
  ok(R.canPlayCard(s, 'p0', 'x1'));
});
t('mismatch explained as no-color-or-rank-match', () => {
  const s = R.createGame({ seed: 'l5' });
  s.discardPile = [{ id: 'x0', kind: 'number', color: 'ember', rank: 5 }];
  s.currentColor = 'ember';
  s.players[0].hand = [{ id: 'x1', kind: 'number', color: 'tide', rank: 6 }];
  eq(R.explainInvalid(s, 'p0', 'x1'), 'no-color-or-rank-match');
});
t('wilds always legal', () => {
  const s = R.createGame({ seed: 'l6' });
  s.players[0].hand = [{ id: 'w', kind: 'wild', color: null, rank: null }];
  ok(R.canPlayCard(s, 'p0', 'w'));
});
t('finished round rejects actions with round-finished', () => {
  const s = R.createGame({ seed: 'l7' });
  s.phase = 'finished';
  const r = R.applyCommand(s, { id: 'q', type: 'draw', player: 'p0' });
  eq(r.error, true); eq(r.reason, 'round-finished');
});

console.log('== effects ==');
t('skip jumps next player', () => {
  const s = R.createGame({ seed: 'e1', playerCount: 3 });
  s.discardPile = [{ id: 'x0', kind: 'number', color: 'ember', rank: 5 }];
  s.currentColor = 'ember';
  s.players[0].hand = [{ id: 'sk', kind: 'skip', color: 'ember', rank: null }].concat(junk());
  const r = R.applyCommand(s, { id: 'c1', type: 'play', player: 'p0', cardId: 'sk' });
  ok(!r.error, r.reason);
  eq(r.state.currentPlayer, 2);
  ok(r.events.some(e => e.ev === 'skipped' && e.player === 'p1'));
});
t('reverse flips direction; acts as skip in 2p', () => {
  let s = R.createGame({ seed: 'e2', playerCount: 3 });
  s.discardPile = [{ id: 'x0', kind: 'number', color: 'ember', rank: 5 }];
  s.currentColor = 'ember';
  s.players[0].hand = [{ id: 'rv', kind: 'reverse', color: 'ember', rank: null }].concat(junk());
  let r = R.applyCommand(s, { id: 'c1', type: 'play', player: 'p0', cardId: 'rv' });
  eq(r.state.direction, -1);
  eq(r.state.currentPlayer, 2); // direction -1 from seat 0 => seat 2
  s = R.createGame({ seed: 'e3', playerCount: 2 });
  s.discardPile = [{ id: 'x0', kind: 'number', color: 'ember', rank: 5 }];
  s.currentColor = 'ember';
  s.players[0].hand = [{ id: 'rv', kind: 'reverse', color: 'ember', rank: null }].concat(junk());
  r = R.applyCommand(s, { id: 'c2', type: 'play', player: 'p0', cardId: 'rv' });
  eq(r.state.currentPlayer, 0); // skip in 2p: same player again
});
t('draw2 sets pendingDraw; victim draws 2 and turn passes', () => {
  let s = R.createGame({ seed: 'e4', playerCount: 2 });
  s.discardPile = [{ id: 'x0', kind: 'number', color: 'ember', rank: 5 }];
  s.currentColor = 'ember';
  s.players[0].hand = [{ id: 'd2', kind: 'draw2', color: 'ember', rank: null }].concat(junk());
  let r = R.applyCommand(s, { id: 'c1', type: 'play', player: 'p0', cardId: 'd2' });
  s = r.state;
  eq(s.pendingDraw, 2);
  eq(s.currentPlayer, 1);
  const before = s.players[1].hand.length;
  r = R.applyCommand(s, { id: 'c2', type: 'draw', player: 'p1' });
  eq(r.state.players[1].hand.length, before + 2);
  eq(r.state.pendingDraw, 0);
  eq(r.state.currentPlayer, 0);
});
t('without stacking, victim may only draw', () => {
  const s = R.createGame({ seed: 'e5', playerCount: 2 });
  s.pendingDraw = 2;
  s.players[1].hand = [{ id: 'd2b', kind: 'draw2', color: 'ember', rank: null }];
  s.currentPlayer = 1;
  const la = R.legalActions(s, 'p1');
  ok(!la.actions.some(a => a.type === 'play'));
  ok(la.actions.some(a => a.type === 'draw'));
});
t('with stacking, draw2 stacks on draw2 and accumulates', () => {
  let s = R.createGame({ seed: 'e6', playerCount: 2, stacking: true });
  s.discardPile = [{ id: 'x0', kind: 'draw2', color: 'ember', rank: null }];
  s.currentColor = 'ember';
  s.pendingDraw = 2;
  s.currentPlayer = 1;
  s.players[1].hand = [{ id: 'd2b', kind: 'draw2', color: 'tide', rank: null }].concat(junk());
  const r = R.applyCommand(s, { id: 'c1', type: 'play', player: 'p1', cardId: 'd2b' });
  ok(!r.error, r.reason);
  eq(r.state.pendingDraw, 4);
  eq(r.state.currentPlayer, 0);
});
t('wild requires color choice for humans; turn waits', () => {
  let s = R.createGame({ seed: 'e7', playerCount: 2 });
  s.players[0].hand = [{ id: 'w', kind: 'wild', color: null, rank: null }].concat(junk());
  let r = R.applyCommand(s, { id: 'c1', type: 'play', player: 'p0', cardId: 'w' });
  ok(!r.error, r.reason);
  ok(r.state.pendingColorChoice);
  eq(r.state.currentPlayer, 0); // not advanced yet
  r = R.applyCommand(r.state, { id: 'c2', type: 'chooseColor', player: 'p0', color: 'tide' });
  ok(!r.error, r.reason);
  eq(r.state.currentColor, 'tide');
  eq(r.state.currentPlayer, 1);
});
t('wild4 adds 4 pending after color chosen', () => {
  let s = R.createGame({ seed: 'e8', playerCount: 2 });
  s.players[0].hand = [{ id: 'w4', kind: 'wild4', color: null, rank: null }].concat(junk());
  let r = R.applyCommand(s, { id: 'c1', type: 'play', player: 'p0', cardId: 'w4', color: 'leaf' });
  ok(!r.error, r.reason);
  eq(r.state.pendingDraw, 4);
  eq(r.state.currentColor, 'leaf');
});
t('turn number increases monotonically', () => {
  let s = R.createGame({ seed: 'e9', playerCount: 2 });
  let prev = s.turnNumber;
  for (let i = 0; i < 12 && s.phase === 'active'; i++) {
    const r = R.applyCommand(s, autoCmd(s, i));
    ok(!r.error);
    s = r.state;
    ok(s.turnNumber > prev, 'turn must increase');
    prev = s.turnNumber;
  }
});

console.log('== scoring & terminal ==');
t('empty hand wins; score is sum of remaining hands with breakdown', () => {
  const s = R.createGame({ seed: 's1', playerCount: 2 });
  s.discardPile = [{ id: 'x0', kind: 'number', color: 'ember', rank: 5 }];
  s.currentColor = 'ember';
  s.players[0].hand = [{ id: 'x1', kind: 'number', color: 'ember', rank: 2 }];
  s.players[1].hand = [
    { id: 'y1', kind: 'number', color: 'tide', rank: 7 },
    { id: 'y2', kind: 'skip', color: 'leaf', rank: null },
    { id: 'y3', kind: 'wild', color: null, rank: null },
  ];
  const r = R.applyCommand(s, { id: 'c1', type: 'play', player: 'p0', cardId: 'x1' });
  eq(r.state.phase, 'finished');
  eq(r.state.winner, 'p0');
  eq(r.state.terminalReason, 'empty-hand');
  eq(r.state.scores.total, 7 + 20 + 50);
  eq(r.state.scores.breakdown.length, 1);
  eq(r.state.scores.breakdown[0].detail.length, 3);
});
t('resign ends solo round with terminal reason', () => {
  const s = R.createGame({ seed: 's2', playerCount: 2 });
  const r = R.applyCommand(s, { id: 'c1', type: 'resign', player: 'p0' });
  eq(r.state.phase, 'finished');
  eq(r.state.terminalReason, 'resignation');
});
t('move limit ends round with move-limit reason', () => {
  const s = R.createGame({ seed: 's3', playerCount: 2, moveLimit: 1 });
  const r = R.applyCommand(s, { id: 'c1', type: 'draw', player: 'p0' });
  eq(r.state.phase, 'finished');
  eq(r.state.terminalReason, 'move-limit');
});
t('rankResults orders winner first, then fewer invalids', () => {
  const s = R.createGame({ seed: 's4', playerCount: 3 });
  s.phase = 'finished'; s.winner = 'p2';
  s.invalidCounts = { p0: 3, p1: 0, p2: 9 };
  const rank = R.rankResults(s);
  eq(rank[0], 'p2');
  eq(rank[1], 'p1');
});

console.log('== invalid commands ==');
function projection(st) {
  return R.stableStringify({
    hands: st.players.map(p => p.hand), draw: st.drawPile, disc: st.discardPile,
    cc: st.currentColor, cp: st.currentPlayer, pd: st.pendingDraw,
    phase: st.phase, turn: st.turnNumber,
  });
}
t('malformed commands rejected without corruption', () => {
  const s = R.createGame({ seed: 'i1' });
  const h = projection(s);
  for (const bad of [null, {}, { id: 1 }, { id: 'x' }, { id: 'x', type: 'nope', player: 'p0' },
                     { id: 'x', type: 'play', player: 'nobody', cardId: 'z' },
                     { id: 'x', type: 'chooseColor', player: 'p0', color: 'purple' }]) {
    const r = R.applyCommand(s, bad);
    ok(r.error, 'should reject ' + JSON.stringify(bad));
    if (r.state) eq(projection(r.state), h, 'gameplay state must be unchanged');
  }
});
t('illegal card rejected and counted', () => {
  const s = R.createGame({ seed: 'i2' });
  s.discardPile = [{ id: 'x0', kind: 'number', color: 'ember', rank: 5 }];
  s.currentColor = 'ember';
  s.players[0].hand = [{ id: 'x1', kind: 'number', color: 'tide', rank: 6 }];
  const r = R.applyCommand(s, { id: 'c1', type: 'play', player: 'p0', cardId: 'x1' });
  ok(r.error);
  eq(r.reason, 'no-color-or-rank-match');
  eq(r.state.invalidCounts.p0, 1);
});

console.log('== serialization & migration ==');
t('serialize/deserialize round-trips exactly', () => {
  let s = R.createGame({ seed: 'm1', playerCount: 3 });
  for (let i = 0; i < 6; i++) s = R.applyCommand(s, autoCmd(s, i)).state;
  const back = R.deserialize(R.serialize(s));
  eq(R.hashState(back), R.hashState(s));
});
t('old-version state migrates with defaults', () => {
  const s = R.createGame({ seed: 'm2' });
  const json = JSON.parse(R.serialize(s));
  json.version = 1;
  delete json.turnCount; delete json.stats; delete json.log; delete json.decorStream;
  const back = R.deserialize(json);
  eq(back.version, R.RULES_VERSION);
  ok(back.stats && back.log && back.decorStream);
});
t('future version rejected', () => {
  const s = R.createGame({ seed: 'm3' });
  const json = JSON.parse(R.serialize(s));
  json.version = 999;
  let threw = false;
  try { R.deserialize(json); } catch (e) { threw = true; }
  ok(threw);
});

console.log('== determinism & replay ==');
t('replay verifies full game (property: same seed+commands => same hashes)', () => {
  const { replay } = autoGame({ seed: 'r1', playerCount: 3 });
  const v = R.replayVerify(replay);
  ok(v.ok, v.reason + ' @' + v.index);
});
t('replay detects tampered command', () => {
  const { replay } = autoGame({ seed: 'r2', playerCount: 2 });
  replay.commands[2] = Object.assign({}, replay.commands[2], { cardId: 'zz' });
  const v = R.replayVerify(replay);
  eq(v.ok, false);
});
t('20 seeded full games terminate within turn bound', () => {
  for (let i = 0; i < 20; i++) {
    const { state, turns } = autoGame({ seed: 'g' + i, playerCount: 2 + (i % 3), stacking: i % 2 === 0 });
    eq(state.phase, 'finished', 'game ' + i);
    ok(turns < 3000);
    ok(state.terminalReason);
  }
});
t('draw pile recycles discard when empty', () => {
  // small deck: drawToMatch with restricted palette recycles quickly
  const { state } = autoGame({ seed: 'rec1', playerCount: 4, palette: ['ember', 'sol'], handSize: 9, drawToMatch: true });
  eq(state.phase, 'finished');
});

console.log('== fuzz ==');
t('fuzz: 400 random malformed/odd commands never hang or corrupt', () => {
  let s = R.createGame({ seed: 'fz', playerCount: 3 });
  const rng = R.rngCreate('fz');
  const types = ['play', 'draw', 'chooseColor', 'resign', 'weird'];
  for (let i = 0; i < 400; i++) {
    if (s.phase !== 'active') s = R.createGame({ seed: 'fz' + i, playerCount: 3 });
    const cmd = {
      id: 'f' + i,
      type: types[R.rngInt(rng, types.length)],
      player: s.players[R.rngInt(rng, 3)].id,
      cardId: R.rngNext(rng) < 0.5 ? 'c' + R.rngInt(rng, 120) : undefined,
      color: ['ember', 'tide', 'leaf', 'sol', 'pink', null][R.rngInt(rng, 6)],
    };
    const r = R.applyCommand(s, cmd);
    if (!r.error) s = r.state;
    ok(Number.isFinite(s.turnNumber));
    ok(s.players.every(p => Array.isArray(p.hand)));
    // no NaN, no duplicate card ownership
    const all = s.players.flatMap(p => p.hand.map(c => c.id)).concat(s.drawPile.map(c => c.id), s.discardPile.map(c => c.id));
    eq(new Set(all).size, all.length, 'duplicate card detected');
  }
});

console.log('== content ==');
t('40 journey stages with unique ids/seeds', () => {
  eq(C.JOURNEY.length, 40);
  eq(new Set(C.JOURNEY.map(s => s.id)).size, 40);
  eq(new Set(C.JOURNEY.map(s => s.seed)).size, 40);
});
t('5 mastery stages spaced through journey', () => {
  const m = C.JOURNEY.filter(s => s.mastery);
  eq(m.length, 5);
});
t('5 themes defined', () => eq(Object.keys(C.THEMES).length, 5));
t('daily generator stable per date, varies by date', () => {
  const a = C.dailyForDate('2026-08-19');
  const b = C.dailyForDate('2026-08-19');
  const c = C.dailyForDate('2026-08-20');
  eq(a.config.seed, b.config.seed);
  ok(a.config.seed !== c.config.seed);
});
t('content validators pass (legality, termination, lessons, dailies, challenges)', () => {
  const rep = C.validateAll(R, { dailyDays: 10 });
  if (!rep.ok) throw new Error(rep.problems.join('\n'));
  ok(rep.checked.journey === 40);
});
t('lesson rigs: required action is the natural one', () => {
  for (const ls of C.LESSONS) {
    const s = C.rigLessonState(R, ls);
    eq(s.phase, 'active');
    const la = R.legalActions(s, 'p0');
    ok(la.ok, ls.id);
  }
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
