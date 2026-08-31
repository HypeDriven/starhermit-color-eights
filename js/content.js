/* Color Eights — versioned content: themes, journey stages, tutorials, daily, challenges, validators. */
(function (global) {
  'use strict';
  const CONTENT_VERSION = 1;

  /* ---------------- themes (5 visual themes) ---------------- */
  const THEMES = {
    ember_lounge: {
      id: 'ember_lounge', name: 'Ember Lounge', version: 1,
      felt: '#5a2320', table: '#3a1a16', wall: '#241014', floor: '#1a0c0e',
      key: 0xffb28a, fill: 0x7040a0, accent: '#ff7a4d',
      uiAccent: '#ff9d6b', ambience: 'warm', fog: '#160a0c',
    },
    tide_hall: {
      id: 'tide_hall', name: 'Tide Hall', version: 1,
      felt: '#16304a', table: '#10202f', wall: '#0b1622', floor: '#081018',
      key: 0x9fd0ff, fill: 0x2a5a8a, accent: '#4db2ff',
      uiAccent: '#7cc4ff', ambience: 'deep', fog: '#081420',
    },
    verdant_room: {
      id: 'verdant_room', name: 'Verdant Room', version: 1,
      felt: '#1d4023', table: '#142b19', wall: '#0d1c10', floor: '#0a140c',
      key: 0xc8ffb0, fill: 0x3a7a4a, accent: '#63d97e',
      uiAccent: '#8ce8a0', ambience: 'garden', fog: '#0a180e',
    },
    solarium: {
      id: 'solarium', name: 'Solarium', version: 1,
      felt: '#4a3a16', table: '#2f2510', wall: '#1e180c', floor: '#14100a',
      key: 0xfff0b0, fill: 0x8a6a2a, accent: '#ffcf4d',
      uiAccent: '#ffd97c', ambience: 'bright', fog: '#181206',
    },
    midnight_neon: {
      id: 'midnight_neon', name: 'Midnight Neon', version: 1,
      felt: '#241a3a', table: '#18102b', wall: '#0e0a1a', floor: '#0a0714',
      key: 0xc09aff, fill: 0x40286a, accent: '#b44dff',
      uiAccent: '#cf9aff', ambience: 'neon', fog: '#0c0818',
    },
  };
  const DEFAULT_THEME = 'ember_lounge';

  /* ---------------- color-vision safe palettes (accessibility) ---------------- */
  const CVD_PALETTES = {
    standard: null, // uses CERules.COLOR_INFO hexes
    contrast: { ember: '#d42a1e', tide: '#0067c4', leaf: '#0f8a3c', sol: '#e8a000' },
    deuteranopia: { ember: '#c44e52', tide: '#4c72b0', leaf: '#55a868', sol: '#ccb974' },
    tritanopia: { ember: '#e1483c', tide: '#17becf', leaf: '#2ca02c', sol: '#bcbd22' },
  };

  /* ---------------- journey: 40 authored stages ---------------- */
  // Fields: id, seed, name, players, mechanics (allowedKinds), goal, par, theme, tutorial flags, stacking etc.
  const ALL_KINDS = ['number', 'skip', 'reverse', 'draw2', 'wild', 'wild4'];
  function stage(i, name, opts) {
    return Object.assign({
      id: 'j' + String(i).padStart(2, '0'),
      index: i, name, version: CONTENT_VERSION,
      seed: 'journey-' + i,
      playerCount: 2, aiLevel: 'easy',
      allowedKinds: ['number'],
      stacking: false, drawToMatch: false,
      goal: { type: 'win' },          // win | win-turns | win-no-draw | score-min
      par: { turns: 40 },
      theme: null,                     // null => rotating default
      mastery: false,
      intro: null,                     // one new concept introduced in isolation
    }, opts);
  }
  const JOURNEY = [
    stage(1,  'First Dealing', { intro: 'Match the discard by color or rank.', par: { turns: 30 } }),
    stage(2,  'Color Sense', { seed: 'journey-2', par: { turns: 28 } }),
    stage(3,  'Rank Play', { aiLevel: 'easy', par: { turns: 26 } }),
    stage(4,  'Quick Hands', { goal: { type: 'win-turns', turns: 24 }, par: { turns: 24 } }),
    stage(5,  'Skipping Stones', { allowedKinds: ['number', 'skip'], intro: 'Skip cards pass over the next player.', par: { turns: 26 } }),
    stage(6,  'Skip Rhythm', { allowedKinds: ['number', 'skip'], par: { turns: 24 } }),
    stage(7,  'Two Hands', { allowedKinds: ['number', 'skip'], playerCount: 3, par: { turns: 34 } }),
    stage(8,  'Mastery: Tempo', { allowedKinds: ['number', 'skip'], playerCount: 3, aiLevel: 'medium', mastery: true, goal: { type: 'win-turns', turns: 34 }, par: { turns: 34 } }),
    stage(9,  'Turnabout', { allowedKinds: ['number', 'skip', 'reverse'], playerCount: 3, intro: 'Reverse cards flip the direction of play.', par: { turns: 34 } }),
    stage(10, 'Reversal Lane', { allowedKinds: ['number', 'skip', 'reverse'], playerCount: 3, par: { turns: 32 } }),
    stage(11, 'Crossfire', { allowedKinds: ['number', 'skip', 'reverse'], playerCount: 4, par: { turns: 40 } }),
    stage(12, 'Reckoning: Direction', { allowedKinds: ['number', 'skip', 'reverse'], playerCount: 4, aiLevel: 'medium', goal: { type: 'win-turns', turns: 40 }, par: { turns: 40 } }),
    stage(13, 'Heavy Cards', { allowedKinds: ['number', 'skip', 'reverse', 'draw2'], intro: 'Draw Two forces the next player to take cards.', par: { turns: 34 } }),
    stage(14, 'Draw Pressure', { allowedKinds: ['number', 'skip', 'reverse', 'draw2'], playerCount: 3, par: { turns: 36 } }),
    stage(15, 'Stacked Deck', { allowedKinds: ['number', 'skip', 'reverse', 'draw2'], playerCount: 3, stacking: true, intro: 'Room option: Draw cards may stack onto each other.', par: { turns: 36 } }),
    stage(16, 'Mastery: Pressure', { allowedKinds: ['number', 'skip', 'reverse', 'draw2'], playerCount: 3, stacking: true, aiLevel: 'medium', mastery: true, goal: { type: 'score-min', points: 60 }, par: { turns: 40 } }),
    stage(17, 'Wild Ideas', { allowedKinds: ['number', 'skip', 'reverse', 'draw2', 'wild'], intro: 'Wild cards play on anything and choose the next color.', par: { turns: 34 } }),
    stage(18, 'Painted Table', { allowedKinds: ['number', 'skip', 'reverse', 'draw2', 'wild'], playerCount: 3, par: { turns: 36 } }),
    stage(19, 'Color Control', { allowedKinds: ['number', 'skip', 'reverse', 'draw2', 'wild'], playerCount: 3, aiLevel: 'medium', goal: { type: 'win-turns', turns: 34 }, par: { turns: 34 } }),
    stage(20, 'Reckoning: Palette', { allowedKinds: ['number', 'skip', 'reverse', 'draw2', 'wild'], playerCount: 4, aiLevel: 'medium', goal: { type: 'score-min', points: 80 }, par: { turns: 44 } }),
    stage(21, 'Full Deck', { allowedKinds: ALL_KINDS, intro: 'Wild Draw Four: choose a color and the next player draws four.', playerCount: 3, par: { turns: 38 } }),
    stage(22, 'Full Lounge', { allowedKinds: ALL_KINDS, playerCount: 3, par: { turns: 36 } }),
    stage(23, 'Full House', { allowedKinds: ALL_KINDS, playerCount: 4, par: { turns: 42 } }),
    stage(24, 'Mastery: The Works', { allowedKinds: ALL_KINDS, playerCount: 4, aiLevel: 'medium', mastery: true, goal: { type: 'win-turns', turns: 42 }, par: { turns: 42 } }),
    stage(25, 'Thin Air', { allowedKinds: ALL_KINDS, goal: { type: 'win-no-draw' }, par: { turns: 40 }, intro: 'Mastery goal: win without ever drawing.' }),
    stage(26, 'No Spare Cards', { allowedKinds: ALL_KINDS, goal: { type: 'win-no-draw' }, aiLevel: 'medium', par: { turns: 38 } }),
    stage(27, 'Stacking Season', { allowedKinds: ALL_KINDS, stacking: true, playerCount: 3, par: { turns: 38 } }),
    stage(28, 'Reckoning: Avalanche', { allowedKinds: ALL_KINDS, stacking: true, playerCount: 4, aiLevel: 'hard', goal: { type: 'win' }, par: { turns: 48 } }),
    stage(29, 'Clock Table', { allowedKinds: ALL_KINDS, turnTimerSec: 12, par: { turns: 40 }, intro: 'Speed stage: each turn has a timer.' }),
    stage(30, 'Fast Hands', { allowedKinds: ALL_KINDS, turnTimerSec: 9, playerCount: 3, par: { turns: 42 } }),
    stage(31, 'Blitz Lounge', { allowedKinds: ALL_KINDS, turnTimerSec: 7, playerCount: 3, aiLevel: 'medium', par: { turns: 42 } }),
    stage(32, 'Mastery: Velocity', { allowedKinds: ALL_KINDS, turnTimerSec: 8, playerCount: 4, aiLevel: 'hard', mastery: true, goal: { type: 'win-turns', turns: 48 }, par: { turns: 48 } }),
    stage(33, 'Ember Only Night', { allowedKinds: ALL_KINDS, palette: ['ember', 'sol'], par: { turns: 30 }, intro: 'Altered layout: only two colors in the deck.' }),
    stage(34, 'Deep Water', { allowedKinds: ALL_KINDS, palette: ['tide', 'leaf'], playerCount: 3, par: { turns: 34 } }),
    stage(35, 'Long Game', { allowedKinds: ALL_KINDS, handSize: 10, playerCount: 4, par: { turns: 60 } }),
    stage(36, 'Reckoning: Endurance', { allowedKinds: ALL_KINDS, handSize: 10, playerCount: 4, aiLevel: 'hard', goal: { type: 'score-min', points: 120 }, par: { turns: 64 } }),
    stage(37, 'Hard Bargain', { allowedKinds: ALL_KINDS, aiLevel: 'hard', playerCount: 3, stacking: true, par: { turns: 40 } }),
    stage(38, 'The Gauntlet', { allowedKinds: ALL_KINDS, aiLevel: 'hard', playerCount: 4, stacking: true, turnTimerSec: 10, par: { turns: 50 } }),
    stage(39, 'Final Table', { allowedKinds: ALL_KINDS, aiLevel: 'hard', playerCount: 4, stacking: true, goal: { type: 'win-turns', turns: 44 }, par: { turns: 44 } }),
    stage(40, 'Mastery: Color Eights', { allowedKinds: ALL_KINDS, aiLevel: 'hard', playerCount: 4, stacking: true, turnTimerSec: 10, mastery: true, goal: { type: 'score-min', points: 100 }, par: { turns: 50 } }),
  ];

  function journeyConfig(st) {
    return {
      seed: st.seed, playerCount: st.playerCount, stacking: st.stacking,
      drawToMatch: st.drawToMatch, allowedKinds: st.allowedKinds, palette: st.palette || undefined,
      turnTimerSec: st.turnTimerSec || 0, handSize: st.handSize || 7,
      contentId: st.id, contentVersion: st.version,
      assists: { hint: true, undo: false },
    };
  }
  function journeyTheme(st) {
    if (st.theme) return st.theme;
    const order = ['ember_lounge', 'tide_hall', 'verdant_room', 'solarium', 'midnight_neon'];
    return order[st.index % order.length];
  }
  // Evaluate a journey goal from a finished state + per-round human draw count.
  function goalMet(st, state, humanDraws) {
    if (!state.winner || !state.players.find(p => p.id === state.winner && !p.isAI)) return false;
    const g = st.goal;
    if (g.type === 'win') return true;
    if (g.type === 'win-turns') return (state.turnCount[state.winner] || 0) <= g.turns;
    if (g.type === 'win-no-draw') return humanDraws === 0;
    if (g.type === 'score-min') return state.scores.total >= g.points;
    return false;
  }

  /* ---------------- learn: interactive lessons ---------------- */
  // Each lesson sets up a rigged state and requires the player to perform the target action.
  const LESSONS = [
    {
      id: 'l1', version: 1, title: 'Match a Color',
      text: 'The discard shows a color. Play any card of the same color. Click the highlighted card.',
      setup: { seed: 'lesson-1', playerCount: 2, allowedKinds: ['number'] },
      rig: { hand: [['ember', 4], ['tide', 7], ['leaf', 2]], top: ['ember', 9] },
      require: { type: 'play', match: c => c.color === 'ember' },
      hintText: 'Play an Ember card to match the discard color.',
    },
    {
      id: 'l2', version: 1, title: 'Match a Rank',
      text: 'Colors do not match here, but ranks do. Play the card with the same number as the discard.',
      setup: { seed: 'lesson-2', playerCount: 2, allowedKinds: ['number'] },
      rig: { hand: [['tide', 4], ['leaf', 6], ['sol', 1]], top: ['ember', 4] },
      require: { type: 'play', match: c => c.rank === 4 },
      hintText: 'The discard is a 4. Play your Tide 4.',
    },
    {
      id: 'l3', version: 1, title: 'Draw When Stuck',
      text: 'Nothing matches. Draw a card from the pile, then your turn passes.',
      setup: { seed: 'lesson-3', playerCount: 2, allowedKinds: ['number'] },
      rig: { hand: [['tide', 4], ['tide', 6], ['leaf', 1]], top: ['ember', 9] },
      require: { type: 'draw' },
      hintText: 'No color or rank matches. Press the draw pile.',
    },
    {
      id: 'l4', version: 1, title: 'Skip and Reverse',
      text: 'Skip jumps over the next player. Reverse flips the direction of play. Play the Skip card.',
      setup: { seed: 'lesson-4', playerCount: 3, allowedKinds: ['number', 'skip', 'reverse'] },
      rig: { hand: [{ k: 'skip', c: 'ember' }, ['tide', 3], ['leaf', 5]], top: ['ember', 2] },
      require: { type: 'play', match: c => c.kind === 'skip' },
      hintText: 'Play the Ember Skip to jump over Vex.',
    },
    {
      id: 'l5', version: 1, title: 'Draw Two',
      text: 'Draw Two makes the next player take two cards and lose their turn. Play it now.',
      setup: { seed: 'lesson-5', playerCount: 2, allowedKinds: ['number', 'draw2'] },
      rig: { hand: [{ k: 'draw2', c: 'sol' }, ['tide', 3], ['leaf', 5]], top: ['sol', 8] },
      require: { type: 'play', match: c => c.kind === 'draw2' },
      hintText: 'Play the Sol Draw Two.',
    },
    {
      id: 'l6', version: 1, title: 'Wild Cards',
      text: 'Wild cards play on anything. Play the Wild, then choose the color you want next.',
      setup: { seed: 'lesson-6', playerCount: 2, allowedKinds: ['number', 'wild'] },
      rig: { hand: [{ k: 'wild' }, ['leaf', 3], ['leaf', 5]], top: ['ember', 8] },
      require: { type: 'play', match: c => c.kind === 'wild' },
      thenRequire: { type: 'chooseColor' },
      hintText: 'Play the Wild card, then pick a color.',
    },
    {
      id: 'l7', version: 1, title: 'Empty Your Hand',
      text: 'Win a short round against Vex. First player to empty their hand wins. Good luck.',
      setup: { seed: 'lesson-7', playerCount: 2, allowedKinds: ['number', 'skip', 'draw2', 'wild'], handSize: 4 },
      rig: null,
      require: { type: 'finish' },
      hintText: 'Match color or rank; draw when stuck. Empty your hand first.',
    },
  ];
  // Build a rigged state for a lesson: deterministic, human hand + top discard fixed.
  function rigLessonState(R, lesson) {
    const cfg = R.normalizeConfig(lesson.setup);
    const state = R.createGame(cfg, R.defaultPlayers(cfg.playerCount));
    if (!lesson.rig) return state;
    const human = state.players[0];
    const used = new Set();
    const mk = spec => {
      if (!Array.isArray(spec)) { // {k:'skip', c:'ember'} or {k:'wild'}
        const found = state.drawPile.find(c => c.kind === spec.k && !used.has(c.id) && (!spec.c || c.color === spec.c));
        used.add(found.id); return found;
      }
      const found = state.drawPile.find(c => c.kind === 'number' && c.color === spec[0] && c.rank === spec[1] && !used.has(c.id));
      used.add(found.id); return found;
    };
    human.hand = lesson.rig.hand.map(mk);
    const top = mk(lesson.rig.top);
    state.discardPile = [top];
    state.currentColor = top.color;
    state.drawPile = state.drawPile.filter(c => !used.has(c.id));
    state.currentPlayer = 0;
    return state;
  }

  /* ---------------- daily: one shared seed + ruleset per UTC day ---------------- */
  function dailyForDate(dateStr) { // 'YYYY-MM-DD' in UTC
    const R = globalThis.CERules;
    const h = R.hashSeed('daily:' + dateStr);
    const stacking = (h % 3) === 0;
    const playerCount = 2 + (h % 3); // 2..4
    const drawToMatch = (h % 5) === 0;
    return {
      id: 'daily-' + dateStr, version: CONTENT_VERSION, date: dateStr,
      name: 'Daily — ' + dateStr,
      config: {
        seed: 'daily:' + dateStr, playerCount, stacking, drawToMatch,
        contentId: 'daily-' + dateStr, contentVersion: CONTENT_VERSION,
        assists: { hint: false, undo: false },
      },
      rulesetLabel: [playerCount + ' players', stacking ? 'stacking' : 'no stacking', drawToMatch ? 'draw-to-match' : 'single draw'].join(' · '),
      excludedFromRanking: false,
    };
  }

  /* ---------------- challenges ---------------- */
  const CHALLENGES = [
    {
      id: 'ch-moves', version: 1, name: 'Twenty Turns',
      desc: 'Win in at most 20 of your own turns.',
      config: { seed: 'challenge:moves', playerCount: 3, moveLimit: 20, contentId: 'ch-moves', contentVersion: 1 },
      goalLabel: 'Move limit: 20',
    },
    {
      id: 'ch-speed', version: 1, name: 'Speed Lounge',
      desc: 'Each turn has a 6-second timer. Hesitation draws a card.',
      config: { seed: 'challenge:speed', playerCount: 3, turnTimerSec: 6, contentId: 'ch-speed', contentVersion: 1 },
      goalLabel: 'Turn timer: 6s',
    },
    {
      id: 'ch-mono', version: 1, name: 'Two-Tone',
      desc: 'Only Ember and Tide cards in the deck. Match carefully.',
      config: { seed: 'challenge:mono', playerCount: 2, palette: ['ember', 'tide'], contentId: 'ch-mono', contentVersion: 1 },
      goalLabel: 'Restricted palette',
    },
    {
      id: 'ch-nodraw', version: 1, name: 'Perfect Flow',
      desc: 'Win without drawing a single card (draw-to-match is off).',
      config: { seed: 'challenge:nodraw', playerCount: 2, handSize: 8, contentId: 'ch-nodraw', contentVersion: 1 },
      goalLabel: 'No draws allowed',
      special: 'no-draw',
    },
    {
      id: 'ch-avalanche', version: 1, name: 'Avalanche',
      desc: 'Stacking is on against three hard opponents.',
      config: { seed: 'challenge:avalanche', playerCount: 4, stacking: true, contentId: 'ch-avalanche', contentVersion: 1 },
      goalLabel: 'Stacking · 4 players · hard',
      aiLevel: 'hard',
    },
  ];

  /* ---------------- offline content validators ---------------- */
  function validateAll(R, opts) {
    const report = { ok: true, problems: [], checked: { journey: 0, lessons: 0, dailies: 0, challenges: 0 } };
    const problem = m => { report.ok = false; report.problems.push(m); };

    // deck sanity for every allowedKinds/palette combination used
    const seen = new Set();
    const combos = [];
    for (const st of JOURNEY) combos.push([st.allowedKinds, st.palette || R.COLORS, st.id]);
    for (const ch of CHALLENGES) combos.push([null, ch.config.palette || R.COLORS, ch.id]);
    for (const [kinds, palette, id] of combos) {
      const key = JSON.stringify([kinds, palette]);
      if (seen.has(key)) continue;
      seen.add(key);
      let deck = R.buildDeck();
      if (kinds) deck = deck.filter(c => c.kind === 'number' || kinds.includes(c.kind));
      deck = deck.filter(c => c.color === null || palette.includes(c.color));
      if (deck.length < 12) problem(id + ': deck too small (' + deck.length + ')');
    }

    // journey stages: simulate deterministic AI games, check termination + goal reachability class
    for (const st of JOURNEY) {
      report.checked.journey++;
      let state = R.createGame(journeyConfig(st));
      let guard = 0;
      while (state.phase === 'active' && guard++ < 3000) {
        const pl = state.players[state.currentPlayer];
        let cmd = state.pendingColorChoice
          ? { type: 'chooseColor', color: R.bestColorFor(pl) }
          : R.aiChoose(state, pl.id, pl.aiLevel);
        if (!cmd) { problem(st.id + ': AI found no action'); break; }
        cmd.id = 'v-' + guard; cmd.player = pl.id;
        const r = R.applyCommand(state, cmd);
        if (r.error) { problem(st.id + ': AI command rejected: ' + r.reason); break; }
        state = r.state;
      }
      if (state.phase !== 'finished') problem(st.id + ': simulation did not terminate (bounded duration failed)');
      else if (!state.terminalReason) problem(st.id + ': finished without terminal reason');
      // goal classes: win-turns/score-min need a plausible par
      if (st.goal.type === 'win-turns' && st.goal.turns < 3) problem(st.id + ': unrealistic turn goal');
    }

    // lessons: rigged states must make the required action legal
    for (const ls of LESSONS) {
      report.checked.lessons++;
      try {
        const state = rigLessonState(R, ls);
        const la = R.legalActions(state, state.players[0].id);
        if (!la.ok) { problem(ls.id + ': rigged state has no legal actions'); continue; }
        if (ls.require.type === 'play') {
          const human = state.players[0];
          const target = human.hand.find(c => ls.require.match(c));
          if (!target) problem(ls.id + ': rig missing required card');
          else if (!la.actions.some(a => a.type === 'play' && a.cardId === target.id)) problem(ls.id + ': required card not legal');
        } else if (ls.require.type === 'draw') {
          if (!la.actions.some(a => a.type === 'draw')) problem(ls.id + ': draw not legal');
          if (la.actions.some(a => a.type === 'play')) problem(ls.id + ': lesson expects no playable card');
        }
      } catch (e) { problem(ls.id + ': rig failed: ' + e.message); }
    }

    // dailies: a window of days must generate distinct seeds and terminate
    const days = (opts && opts.dailyDays) || 7;
    const seeds = new Set();
    for (let i = 0; i < days; i++) {
      const d = new Date(Date.UTC(2026, 0, 1 + i));
      const ds = d.toISOString().slice(0, 10);
      const daily = dailyForDate(ds);
      report.checked.dailies++;
      if (seeds.has(daily.config.seed)) problem('daily ' + ds + ': duplicate seed');
      seeds.add(daily.config.seed);
      let state = R.createGame(daily.config);
      let guard = 0;
      while (state.phase === 'active' && guard++ < 3000) {
        const pl = state.players[state.currentPlayer];
        let cmd = state.pendingColorChoice ? { type: 'chooseColor', color: R.bestColorFor(pl) } : R.aiChoose(state, pl.id, 'medium');
        cmd.id = 'v-' + guard; cmd.player = pl.id;
        const r = R.applyCommand(state, cmd);
        if (r.error) { problem('daily ' + ds + ': rejected ' + r.reason); break; }
        state = r.state;
      }
      if (state.phase !== 'finished') problem('daily ' + ds + ': no termination');
    }

    // challenges terminate
    for (const ch of CHALLENGES) {
      report.checked.challenges++;
      let state = R.createGame(ch.config);
      let guard = 0;
      while (state.phase === 'active' && guard++ < 3000) {
        const pl = state.players[state.currentPlayer];
        let cmd = state.pendingColorChoice ? { type: 'chooseColor', color: R.bestColorFor(pl) } : R.aiChoose(state, pl.id, 'medium');
        cmd.id = 'v-' + guard; cmd.player = pl.id;
        const r = R.applyCommand(state, cmd);
        if (r.error) { problem(ch.id + ': rejected ' + r.reason); break; }
        state = r.state;
      }
      if (state.phase !== 'finished') problem(ch.id + ': no termination');
    }
    return report;
  }

  global.CEContent = {
    CONTENT_VERSION, THEMES, DEFAULT_THEME, CVD_PALETTES,
    JOURNEY, journeyConfig, journeyTheme, goalMet,
    LESSONS, rigLessonState, dailyForDate, CHALLENGES, validateAll,
  };
})(typeof window !== 'undefined' ? window : globalThis);
