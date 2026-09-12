/* Color Eights — app: screen flow, DOM game UI, settings, progress.
 * Owns boot → title → mode screens → game → results. Rules stay in CERules;
 * this layer only dispatches validated commands through CESession. */
(function (global) {
  'use strict';

  const doc = () => global.document;

  let settings = null;
  let progress = null;
  let session = null;      // active CESession or null
  let mode = null;         // 'practice' | 'journey' | 'daily' | 'challenge' | 'learn'
  let modeCtx = null;      // { stage?, lesson?, challenge?, daily? }
  let overlayEl = null;    // active overlay element or null
  let overlayMandatory = false;
  let progressRecorded = false;
  let lessonAwaiting = null; // 'play' | 'chooseColor' | 'finish' | null
  let lastDrawPileLen = -1; // detects discard-pile recycling for the shuffle cue

  const SHAPE_GLYPH = { diamond: '◆', wave: '≈', leaf: '♣', sun: '☀' };

  const ACHIEVEMENTS = {
    'first-win': 'Win your first round',
    'all-lessons': 'Complete every lesson',
    'journey-mastery': 'Complete a journey mastery stage',
    'streak-3': 'Win three rounds in a row',
    'century': 'Score 100+ points in one round',
  };

  /* ---------------- helpers ---------------- */
  function el(tag, cls, text) { return global.CEUI.el(tag, cls, text); }
  function announce(t) { global.CEUI.announce(t); }
  function sfx(name) { try { global.CEAudio.playSfx(name); } catch (e) {} }

  function btn(label, cls, onClick) {
    const b = el('button', 'ce-btn' + (cls ? ' ' + cls : ''), label);
    b.type = 'button';
    b.addEventListener('click', () => { sfx('select'); onClick(); });
    return b;
  }

  // Decorative illustration; removes itself if the asset fails to load so layout never breaks.
  function artImage(src, cls) {
    const img = el('img', cls);
    img.src = src;
    img.alt = '';
    img.decoding = 'async';
    img.setAttribute('aria-hidden', 'true');
    img.addEventListener('error', () => { if (img.parentNode) img.parentNode.removeChild(img); });
    return img;
  }

  function palette() {
    const key = settings.accessibility.palette;
    const cvd = global.CEContent.CVD_PALETTES[key];
    const base = {};
    for (const c of global.CERules.COLORS) base[c] = global.CERules.COLOR_INFO[c].hex;
    return cvd ? Object.assign(base, cvd) : base;
  }
  function cardHex(card) {
    if (!card || !card.color) return '#9a93a3'; // wilds
    return palette()[card.color] || '#9a93a3';
  }
  function cardGlyph(card) {
    if (!card || !card.color) return '★';
    return SHAPE_GLYPH[global.CERules.COLOR_INFO[card.color].shape] || '';
  }
  function colorLabel(c) { return global.CERules.COLOR_INFO[c].label; }

  function clearOverlay() {
    if (overlayEl && overlayEl.parentNode) overlayEl.parentNode.removeChild(overlayEl);
    overlayEl = null;
    overlayMandatory = false;
  }
  function showOverlay(panel, mandatory) {
    clearOverlay();
    overlayEl = el('div', 'ce-overlay');
    overlayEl.setAttribute('role', 'dialog');
    overlayEl.appendChild(panel);
    global.CEUI.append(overlayEl);
    overlayMandatory = !!mandatory;
    const first = panel.querySelector('button, select, input');
    if (first) first.focus();
    return overlayEl;
  }

  function currentTheme() {
    if (mode === 'journey' && modeCtx && modeCtx.stage) {
      return global.CEContent.THEMES[global.CEContent.journeyTheme(modeCtx.stage)];
    }
    return global.CEContent.THEMES[global.CEContent.DEFAULT_THEME];
  }

  /* ---------------- boot ---------------- */
  function boot() {
    // Platform handshake first: token read, then the remote save (when
    // hosted) wins over the local cache before anything renders.
    try { global.CEPlatform.init(); } catch (e) { /* offline */ }
    settings = global.CEStore.loadSettings();
    progress = global.CEStore.loadProgress();
    global.CEStore.loadProfile();
    if (global.CEPlatform.hosted) {
      try {
        global.CEPlatform.fetchProfile().then(renderAccountLine).catch(() => {});
        global.CEPlatform.onSync(renderAccountLine);
      } catch (e) { /* ok */ }
      global.CEPlatform.loadCloud().then((remote) => {
        if (!remote) return;
        const S = global.CEStore;
        const rs = remote.settings && S.unwrap(remote.settings, S.SETTINGS_VERSION);
        const rp = remote.progress && S.unwrap(remote.progress, S.PROGRESS_VERSION);
        if (rs) { settings = S.loadSettings(); S.saveSettings(Object.assign(settings, rs)); }
        if (rp) { progress = S.loadProgress(); S.saveProgress(Object.assign(progress, rp)); }
        applySettings();
      }).catch(() => {});
    }

    const canvas = doc().getElementById('ce-canvas');
    try {
      global.CERender.init(canvas);
      global.CERender.applyTheme(currentTheme());
      global.CERender.start();
    } catch (e) {
      const ui = doc().getElementById('ce-ui');
      ui.className = 'ce-screen ce-boot';
      ui.innerHTML = '';
      const p = el('p', null, 'Color Eights needs WebGL, which is unavailable in this browser. Your settings and progress are preserved.');
      ui.appendChild(p);
      return;
    }

    applySettings();
    global.addEventListener('resize', () => global.CERender.resize());
    doc().addEventListener('keydown', onKey);
    doc().addEventListener('visibilitychange', () => {
      if (!session || session.finished) return;
      if (doc().hidden) session.pause();
      else if (!overlayEl) session.resume();
    });
    // WebAudio requires a user gesture to start.
    const unlock = () => {
      try {
        global.CEAudio.ensureCtx();
        applySettings();
        if (!settings.audio.muted) global.CEAudio.startMusic();
      } catch (e) {}
      doc().removeEventListener('pointerdown', unlock);
      doc().removeEventListener('keydown', unlock);
    };
    doc().addEventListener('pointerdown', unlock);
    doc().addEventListener('keydown', unlock);

    titleScreen();
  }

  function applySettings() {
    const a = settings.audio;
    global.CEAudio.setMuted(a.muted);
    global.CEAudio.setVolume('music', a.music);
    global.CEAudio.setVolume('effects', a.effects);
    global.CEAudio.setVolume('ambience', a.ambience);
    global.CEAudio.setMuted(a.muted);
    const b = doc().body;
    b.classList.toggle('ce-reduced-motion', !!settings.graphics.reducedMotion);
    b.classList.toggle('ce-contrast', !!settings.accessibility.highContrast);
    b.classList.toggle('ce-large-text', !!settings.accessibility.largeText);
    global.CERender.setQuality(settings.graphics.tier);
  }

  /* ---------------- title / menus ---------------- */
  function titleScreen() {
    teardownSession();
    global.CEUI.setScreen('ce-menu');
    global.CEUI.clear();

    const wrap = el('div', 'ce-menu-inner');
    wrap.appendChild(artImage('assets/key-art.webp', 'ce-key-art'));
    wrap.appendChild(el('h1', 'ce-title-big', 'Color Eights'));
    wrap.appendChild(el('p', 'ce-tagline', 'Match the discard by color or rank. Empty your hand first.'));
    wrap.appendChild(accountLine());

    const snap = resumeSnapshot();
    if (snap) wrap.appendChild(btn('Resume round', 'ce-btn-primary', () => resumeFrom(snap)));

    wrap.appendChild(btn('Practice', 'ce-btn-primary', practiceSetupScreen));
    wrap.appendChild(btn('Journey', null, journeyScreen));
    wrap.appendChild(btn('Daily Challenge', null, startDaily));
    wrap.appendChild(btn('Challenges', null, challengesScreen));
    wrap.appendChild(btn('Learn', null, learnScreen));
    wrap.appendChild(btn('Settings', null, () => showOverlay(settingsPanel())));

    global.CEUI.append(wrap);
    const first = wrap.querySelector('button');
    if (first) first.focus();
    announce('Color Eights main menu');
  }

  // Account + cloud-sync status line on the title menu. Offline keeps the
  // identical local-only behaviour; hosted shows the account nickname.
  function accountLine() {
    const p = el('p', 'ce-tagline', '');
    p.id = 'ce-account';
    renderAccountLine();
    return p;
  }
  function renderAccountLine() {
    const P = global.CEPlatform;
    const node = doc().getElementById('ce-account');
    if (!node || !P) return;
    if (!P.hosted) {
      node.textContent = 'Offline — progress is stored on this device.';
      return;
    }
    const name = P.profile ? P.profile.name : '…';
    const syncTxt = P.sync === 'synced' ? 'progress synced'
      : P.sync === 'saving' ? 'saving…'
      : 'cloud sync unavailable';
    node.textContent = 'Playing as ' + name + ' · ' + syncTxt;
  }

  function resumeSnapshot() {
    const snap = global.CEStore.loadSnapshot();
    if (!snap || !snap.state) return null;
    try {
      const st = JSON.parse(snap.state);
      if (st && st.phase === 'active') return snap;
    } catch (e) {}
    return null;
  }
  function resumeFrom(snap) {
    let st;
    try { st = JSON.parse(snap.state); } catch (e) { return; }
    mode = snap.mode || 'practice';
    modeCtx = null;
    const content = global.CEContent;
    const id = st.config.contentId;
    if (mode === 'journey') modeCtx = { stage: content.JOURNEY.find(s => s.id === id) };
    else if (mode === 'challenge') modeCtx = { challenge: content.CHALLENGES.find(c => c.config.contentId === id) };
    else if (mode === 'daily' && /^daily-\d{4}-\d{2}-\d{2}$/.test(id)) modeCtx = { daily: content.dailyForDate(id.slice(6)) };
    session = global.CESession.createSession({ config: st.config, restoreState: snap.state, mode, humanId: snap.humanId, sessionId: snap.sessionId });
    session.humanDraws = Math.max(0, Number(snap.humanDraws) || 0);
    session.replay = snap.replay || null;
    wireSession();
    gameScreen();
  }

  function practiceSetupScreen() {
    global.CEUI.setScreen('ce-menu');
    global.CEUI.clear();
    const wrap = el('div', 'ce-menu-inner');
    wrap.appendChild(el('h1', null, 'Practice'));
    wrap.appendChild(el('p', 'ce-tagline', 'Unranked. Optional undo assist.'));

    const playersSel = selectField(wrap, 'Players', ['2', '3', '4'], '2');
    const levelSel = selectField(wrap, 'Opponent skill', ['easy', 'medium', 'hard'], 'medium');
    const stackingChk = checkField(wrap, 'Stacking (Draw cards stack)', settings.rulesOptions.stacking);
    const dtmChk = checkField(wrap, 'Draw-to-match (draw up to 3)', settings.rulesOptions.drawToMatch);
    const undoChk = checkField(wrap, 'Undo assist', true);

    wrap.appendChild(btn('Start round', 'ce-btn-primary', () => {
      const count = Number(playersSel.value);
      const players = [{ id: 'p0', name: 'You', isAI: false }];
      const names = ['Vex', 'Mira', 'Tallo'];
      for (let i = 1; i < count; i++) players.push({ id: 'p' + i, name: names[i - 1], isAI: true, aiLevel: levelSel.value });
      settings.rulesOptions.stacking = stackingChk.checked;
      settings.rulesOptions.drawToMatch = dtmChk.checked;
      global.CEStore.saveSettings(settings);
      newSession({
        seed: 'practice-' + Date.now().toString(36),
        playerCount: count,
        stacking: stackingChk.checked,
        drawToMatch: dtmChk.checked,
        assists: { hint: true, undo: undoChk.checked },
      }, 'practice', null, players);
    }));
    wrap.appendChild(btn('Back', null, titleScreen));
    global.CEUI.append(wrap);
  }

  function selectField(parent, label, options, dflt) {
    const row = el('label', 'ce-field');
    row.appendChild(el('span', 'ce-settings-label', label));
    const sel = el('select');
    for (const o of options) {
      const opt = el('option', null, o);
      opt.value = o;
      if (o === dflt) opt.selected = true;
      sel.appendChild(opt);
    }
    row.appendChild(sel);
    parent.appendChild(row);
    return sel;
  }
  function checkField(parent, label, dflt) {
    const row = el('label', 'ce-field');
    row.appendChild(el('span', 'ce-settings-label', label));
    const chk = el('input');
    chk.type = 'checkbox';
    chk.checked = !!dflt;
    row.appendChild(chk);
    parent.appendChild(row);
    return chk;
  }

  /* ---------------- journey ---------------- */
  function journeyScreen() {
    global.CEUI.setScreen('ce-menu');
    global.CEUI.clear();
    const wrap = el('div', 'ce-menu-inner ce-wide');
    wrap.appendChild(el('h1', null, 'Journey'));
    wrap.appendChild(el('p', 'ce-tagline', 'Forty stages. New mechanics arrive one at a time.'));
    const grid = el('div', 'ce-journey-grid');
    for (const st of global.CEContent.JOURNEY) {
      const rec = progress.journey[st.id];
      const mark = rec && rec.goalMet ? ' ✓' : '';
      const b = btn(st.index + '. ' + st.name + mark, 'ce-stage-btn' + (st.mastery ? ' ce-mastery' : ''), () => stageIntro(st));
      grid.appendChild(b);
    }
    wrap.appendChild(grid);
    wrap.appendChild(btn('Back', null, titleScreen));
    global.CEUI.append(wrap);
  }

  function goalText(g) {
    if (!g || g.type === 'win') return 'Goal: win the round.';
    if (g.type === 'win-turns') return 'Goal: win in at most ' + g.turns + ' of your turns.';
    if (g.type === 'win-no-draw') return 'Goal: win without drawing a card.';
    if (g.type === 'score-min') return 'Goal: win with a score of at least ' + g.points + '.';
    return 'Goal: win the round.';
  }

  function stageIntro(st) {
    const panel = el('div', 'ce-panel');
    panel.appendChild(el('h2', null, st.index + '. ' + st.name));
    if (st.intro) panel.appendChild(el('p', null, st.intro));
    panel.appendChild(el('p', null, goalText(st.goal)));
    panel.appendChild(el('p', null, st.playerCount + ' players · ' + (st.aiLevel || 'easy') + ' opponents' + (st.stacking ? ' · stacking' : '')));
    panel.appendChild(btn('Play', 'ce-btn-primary', () => {
      clearOverlay();
      startJourneyStage(st);
    }));
    panel.appendChild(btn('Cancel', null, clearOverlay));
    showOverlay(panel);
  }

  function startJourneyStage(st) {
    const cfg = global.CEContent.journeyConfig(st);
    const players = [{ id: 'p0', name: 'You', isAI: false }];
    const names = ['Vex', 'Mira', 'Tallo'];
    for (let i = 1; i < cfg.playerCount; i++) players.push({ id: 'p' + i, name: names[i - 1], isAI: true, aiLevel: st.aiLevel || 'easy' });
    newSession(cfg, 'journey', { stage: st }, players);
  }

  /* ---------------- daily / challenges ---------------- */
  function startDaily() {
    const dateStr = new Date(global.CEPlatform.serverNow()).toISOString().slice(0, 10);
    const daily = global.CEContent.dailyForDate(dateStr);
    const players = [{ id: 'p0', name: 'You', isAI: false }];
    const names = ['Vex', 'Mira', 'Tallo'];
    for (let i = 1; i < daily.config.playerCount; i++) players.push({ id: 'p' + i, name: names[i - 1], isAI: true, aiLevel: 'medium' });
    newSession(daily.config, 'daily', { daily }, players);
  }

  function challengesScreen() {
    global.CEUI.setScreen('ce-menu');
    global.CEUI.clear();
    const wrap = el('div', 'ce-menu-inner');
    wrap.appendChild(el('h1', null, 'Challenges'));
    for (const ch of global.CEContent.CHALLENGES) {
      const rec = progress.challenges[ch.id];
      const row = el('div', 'ce-challenge-row');
      const b = btn(ch.name + (rec && rec.completed ? ' ✓' : ''), 'ce-btn-primary', () => startChallenge(ch));
      row.appendChild(b);
      row.appendChild(el('p', 'ce-challenge-desc', ch.desc + ' (' + ch.goalLabel + ')'));
      wrap.appendChild(row);
    }
    wrap.appendChild(btn('Back', null, titleScreen));
    global.CEUI.append(wrap);
  }
  function startChallenge(ch) {
    const players = [{ id: 'p0', name: 'You', isAI: false }];
    const names = ['Vex', 'Mira', 'Tallo'];
    for (let i = 1; i < ch.config.playerCount; i++) players.push({ id: 'p' + i, name: names[i - 1], isAI: true, aiLevel: ch.aiLevel || 'medium' });
    newSession(ch.config, 'challenge', { challenge: ch }, players);
  }

  /* ---------------- learn (lessons) ---------------- */
  function learnScreen() {
    global.CEUI.setScreen('ce-menu');
    global.CEUI.clear();
    const wrap = el('div', 'ce-menu-inner');
    wrap.appendChild(el('h1', null, 'Learn'));
    wrap.appendChild(el('p', 'ce-tagline', 'Interactive lessons: one rule at a time.'));
    for (const ls of global.CEContent.LESSONS) {
      const done = progress.tutorials[ls.id];
      wrap.appendChild(btn(ls.title + (done ? ' ✓' : ''), 'ce-lesson-btn', () => startLesson(ls)));
    }
    wrap.appendChild(btn('Back', null, titleScreen));
    global.CEUI.append(wrap);
  }

  function startLesson(ls) {
    const R = global.CERules;
    const rigged = global.CEContent.rigLessonState(R, ls);
    mode = 'learn';
    modeCtx = { lesson: ls };
    lessonAwaiting = ls.require.type === 'finish' ? 'finish' : ls.require.type;
    teardownSession();
    session = global.CESession.createSession({
      config: rigged.config, restoreState: R.serialize(rigged), mode: 'learn', aiDelayMs: 650,
    });
    wireSession();
    gameScreen();
    sfx('shuffle');
    announce(ls.title + '. ' + ls.text);
  }

  // Gate lesson input: only the required action is accepted.
  function lessonAllows(command, card) {
    if (mode !== 'learn' || !modeCtx || !modeCtx.lesson) return true;
    const ls = modeCtx.lesson;
    if (ls.require.type === 'finish') return true;
    if (lessonAwaiting === 'chooseColor') return command.type === 'chooseColor';
    if (ls.require.type !== command.type) return false;
    if (ls.require.type === 'play' && ls.require.match) return !!(card && ls.require.match(card));
    return true;
  }
  function lessonAdvanced(command) {
    if (mode !== 'learn' || !modeCtx || !modeCtx.lesson) return;
    const ls = modeCtx.lesson;
    if (lessonAwaiting === 'play' && ls.thenRequire) lessonAwaiting = ls.thenRequire.type;
    else if (lessonAwaiting !== 'finish') completeLesson(ls);
  }
  function completeLesson(ls) {
    if (progress.tutorials[ls.id]) return;
    progress.tutorials[ls.id] = true;
    global.CEStore.saveProgress(progress);
    checkAchievements();
    sfx('achievement');
    const panel = el('div', 'ce-panel');
    panel.appendChild(el('h2', null, 'Lesson complete'));
    panel.appendChild(el('p', null, ls.title + ' — well done.'));
    const next = global.CEContent.LESSONS[global.CEContent.LESSONS.indexOf(ls) + 1];
    if (next) panel.appendChild(btn('Next lesson', 'ce-btn-primary', () => { clearOverlay(); startLesson(next); }));
    panel.appendChild(btn('Back to lessons', null, () => { clearOverlay(); learnScreen(); }));
    showOverlay(panel);
  }

  /* ---------------- session wiring ---------------- */
  function newSession(config, modeName, ctx, players) {
    teardownSession();
    mode = modeName;
    modeCtx = ctx || null;
    lessonAwaiting = null;
    session = global.CESession.createSession({ config, mode: modeName, players, aiDelayMs: 650 });
    wireSession();
    gameScreen();
    sfx('shuffle');
  }

  function wireSession() {
    progressRecorded = false;
    global.CERender.applyTheme(currentTheme());
    session.on('events', onEvents);
    lastDrawPileLen = session.state.drawPile.length;
    session.on('state', (st) => {
      if (st.drawPile.length > lastDrawPileLen) sfx('shuffle'); // discard pile recycled
      lastDrawPileLen = st.drawPile.length;
      global.CERender.syncState(st, cardHex);
      if (doc().querySelector('.ce-game')) renderGame();
      if (st.phase === 'finished') onRoundEnd(st);
    });
    session.on('error', () => {});
    global.CERender.syncState(session.state, cardHex);
  }

  function teardownSession() {
    if (session) {
      session.pause();
      session = null;
    }
    clearOverlay();
  }

  function playerName(id) {
    const p = session && session.state.players.find(pl => pl.id === id);
    return p ? p.name : id;
  }

  function onEvents(events) {
    for (const ev of events) {
      switch (ev.ev) {
        case 'cardPlayed': {
          const c = ev.card;
          sfx(c.kind === 'number' ? 'card' : 'action');
          announce(playerName(ev.player) + ' played ' + global.CERules.cardLabel(c));
          break;
        }
        case 'drew':
          sfx('draw');
          announce(playerName(ev.player) + ' drew ' + ev.count + (ev.count > 1 ? ' cards' : ' card'));
          break;
        case 'penaltyTaken':
          sfx('penalty');
          announce(playerName(ev.player) + ' took the ' + ev.amount + '-card penalty');
          break;
        case 'skipped': announce(playerName(ev.player) + ' was skipped'); break;
        case 'reversed': sfx('action'); announce('Direction of play reversed'); break;
        case 'colorChosen':
          announce('Color is now ' + colorLabel(ev.color));
          if (mode === 'learn' && lessonAwaiting === 'chooseColor' && ev.player === 'p0') completeLesson(modeCtx.lesson);
          break;
        case 'awaitColorChoice':
          if (ev.player === session.humanId) renderGame(); // chooser appears
          break;
        case 'oneCardLeft': sfx('onecard'); announce(playerName(ev.player) + ' has one card left'); break;
        case 'turnTimeout': announce(playerName(ev.player) + ' ran out of time and drew'); break;
        case 'moveLimitHit': announce('Move limit reached'); break;
        case 'invalidAction':
          if (ev.player === session.humanId) { sfx('invalid'); announce('That move is not legal: ' + reasonText(ev.reason)); }
          break;
        case 'undone': sfx('undo'); announce('Move undone'); break;
        case 'turnPassed':
          if (ev.next === session.humanId && !session.finished) sfx('turn');
          break;
        case 'roundEnd': sfx(ev.winner === session.humanId ? 'win' : 'lose'); break;
      }
    }
  }

  function reasonText(reason) {
    const map = {
      'not-your-turn': 'wait for your turn',
      'no-color-or-rank-match': 'match the discard color or rank',
      'must-draw-penalty': 'you must draw the penalty cards',
      'stacking-requires-draw-card': 'stack a Draw card or take the penalty',
      'card-not-in-hand': 'that card is not in your hand',
      'round-finished': 'the round is over',
    };
    return map[reason] || reason;
  }

  /* ---------------- game screen ---------------- */
  function gameScreen() {
    global.CEUI.setScreen('ce-game');
    global.CEUI.clear();
    renderGame();
  }

  function renderGame() {
    if (!session) return;
    const R = global.CERules;
    const st = session.state;
    const screen = doc().getElementById('ce-ui');
    screen.innerHTML = '';

    // header
    const header = el('header', 'ce-header');
    const titles = { practice: 'Practice', journey: 'Journey', daily: 'Daily', challenge: 'Challenge', learn: 'Learn' };
    let titleText = titles[mode] || 'Color Eights';
    if (mode === 'journey' && modeCtx) titleText = modeCtx.stage.index + '. ' + modeCtx.stage.name;
    if (mode === 'challenge' && modeCtx) titleText = modeCtx.challenge.name;
    if (mode === 'learn' && modeCtx) titleText = modeCtx.lesson.title;
    header.appendChild(el('div', 'ce-title', titleText));
    const right = el('div', 'ce-header-right');
    right.appendChild(btn('Pause', null, pauseOverlay));
    header.appendChild(right);
    screen.appendChild(header);

    const main = el('main', 'ce-main');

    // lesson banner
    if (mode === 'learn' && modeCtx) {
      const banner = el('p', 'ce-lesson-banner', modeCtx.lesson.text);
      main.appendChild(banner);
    }

    // turn + color status
    const info = el('div', 'ce-table-info');
    const humanTurn = session.isHumanTurn();
    const cur = st.players[st.currentPlayer];
    let turnText;
    if (st.pendingColorChoice) {
      turnText = st.pendingColorChoice.player === 0 ? 'Choose a color' : playerName(st.players[st.pendingColorChoice.player].id) + ' is choosing a color';
    } else {
      turnText = humanTurn ? 'Your turn' : cur.name + ' is thinking…';
    }
    if (st.config.turnTimerSec && humanTurn && session.turnTimeLeft() > 0) {
      turnText += ' (' + Math.ceil(session.turnTimeLeft()) + 's)';
    }
    const turnEl = el('div', 'ce-turn-label', turnText);
    turnEl.setAttribute('role', 'status');
    info.appendChild(turnEl);

    const chip = el('div', 'ce-color-chip');
    chip.appendChild(el('span', 'ce-chip-dot', SHAPE_GLYPH[R.COLOR_INFO[st.currentColor].shape] || ''));
    chip.style.setProperty('--chip', palette()[st.currentColor]);
    chip.appendChild(el('span', null, colorLabel(st.currentColor) + (st.pendingDraw > 0 ? ' · draw ' + st.pendingDraw + ' pending' : '')));
    info.appendChild(chip);

    // opponents summary
    const opp = el('div', 'ce-draw-count',
      st.players.slice(1).map(p => p.name + ': ' + p.hand.length).join(' · '));
    info.appendChild(opp);
    main.appendChild(info);

    // table: draw pile + discard top
    const table = el('div', 'ce-table-cards');
    const la = R.legalActions(st, session.humanId);
    const canDraw = la.ok && la.actions.some(a => a.type === 'draw');
    const drawBtn = btn('Draw (' + st.drawPile.length + ')', 'ce-draw-pile', () => tryDraw());
    drawBtn.disabled = !canDraw;
    drawBtn.setAttribute('aria-label', 'Draw from the pile, ' + st.drawPile.length + ' cards left');
    table.appendChild(drawBtn);
    const top = R.topDiscard(st);
    const topEl = el('div', 'ce-discard-top', top ? cardGlyph(top) + ' ' + R.cardLabel(top) : '');
    topEl.style.background = top ? cardHex(top) : '#444';
    topEl.setAttribute('role', 'img');
    topEl.setAttribute('aria-label', 'Top of discard: ' + (top ? R.cardLabel(top) : 'none'));
    table.appendChild(topEl);
    main.appendChild(table);

    // hand
    const hand = el('div', 'ce-hand');
    hand.setAttribute('role', 'group');
    hand.setAttribute('aria-label', 'Your hand');
    const me = st.players[0];
    const playable = new Set(la.ok ? la.actions.filter(a => a.type === 'play').map(a => a.cardId) : []);
    for (const card of me.hand) {
      const label = cardGlyph(card) + ' ' + R.cardLabel(card);
      const b = btn(label, 'ce-card-btn' + (playable.has(card.id) ? ' ce-playable' : ''), () => tryPlay(card.id));
      b.style.background = cardHex(card);
      b.disabled = !playable.has(card.id);
      let aria = R.cardLabel(card);
      if (!playable.has(card.id)) {
        const why = R.explainInvalid(st, session.humanId, card.id);
        if (why) aria += ' — not playable: ' + reasonText(why);
      }
      b.setAttribute('aria-label', aria);
      b.dataset.cardId = card.id;
      hand.appendChild(b);
    }
    main.appendChild(hand);

    // action row
    const actions = el('div', 'ce-action-row');
    if (st.config.assists && st.config.assists.hint) {
      actions.appendChild(btn(mode === 'learn' ? 'Hint' : 'Hint (H)', null, showHint));
    }
    if (session.canUndo()) actions.appendChild(btn('Undo (U)', null, doUndo));
    if (mode === 'learn' && modeCtx) {
      actions.appendChild(btn('Restart lesson', null, () => startLesson(modeCtx.lesson)));
    }
    main.appendChild(actions);

    screen.appendChild(main);

    // pending color choice for the human
    if (st.pendingColorChoice && st.players[st.pendingColorChoice.player].id === session.humanId) {
      showColorChooser();
    }
  }

  function showColorChooser() {
    const panel = el('div', 'ce-panel ce-color-panel');
    panel.appendChild(el('h2', null, 'Choose a color'));
    const row = el('div', 'ce-color-row');
    for (const c of global.CERules.COLORS) {
      const b = btn(SHAPE_GLYPH[global.CERules.COLOR_INFO[c].shape] + ' ' + colorLabel(c), 'ce-color-btn', () => {
        clearOverlay();
        dispatchHuman({ type: 'chooseColor', color: c });
      });
      b.style.background = palette()[c];
      row.appendChild(b);
    }
    panel.appendChild(row);
    showOverlay(panel, true);
  }

  function dispatchHuman(command) {
    if (!session || session.finished) return;
    command.player = session.humanId;
    if (!lessonAllows(command, command.cardId && session.state.players[0].hand.find(c => c.id === command.cardId))) {
      announce(modeCtx.lesson.hintText);
      sfx('invalid');
      return;
    }
    const res = session.dispatch(command);
    if (res.ok) lessonAdvanced(command);
  }

  function tryPlay(cardId) {
    dispatchHuman({ type: 'play', cardId });
  }
  function tryDraw() {
    dispatchHuman({ type: 'draw' });
  }

  function showHint() {
    if (!session) return;
    if (mode === 'learn' && modeCtx) { sfx('hint'); announce(modeCtx.lesson.hintText); return; }
    const h = session.hint();
    if (!h.ok) { announce('No hint available right now'); return; }
    sfx('hint');
    if (h.action.type === 'play') {
      announce('Hint: play ' + global.CERules.cardLabel(session.state.players[0].hand.find(c => c.id === h.action.cardId)));
      const elBtn = doc().querySelector('[data-card-id="' + h.action.cardId + '"]');
      if (elBtn) {
        elBtn.classList.add('ce-hinted');
        setTimeout(() => elBtn.classList.remove('ce-hinted'), 1600);
      }
    } else if (h.action.type === 'draw') {
      announce('Hint: draw a card');
    } else {
      announce('Hint: choose your strongest color');
    }
  }

  function doUndo() {
    if (!session) return;
    const r = session.undo();
    if (!r.ok) announce('Cannot undo: ' + reasonText(r.reason));
  }

  /* ---------------- pause / settings ---------------- */
  function pauseOverlay() {
    if (!session) return;
    session.pause();
    const panel = el('div', 'ce-panel');
    panel.appendChild(el('h2', null, 'Paused'));
    panel.appendChild(btn('Resume', 'ce-btn-primary', () => { clearOverlay(); session && session.resume(); }));
    panel.appendChild(btn('Restart round', null, () => { clearOverlay(); restartRound(); }));
    panel.appendChild(btn('Settings', null, () => showOverlay(settingsPanel())));
    panel.appendChild(btn('Save & quit to menu', null, () => {
      if (session && !session.finished) global.CEStore.saveSnapshot(session.snapshot());
      titleScreen();
    }));
    panel.appendChild(btn('Quit without saving', null, () => {
      if (session && !session.finished) session.dispatch({ type: 'resign', player: session.humanId, id: 'resign-' + Date.now().toString(36) });
      titleScreen();
    }));
    showOverlay(panel);
  }

  function restartRound() {
    if (!modeCtx && mode !== 'practice' && mode !== 'daily') { titleScreen(); return; }
    if (mode === 'journey' && modeCtx) return startJourneyStage(modeCtx.stage);
    if (mode === 'challenge' && modeCtx) return startChallenge(modeCtx.challenge);
    if (mode === 'learn' && modeCtx) return startLesson(modeCtx.lesson);
    if (mode === 'daily') return startDaily();
    if (mode === 'practice' && session) {
      return newSession(session.state.config, 'practice', null,
        session.state.players.map(p => ({ id: p.id, name: p.name, isAI: p.isAI, aiLevel: p.aiLevel })));
    }
    titleScreen();
  }

  function settingsPanel() {
    const panel = el('div', 'ce-panel');
    panel.appendChild(el('h2', null, 'Settings'));

    const sliders = [['Music', 'music'], ['Effects', 'effects'], ['Ambience', 'ambience']];
    for (const [label, bus] of sliders) {
      const row = el('label', 'ce-settings-row');
      row.appendChild(el('span', 'ce-settings-label', label));
      const input = el('input');
      input.type = 'range'; input.min = '0'; input.max = '1'; input.step = '0.05';
      input.value = String(settings.audio[bus]);
      input.addEventListener('input', () => {
        settings.audio[bus] = Number(input.value);
        global.CEAudio.setVolume(bus, settings.audio[bus]);
        global.CEStore.saveSettings(settings);
      });
      row.appendChild(input);
      panel.appendChild(row);
    }

    const muteRow = el('label', 'ce-settings-row');
    muteRow.appendChild(el('span', 'ce-settings-label', 'Mute all audio'));
    const mute = el('input');
    mute.type = 'checkbox';
    mute.checked = !!settings.audio.muted;
    mute.addEventListener('change', () => {
      settings.audio.muted = mute.checked;
      global.CEAudio.setMuted(mute.checked);
      global.CEStore.saveSettings(settings);
    });
    muteRow.appendChild(mute);
    panel.appendChild(muteRow);

    const palRow = el('label', 'ce-settings-row');
    palRow.appendChild(el('span', 'ce-settings-label', 'Color palette'));
    const pal = el('select');
    for (const key of ['standard', 'contrast', 'deuteranopia', 'tritanopia']) {
      const o = el('option', null, key);
      o.value = key;
      if (settings.accessibility.palette === key) o.selected = true;
      pal.appendChild(o);
    }
    pal.addEventListener('change', () => {
      settings.accessibility.palette = pal.value;
      global.CEStore.saveSettings(settings);
      if (session) { global.CERender.syncState(session.state, cardHex); renderGame(); }
    });
    palRow.appendChild(pal);
    panel.appendChild(palRow);

    const toggles = [
      ['Reduced motion', 'graphics', 'reducedMotion'],
      ['High contrast', 'accessibility', 'highContrast'],
      ['Larger text', 'accessibility', 'largeText'],
    ];
    for (const [label, group, key] of toggles) {
      const row = el('label', 'ce-settings-row');
      row.appendChild(el('span', 'ce-settings-label', label));
      const chk = el('input');
      chk.type = 'checkbox';
      chk.checked = !!settings[group][key];
      chk.addEventListener('change', () => {
        settings[group][key] = chk.checked;
        applySettings();
        global.CEStore.saveSettings(settings);
      });
      row.appendChild(chk);
      panel.appendChild(row);
    }

    panel.appendChild(btn('Close', 'ce-btn-primary', () => {
      clearOverlay();
      if (session && !session.finished && !doc().hidden) session.resume();
    }));
    return panel;
  }

  /* ---------------- round end / results ---------------- */
  function onRoundEnd(st) {
    if (progressRecorded) return;
    progressRecorded = true;
    global.CEStore.clearSnapshot();

    const humanWon = st.winner === session.humanId;
    progress.stats.roundsPlayed++;
    if (humanWon) {
      progress.stats.wins++;
      progress.stats.winStreak++;
      progress.stats.bestWinStreak = Math.max(progress.stats.bestWinStreak, progress.stats.winStreak);
      progress.mastery.points += st.scores.total;
    } else {
      progress.stats.winStreak = 0;
    }

    let journeyMet = null;
    if (mode === 'journey' && modeCtx && modeCtx.stage) {
      journeyMet = global.CEContent.goalMet(modeCtx.stage, st, session.humanDraws);
      const prev = progress.journey[modeCtx.stage.id] || {};
      progress.journey[modeCtx.stage.id] = {
        goalMet: !!(prev.goalMet || journeyMet),
        best: Math.max(prev.best || 0, humanWon ? st.scores.total : 0),
      };
    }
    if (mode === 'challenge' && modeCtx && modeCtx.challenge) {
      const prev = progress.challenges[modeCtx.challenge.id] || {};
      progress.challenges[modeCtx.challenge.id] = {
        completed: !!(prev.completed || humanWon),
        best: Math.max(prev.best || 0, humanWon ? st.scores.total : 0),
      };
    }
    if (mode === 'daily' && modeCtx && modeCtx.daily && humanWon) {
      progress.stats.dailyCompleted[modeCtx.daily.date] = true;
    }
    if (mode === 'learn' && modeCtx && modeCtx.lesson && humanWon && modeCtx.lesson.require.type === 'finish') {
      progress.tutorials[modeCtx.lesson.id] = true;
    }
    checkAchievements(st, humanWon);
    global.CEStore.saveProgress(progress);

    setTimeout(() => resultsScreen(st, humanWon, journeyMet), 650);
  }

  function checkAchievements(st, humanWon) {
    const unlock = (key) => {
      if (progress.achievements[key]) return;
      progress.achievements[key] = Date.now();
      sfx('achievement');
      announce('Achievement unlocked: ' + (ACHIEVEMENTS[key] || key));
    };
    if (humanWon) unlock('first-win');
    if (humanWon && st && st.scores && st.scores.total >= 100) unlock('century');
    if (progress.stats.winStreak >= 3) unlock('streak-3');
    if (mode === 'journey' && modeCtx && modeCtx.stage && modeCtx.stage.mastery &&
        global.CEContent.goalMet(modeCtx.stage, session.state, session.humanDraws)) unlock('journey-mastery');
    if (global.CEContent.LESSONS.every(ls => progress.tutorials[ls.id])) unlock('all-lessons');
  }

  function resultsScreen(st, humanWon, journeyMet) {
    if (!session) return; // user already left
    clearOverlay();
    global.CEUI.setScreen('ce-menu');
    global.CEUI.clear();
    const wrap = el('div', 'ce-menu-inner');
    wrap.appendChild(el('h1', null, humanWon ? 'You win!' : playerName(st.winner) + ' wins'));
    const reasonTextMap = {
      'empty-hand': 'Emptied their hand first.',
      'resignation': 'Round ended by resignation.',
      'move-limit': 'Move limit reached.',
    };
    wrap.appendChild(el('p', 'ce-tagline', reasonTextMap[st.terminalReason] || st.terminalReason));
    wrap.appendChild(artImage(humanWon ? 'assets/results-win.webp' : 'assets/results-lose.webp', 'ce-results-art'));
    if (journeyMet !== null && journeyMet !== undefined) {
      wrap.appendChild(el('p', 'ce-goal-line', journeyMet ? 'Stage goal met ✓' : 'Stage goal not met — ' + goalText(modeCtx.stage.goal)));
    }

    wrap.appendChild(el('h2', null, 'Score: ' + st.scores.total + ' points'));
    const list = el('ul', 'ce-breakdown');
    for (const b of st.scores.breakdown) {
      const li = el('li', null,
        b.name + ' — ' + b.cardsLeft + ' card' + (b.cardsLeft === 1 ? '' : 's') + ' left, ' + b.handValue + ' points' +
        (b.detail.length ? ' (' + b.detail.map(d => d.label + ' ' + d.value).join(', ') + ')' : ''));
      list.appendChild(li);
    }
    wrap.appendChild(list);

    wrap.appendChild(btn('Play again', 'ce-btn-primary', restartRound));
    if (mode === 'journey' && modeCtx) {
      const next = global.CEContent.JOURNEY[modeCtx.stage.index]; // index is 1-based; next entry
      if (next) wrap.appendChild(btn('Next stage', null, () => startJourneyStage(next)));
    }
    if (mode === 'learn' && modeCtx) {
      const next = global.CEContent.LESSONS[global.CEContent.LESSONS.indexOf(modeCtx.lesson) + 1];
      if (next) wrap.appendChild(btn('Next lesson', null, () => startLesson(next)));
    }
    wrap.appendChild(btn('Back to menu', null, titleScreen));
    global.CEUI.append(wrap);
    announce(humanWon ? 'You win. ' : playerName(st.winner) + ' wins. ' + 'Score ' + st.scores.total + ' points.');
    const first = wrap.querySelector('button');
    if (first) first.focus();
  }

  /* ---------------- keyboard ---------------- */
  function onKey(e) {
    const code = e.code;
    if (code === 'Escape') {
      if (overlayEl) {
        if (!overlayMandatory) {
          clearOverlay();
          if (session && !session.finished) session.resume();
        }
      } else if (session && !session.finished && doc().querySelector('.ce-game')) {
        pauseOverlay();
      }
      return;
    }
    if (!session || session.finished || overlayEl || !doc().querySelector('.ce-game')) return;
    if (code === 'KeyP') pauseOverlay();
    else if (code === 'KeyD') tryDraw();
    else if (code === 'KeyH') showHint();
    else if (code === 'KeyU') doUndo();
  }

  global.CEApp = { boot };
  // auto-boot when loaded in a browser with the DOM ready
  if (global.document && global.document.getElementById('ce-root')) {
    if (doc().readyState === 'loading') doc().addEventListener('DOMContentLoaded', boot);
    else boot();
  }
})(typeof window !== 'undefined' ? window : globalThis);
