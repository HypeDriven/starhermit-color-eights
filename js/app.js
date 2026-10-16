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

  // Localization (js/i18n.js, window.CEI18N): English source strings are the
  // keys. T() translates now; N() only marks a string for display-time T().
  function T(key, vars) {
    if (global.CEI18N) return global.CEI18N.T(key, vars);
    return String(key).replace(/\{(\w+)\}/g, (m, k) => (vars && k in vars ? String(vars[k]) : m));
  }
  const N = (key) => key;
  const curLang = () => (global.CEI18N && global.CEI18N.lang) || (global.navigator ? global.navigator.language : 'en-US');

  const ACHIEVEMENTS = {
    'first-win': N('Win your first round'),
    'all-lessons': N('Complete every lesson'),
    'journey-mastery': N('Complete a journey mastery stage'),
    'streak-3': N('Win three rounds in a row'),
    'century': N('Score 100+ points in one round'),
  };

  // Re-render hooks for a language change: the current screen and overlay.
  let screenRender = null;   // () => void, rebuilds the visible screen in place
  let overlayRebuild = null; // () => panel, rebuilds the open overlay's panel
  let settingsTab = 'general';
  const practicePrefs = { players: '2', level: 'medium', undo: true };

  /* ---------------- helpers ---------------- */
  function el(tag, cls, text) { return global.CEUI.el(tag, cls, text); }
  function announce(t) { global.CEUI.announce(t); }
  let PT = global.PlatformStrings.platformStrings(curLang()); // StarHermit strings in the game language
  // Short visual confirmation (invite link copied, signed out).
  function toast(text) {
    const t = el('div', 'ce-toast', text);
    t.setAttribute('role', 'status');
    doc().body.appendChild(t);
    setTimeout(() => t.remove(), 3500);
  }
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
  function colorLabel(c) { return T(global.CERules.COLOR_INFO[c].label); }
  // Card names in the game language (rules keep English labels for logs/replays).
  function cardLabel(card) {
    if (!card) return T('none');
    const R = global.CERules;
    if (card.kind === 'number') return T('{color} {rank}', { color: colorLabel(card.color), rank: card.rank });
    if (card.kind === 'wild' || card.kind === 'wild4') return T(R.KIND_LABEL[card.kind]);
    return T('{color} {kind}', { color: colorLabel(card.color), kind: T(R.KIND_LABEL[card.kind]) });
  }

  function clearOverlay() {
    if (overlayEl && overlayEl.parentNode) overlayEl.parentNode.removeChild(overlayEl);
    overlayEl = null;
    overlayMandatory = false;
    overlayRebuild = null;
  }
  function showOverlay(panel, mandatory, rebuild) {
    clearOverlay();
    overlayRebuild = rebuild || null;
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
      // Cloud slot first (remote wins), then the settings KV (platform value
      // wins over saved preferences).
      global.CEPlatform.loadCloud().then((remote) => {
        const S = global.CEStore;
        if (remote) {
          const rs = remote.settings && S.unwrap(remote.settings, S.SETTINGS_VERSION);
          const rp = remote.progress && S.unwrap(remote.progress, S.PROGRESS_VERSION);
          if (rs) { settings = S.loadSettings(); S.saveSettings(Object.assign(settings, rs)); }
          if (rp) { progress = S.loadProgress(); S.saveProgress(Object.assign(progress, rp)); }
        }
        return global.CEPlatform.getSettings();
      }).then((kv) => {
        if (kv && Object.keys(kv).length) {
          settings = global.CEStore.mergeDeep(global.CEStore.loadSettings(), kv);
          global.CEStore.saveSettings(settings);
        }
        applySettings();
      }).catch(() => {});
    }
    // Save conflict: merge the newer cloud progress into this device's and
    // save the merge (CEStore.mergeProgress keeps the better of both).
    global.CEPlatform.onConflict((remote) => {
      const S = global.CEStore;
      const rp = remote && remote.progress && S.unwrap(remote.progress, S.PROGRESS_VERSION);
      if (rp) progress = S.mergeProgress(progress, rp);
      S.saveProgress(progress);
      if (screenRender && screenRender !== renderGame && !session) screenRender();
    });
    global.CEPlatform.loadBindings().catch(() => {});
    global.CEPlatform.onAuth((a) => {
      if (a.signedIn) return;
      toast(PT.signedOut);
      if (doc().querySelector('.ce-menu-inner')) titleScreen();
    });

    const canvas = doc().getElementById('ce-canvas');
    try {
      global.CERender.setGraphics(settings.graphics.gfx || {});
      global.CERender.setReducedMotion(!!settings.graphics.reducedMotion);
      global.CERender.init(canvas);
      global.CERender.applyTheme(currentTheme());
      global.CERender.start();
    } catch (e) {
      const ui = doc().getElementById('ce-ui');
      ui.className = 'ce-screen ce-boot';
      ui.innerHTML = '';
      const p = el('p', null, T('Color Eights needs WebGL, which is unavailable in this browser. Your settings and progress are preserved.'));
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
    global.CERender.setReducedMotion(!!settings.graphics.reducedMotion);
    // Re-apply graphics only when they differ (e.g. a cloud save arrived).
    const gfx = settings.graphics.gfx || {};
    if (JSON.stringify(gfx) !== JSON.stringify(global.CERender.getGraphics())) global.CERender.setGraphics(gfx);
  }

  /* ---------------- title / menus ---------------- */
  function titleScreen() {
    screenRender = titleScreen;
    teardownSession();
    global.CERender.applyTheme(global.CEContent.THEMES[global.CEContent.DEFAULT_THEME]);
    global.CERender.syncState(null);
    global.CEUI.setScreen('ce-menu');
    global.CEUI.clear();

    const wrap = el('div', 'ce-menu-inner');
    wrap.appendChild(artImage('assets/key-art.webp', 'ce-key-art'));
    wrap.appendChild(el('h1', 'ce-title-big', 'Color Eights'));
    wrap.appendChild(el('p', 'ce-tagline', T('Match the discard by color or rank. Empty your hand first.')));
    wrap.appendChild(accountLine());

    const snap = resumeSnapshot();
    if (snap) wrap.appendChild(btn(T('Resume round'), 'ce-btn-primary', () => resumeFrom(snap)));

    wrap.appendChild(btn(T('Practice'), 'ce-btn-primary', practiceSetupScreen));
    wrap.appendChild(btn(T('Journey'), null, journeyScreen));
    wrap.appendChild(btn(T('Daily Challenge'), null, startDaily));
    wrap.appendChild(btn(T('Challenges'), null, challengesScreen));
    wrap.appendChild(btn(T('Learn'), null, learnScreen));
    wrap.appendChild(btn(T('Settings'), null, openSettings));
    const P = global.CEPlatform;
    if (P.hosted) {
      const inv = btn(PT.invite, null, () => {
        P.copyInvite().then((ok) => { const m = ok ? PT.inviteCopied : PT.inviteFailed; toast(m); announce(m); });
      });
      inv.id = 'ce-invite';
      wrap.appendChild(inv);
    }
    if (P.canSignIn()) {
      const sib = btn(PT.signIn, 'ce-btn-primary', () => P.signIn());
      sib.id = 'ce-signin';
      wrap.appendChild(sib);
    }

    global.CEUI.append(wrap);
    const first = wrap.querySelector('button');
    if (first) first.focus();
    announce(T('Color Eights main menu'));
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
      node.textContent = T('Offline — progress is stored on this device.');
      return;
    }
    const name = P.profile ? P.profile.name : '…';
    const syncTxt = P.sync === 'synced' ? T('progress synced')
      : P.sync === 'saving' ? T('saving…')
      : T('cloud sync unavailable');
    node.textContent = T('Playing as {name} · {sync}', { name, sync: syncTxt });
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
    screenRender = practiceSetupScreen;
    global.CEUI.setScreen('ce-menu');
    global.CEUI.clear();
    const wrap = el('div', 'ce-menu-inner');
    wrap.appendChild(el('h1', null, T('Practice')));
    wrap.appendChild(el('p', 'ce-tagline', T('Unranked. Optional undo assist.')));

    const playersSel = selectField(wrap, T('Players'), [['2', '2'], ['3', '3'], ['4', '4']], practicePrefs.players);
    const levelSel = selectField(wrap, T('Opponent skill'), [['easy', T('easy')], ['medium', T('medium')], ['hard', T('hard')]], practicePrefs.level);
    const stackingChk = checkField(wrap, T('Stacking (Draw cards stack)'), settings.rulesOptions.stacking);
    const dtmChk = checkField(wrap, T('Draw-to-match (draw up to 3)'), settings.rulesOptions.drawToMatch);
    const undoChk = checkField(wrap, T('Undo assist'), practicePrefs.undo);
    // Remember the choices so a language change re-renders without resetting them.
    playersSel.addEventListener('change', () => { practicePrefs.players = playersSel.value; });
    levelSel.addEventListener('change', () => { practicePrefs.level = levelSel.value; });
    undoChk.addEventListener('change', () => { practicePrefs.undo = undoChk.checked; });
    stackingChk.addEventListener('change', () => { settings.rulesOptions.stacking = stackingChk.checked; });
    dtmChk.addEventListener('change', () => { settings.rulesOptions.drawToMatch = dtmChk.checked; });

    wrap.appendChild(btn(T('Start round'), 'ce-btn-primary', () => {
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
    wrap.appendChild(btn(T('Back'), null, titleScreen));
    global.CEUI.append(wrap);
  }

  // options: [[value, label], …]
  function selectField(parent, label, options, dflt) {
    const row = el('label', 'ce-field');
    row.appendChild(el('span', 'ce-settings-label', label));
    const sel = el('select');
    for (const [value, text] of options) {
      const opt = el('option', null, text);
      opt.value = value;
      if (value === dflt) opt.selected = true;
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
    screenRender = journeyScreen;
    global.CEUI.setScreen('ce-menu');
    global.CEUI.clear();
    const wrap = el('div', 'ce-menu-inner ce-wide');
    wrap.appendChild(el('h1', null, T('Journey')));
    wrap.appendChild(el('p', 'ce-tagline', T('Forty stages. New mechanics arrive one at a time.')));
    const grid = el('div', 'ce-journey-grid');
    for (const st of global.CEContent.JOURNEY) {
      const rec = progress.journey[st.id];
      const mark = rec && rec.goalMet ? ' ✓' : '';
      const b = btn(st.index + '. ' + T(st.name) + mark, 'ce-stage-btn' + (st.mastery ? ' ce-mastery' : ''), () => stageIntro(st));
      grid.appendChild(b);
    }
    wrap.appendChild(grid);
    wrap.appendChild(btn(T('Back'), null, titleScreen));
    global.CEUI.append(wrap);
  }

  function goalText(g) {
    if (!g || g.type === 'win') return T('Goal: win the round.');
    if (g.type === 'win-turns') return T('Goal: win in at most {n} of your turns.', { n: g.turns });
    if (g.type === 'win-no-draw') return T('Goal: win without drawing a card.');
    if (g.type === 'score-min') return T('Goal: win with a score of at least {n}.', { n: g.points });
    return T('Goal: win the round.');
  }

  const LEVEL_OPPONENTS = { easy: N('{n} players · easy opponents'), medium: N('{n} players · medium opponents'), hard: N('{n} players · hard opponents') };
  function stagePanel(st) {
    const panel = el('div', 'ce-panel');
    panel.appendChild(el('h2', null, st.index + '. ' + T(st.name)));
    if (st.intro) panel.appendChild(el('p', null, T(st.intro)));
    panel.appendChild(el('p', null, goalText(st.goal)));
    panel.appendChild(el('p', null, T(LEVEL_OPPONENTS[st.aiLevel || 'easy'] || LEVEL_OPPONENTS.easy, { n: st.playerCount }) + (st.stacking ? ' · ' + T('stacking') : '')));
    panel.appendChild(btn(T('Play'), 'ce-btn-primary', () => {
      clearOverlay();
      startJourneyStage(st);
    }));
    panel.appendChild(btn(T('Cancel'), null, clearOverlay));
    return panel;
  }
  function stageIntro(st) {
    showOverlay(stagePanel(st), false, () => stagePanel(st));
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
    screenRender = challengesScreen;
    global.CEUI.setScreen('ce-menu');
    global.CEUI.clear();
    const wrap = el('div', 'ce-menu-inner');
    wrap.appendChild(el('h1', null, T('Challenges')));
    for (const ch of global.CEContent.CHALLENGES) {
      const rec = progress.challenges[ch.id];
      const row = el('div', 'ce-challenge-row');
      const b = btn(T(ch.name) + (rec && rec.completed ? ' ✓' : ''), 'ce-btn-primary', () => startChallenge(ch));
      row.appendChild(b);
      row.appendChild(el('p', 'ce-challenge-desc', T(ch.desc) + ' (' + T(ch.goalLabel) + ')'));
      wrap.appendChild(row);
    }
    wrap.appendChild(btn(T('Back'), null, titleScreen));
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
    screenRender = learnScreen;
    global.CEUI.setScreen('ce-menu');
    global.CEUI.clear();
    const wrap = el('div', 'ce-menu-inner');
    wrap.appendChild(el('h1', null, T('Learn')));
    wrap.appendChild(el('p', 'ce-tagline', T('Interactive lessons: one rule at a time.')));
    for (const ls of global.CEContent.LESSONS) {
      const done = progress.tutorials[ls.id];
      wrap.appendChild(btn(T(ls.title) + (done ? ' ✓' : ''), 'ce-lesson-btn', () => startLesson(ls)));
    }
    wrap.appendChild(btn(T('Back'), null, titleScreen));
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
    announce(T(ls.title) + '. ' + T(ls.text));
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
    const build = () => {
      const panel = el('div', 'ce-panel');
      panel.appendChild(el('h2', null, T('Lesson complete')));
      panel.appendChild(el('p', null, T('{title} — well done.', { title: T(ls.title) })));
      const next = global.CEContent.LESSONS[global.CEContent.LESSONS.indexOf(ls) + 1];
      if (next) panel.appendChild(btn(T('Next lesson'), 'ce-btn-primary', () => { clearOverlay(); startLesson(next); }));
      panel.appendChild(btn(T('Back to lessons'), null, () => { clearOverlay(); learnScreen(); }));
      return panel;
    };
    showOverlay(build(), false, build);
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
    if (p && !p.isAI) return T('You');
    return p ? p.name : id;
  }

  function onEvents(events) {
    for (const ev of events) {
      switch (ev.ev) {
        case 'cardPlayed': {
          const c = ev.card;
          sfx(c.kind === 'number' ? 'card' : 'action');
          announce(T('{name} played {card}', { name: playerName(ev.player), card: cardLabel(c) }));
          break;
        }
        case 'drew':
          sfx('draw');
          announce(T(ev.count > 1 ? '{name} drew {n} cards' : '{name} drew {n} card', { name: playerName(ev.player), n: ev.count }));
          break;
        case 'penaltyTaken':
          sfx('penalty');
          announce(T('{name} took the {n}-card penalty', { name: playerName(ev.player), n: ev.amount }));
          break;
        case 'skipped': announce(T('{name} was skipped', { name: playerName(ev.player) })); break;
        case 'reversed': sfx('action'); announce(T('Direction of play reversed')); break;
        case 'colorChosen':
          announce(T('Color is now {color}', { color: colorLabel(ev.color) }));
          if (mode === 'learn' && lessonAwaiting === 'chooseColor' && ev.player === 'p0') completeLesson(modeCtx.lesson);
          break;
        case 'awaitColorChoice':
          if (ev.player === session.humanId) renderGame(); // chooser appears
          break;
        case 'oneCardLeft': sfx('onecard'); announce(T('{name} has one card left', { name: playerName(ev.player) })); break;
        case 'turnTimeout': announce(T('{name} ran out of time and drew', { name: playerName(ev.player) })); break;
        case 'moveLimitHit': announce(T('Move limit reached')); break;
        case 'invalidAction':
          if (ev.player === session.humanId) { sfx('invalid'); announce(T('That move is not legal: {reason}', { reason: reasonText(ev.reason) })); }
          break;
        case 'undone': sfx('undo'); announce(T('Move undone')); break;
        case 'turnPassed':
          if (ev.next === session.humanId && !session.finished) sfx('turn');
          break;
        case 'roundEnd': sfx(ev.winner === session.humanId ? 'win' : 'lose'); break;
      }
    }
  }

  function reasonText(reason) {
    const map = {
      'not-your-turn': N('wait for your turn'),
      'no-color-or-rank-match': N('match the discard color or rank'),
      'must-draw-penalty': N('you must draw the penalty cards'),
      'stacking-requires-draw-card': N('stack a Draw card or take the penalty'),
      'card-not-in-hand': N('that card is not in your hand'),
      'round-finished': N('the round is over'),
    };
    return map[reason] ? T(map[reason]) : reason;
  }

  /* ---------------- game screen ---------------- */
  function gameScreen() {
    screenRender = renderGame;
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
    const titles = { practice: N('Practice'), journey: N('Journey'), daily: N('Daily'), challenge: N('Challenge'), learn: N('Learn') };
    let titleText = titles[mode] ? T(titles[mode]) : 'Color Eights';
    if (mode === 'journey' && modeCtx) titleText = modeCtx.stage.index + '. ' + T(modeCtx.stage.name);
    if (mode === 'challenge' && modeCtx) titleText = T(modeCtx.challenge.name);
    if (mode === 'learn' && modeCtx) titleText = T(modeCtx.lesson.title);
    header.appendChild(el('div', 'ce-title', titleText));
    const right = el('div', 'ce-header-right');
    right.appendChild(btn(T('Pause'), null, pauseOverlay));
    header.appendChild(right);
    screen.appendChild(header);

    const main = el('main', 'ce-main');

    // lesson banner
    if (mode === 'learn' && modeCtx) {
      const banner = el('p', 'ce-lesson-banner', T(modeCtx.lesson.text));
      main.appendChild(banner);
    }

    // turn + color status
    const info = el('div', 'ce-table-info');
    const humanTurn = session.isHumanTurn();
    const cur = st.players[st.currentPlayer];
    let turnText;
    if (st.pendingColorChoice) {
      turnText = st.pendingColorChoice.player === 0 ? T('Choose a color') : T('{name} is choosing a color', { name: playerName(st.players[st.pendingColorChoice.player].id) });
    } else {
      turnText = humanTurn ? T('Your turn') : T('{name} is thinking…', { name: playerName(cur.id) });
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
    chip.appendChild(el('span', null, colorLabel(st.currentColor) + (st.pendingDraw > 0 ? ' · ' + T('draw {n} pending', { n: st.pendingDraw }) : '')));
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
    const drawBtn = btn(T('Draw ({n})', { n: st.drawPile.length }), 'ce-draw-pile', () => tryDraw());
    drawBtn.disabled = !canDraw;
    drawBtn.setAttribute('aria-label', T('Draw from the pile, {n} cards left', { n: st.drawPile.length }));
    table.appendChild(drawBtn);
    const top = R.topDiscard(st);
    const topEl = el('div', 'ce-discard-top', top ? cardGlyph(top) + ' ' + cardLabel(top) : '');
    topEl.style.backgroundColor = top ? cardHex(top) : '#444';
    topEl.setAttribute('role', 'img');
    topEl.setAttribute('aria-label', T('Top of discard: {card}', { card: top ? cardLabel(top) : T('none') }));
    table.appendChild(topEl);
    main.appendChild(table);

    // hand
    const hand = el('div', 'ce-hand');
    hand.setAttribute('role', 'group');
    hand.setAttribute('aria-label', T('Your hand'));
    const me = st.players[0];
    const playable = new Set(la.ok ? la.actions.filter(a => a.type === 'play').map(a => a.cardId) : []);
    for (const card of me.hand) {
      const label = cardGlyph(card) + ' ' + cardLabel(card);
      const b = btn(label, 'ce-card-btn' + (playable.has(card.id) ? ' ce-playable' : ''), () => tryPlay(card.id));
      b.style.backgroundColor = cardHex(card);
      b.disabled = !playable.has(card.id);
      let aria = cardLabel(card);
      if (!playable.has(card.id)) {
        const why = R.explainInvalid(st, session.humanId, card.id);
        if (why) aria += ' — ' + T('not playable: {reason}', { reason: reasonText(why) });
      }
      b.setAttribute('aria-label', aria);
      b.dataset.cardId = card.id;
      hand.appendChild(b);
    }
    main.appendChild(hand);

    // action row
    const actions = el('div', 'ce-action-row');
    if (st.config.assists && st.config.assists.hint) {
      actions.appendChild(btn(mode === 'learn' ? T('Hint') : T('Hint') + ' (H)', null, showHint));
    }
    if (session.canUndo()) actions.appendChild(btn(T('Undo') + ' (U)', null, doUndo));
    if (mode === 'learn' && modeCtx) {
      actions.appendChild(btn(T('Restart lesson'), null, () => startLesson(modeCtx.lesson)));
    }
    main.appendChild(actions);

    screen.appendChild(main);

    // pending color choice for the human
    if (st.pendingColorChoice && st.players[st.pendingColorChoice.player].id === session.humanId) {
      showColorChooser();
    }
  }

  function showColorChooser() {
    const panel = colorPanel();
    showOverlay(panel, true, colorPanel);
  }
  function colorPanel() {
    const panel = el('div', 'ce-panel ce-color-panel');
    panel.appendChild(el('h2', null, T('Choose a color')));
    const row = el('div', 'ce-color-row');
    for (const c of global.CERules.COLORS) {
      const b = btn(SHAPE_GLYPH[global.CERules.COLOR_INFO[c].shape] + ' ' + colorLabel(c), 'ce-color-btn', () => {
        clearOverlay();
        dispatchHuman({ type: 'chooseColor', color: c });
      });
      b.style.backgroundColor = palette()[c];
      row.appendChild(b);
    }
    panel.appendChild(row);
    return panel;
  }

  function dispatchHuman(command) {
    if (!session || session.finished) return;
    command.player = session.humanId;
    if (!lessonAllows(command, command.cardId && session.state.players[0].hand.find(c => c.id === command.cardId))) {
      announce(T(modeCtx.lesson.hintText));
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
    if (mode === 'learn' && modeCtx) { sfx('hint'); announce(T(modeCtx.lesson.hintText)); return; }
    const h = session.hint();
    if (!h.ok) { announce(T('No hint available right now')); return; }
    sfx('hint');
    if (h.action.type === 'play') {
      announce(T('Hint: play {card}', { card: cardLabel(session.state.players[0].hand.find(c => c.id === h.action.cardId)) }));
      const elBtn = doc().querySelector('[data-card-id="' + h.action.cardId + '"]');
      if (elBtn) {
        elBtn.classList.add('ce-hinted');
        setTimeout(() => elBtn.classList.remove('ce-hinted'), 1600);
      }
    } else if (h.action.type === 'draw') {
      announce(T('Hint: draw a card'));
    } else {
      announce(T('Hint: choose your strongest color'));
    }
  }

  function doUndo() {
    if (!session) return;
    const r = session.undo();
    if (!r.ok) announce(T('Cannot undo: {reason}', { reason: reasonText(r.reason) }));
  }

  /* ---------------- pause / settings ---------------- */
  function pauseOverlay() {
    if (!session) return;
    session.pause();
    showOverlay(pausePanel(), false, pausePanel);
  }
  function pausePanel() {
    const panel = el('div', 'ce-panel');
    panel.appendChild(el('h2', null, T('Paused')));
    panel.appendChild(btn(T('Resume'), 'ce-btn-primary', () => { clearOverlay(); session && session.resume(); }));
    panel.appendChild(btn(T('Restart round'), null, () => { clearOverlay(); restartRound(); }));
    panel.appendChild(btn(T('Settings'), null, openSettings));
    panel.appendChild(btn(T('Save & quit to menu'), null, () => {
      if (session && !session.finished) global.CEStore.saveSnapshot(session.snapshot());
      titleScreen();
    }));
    panel.appendChild(btn(T('Quit without saving'), null, () => {
      if (session && !session.finished) session.dispatch({ type: 'resign', player: session.humanId, id: 'resign-' + Date.now().toString(36) });
      titleScreen();
    }));
    return panel;
  }
  function openSettings() {
    settingsTab = 'general';
    showOverlay(settingsPanel(), false, () => settingsPanel(settingsTab));
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

  // Settings overlay: General (audio, palette, accessibility) and Graphics tabs.
  function settingsPanel(tab) {
    const panel = el('div', 'ce-panel ce-settings-panel');
    panel.appendChild(el('h2', null, T('Settings')));
    const GT = global.CEGfxUI ? global.CEGfxUI.t : (k) => k;
    const tabs = el('div', 'ce-tabs');
    tabs.setAttribute('role', 'tablist');
    const body = el('div', 'ce-tab-body');
    body.setAttribute('role', 'tabpanel');
    const tabBtns = {};
    const select = (name, focus) => {
      for (const k of Object.keys(tabBtns)) {
        tabBtns[k].setAttribute('aria-selected', k === name ? 'true' : 'false');
        tabBtns[k].classList.toggle('ce-tab-active', k === name);
      }
      body.innerHTML = '';
      body.className = 'ce-tab-body';
      body.dataset.tab = name;
      settingsTab = name;
      if (name === 'graphics' && global.CEGfxUI) {
        global.CEGfxUI.build(body, () => settings.graphics.gfx || {}, (next) => {
          settings.graphics.gfx = next;
          global.CERender.setGraphics(next);
          global.CEStore.saveSettings(settings);
        });
      } else generalSettings(body);
      if (focus) tabBtns[name].focus();
    };
    for (const [name, label] of [['general', GT('general')], ['graphics', GT('graphics')]]) {
      const b = btn(label, 'ce-tab', () => select(name, true));
      b.setAttribute('role', 'tab');
      b.dataset.settingsTab = name;
      tabBtns[name] = b;
      tabs.appendChild(b);
    }
    tabs.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      const cur = tabBtns.general.getAttribute('aria-selected') === 'true' ? 'general' : 'graphics';
      select(cur === 'general' ? 'graphics' : 'general', true);
      e.preventDefault();
    });
    panel.appendChild(tabs);
    panel.appendChild(body);
    select(tab || 'general', false);

    panel.appendChild(btn(T('Close'), 'ce-btn-primary', () => {
      clearOverlay();
      if (session && !session.finished && !doc().hidden) session.resume();
    }));
    return panel;
  }

  function generalSettings(panel) {

    const sliders = [[N('Music'), 'music'], [N('Effects'), 'effects'], [N('Ambience'), 'ambience']];
    for (const [label, bus] of sliders) {
      const row = el('label', 'ce-settings-row');
      row.appendChild(el('span', 'ce-settings-label', T(label)));
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
    muteRow.appendChild(el('span', 'ce-settings-label', T('Mute all audio')));
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
    palRow.appendChild(el('span', 'ce-settings-label', T('Color palette')));
    const pal = el('select');
    const PALETTES = { standard: N('standard'), contrast: N('contrast'), deuteranopia: N('deuteranopia'), tritanopia: N('tritanopia') };
    for (const key of Object.keys(PALETTES)) {
      const o = el('option', null, T(PALETTES[key]));
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
      [N('Reduced motion'), 'graphics', 'reducedMotion'],
      [N('High contrast'), 'accessibility', 'highContrast'],
      [N('Larger text'), 'accessibility', 'largeText'],
    ];
    for (const [label, group, key] of toggles) {
      const row = el('label', 'ce-settings-row');
      row.appendChild(el('span', 'ce-settings-label', T(label)));
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
      announce(T('Achievement unlocked: {name}', { name: ACHIEVEMENTS[key] ? T(ACHIEVEMENTS[key]) : key }));
    };
    if (humanWon) unlock('first-win');
    if (humanWon && st && st.scores && st.scores.total >= 100) unlock('century');
    if (progress.stats.winStreak >= 3) unlock('streak-3');
    if (mode === 'journey' && modeCtx && modeCtx.stage && modeCtx.stage.mastery &&
        global.CEContent.goalMet(modeCtx.stage, session.state, session.humanDraws)) unlock('journey-mastery');
    if (global.CEContent.LESSONS.every(ls => progress.tutorials[ls.id])) unlock('all-lessons');
  }

  // rerender: true when re-drawn for a language change (no re-post, no announcement).
  let lbResult = null; // null | 'posting' | { posted, rank }
  function resultsScreen(st, humanWon, journeyMet, rerender) {
    if (!session) return; // user already left
    screenRender = () => resultsScreen(st, humanWon, journeyMet, true);
    clearOverlay();
    global.CEUI.setScreen('ce-menu');
    global.CEUI.clear();
    const wrap = el('div', 'ce-menu-inner');
    wrap.appendChild(el('h1', null, humanWon ? T('You win!') : T('{name} wins', { name: playerName(st.winner) })));
    const reasonTextMap = {
      'empty-hand': N('Emptied their hand first.'),
      'resignation': N('Round ended by resignation.'),
      'move-limit': N('Move limit reached.'),
    };
    wrap.appendChild(el('p', 'ce-tagline', reasonTextMap[st.terminalReason] ? T(reasonTextMap[st.terminalReason]) : st.terminalReason));
    wrap.appendChild(artImage(humanWon ? 'assets/results-win.webp' : 'assets/results-lose.webp', 'ce-results-art'));
    if (journeyMet !== null && journeyMet !== undefined) {
      wrap.appendChild(el('p', 'ce-goal-line', journeyMet ? T('Stage goal met ✓') : T('Stage goal not met — {goal}', { goal: goalText(modeCtx.stage.goal) })));
    }

    wrap.appendChild(el('h2', null, T('Score: {n} points', { n: st.scores.total })));
    const list = el('ul', 'ce-breakdown');
    for (const b of st.scores.breakdown) {
      const p = st.players.find(pl => pl.name === b.name);
      const who = p && !p.isAI ? T('You') : b.name;
      const hand = b.cardsLeft === 1 ? T('{n} card left', { n: b.cardsLeft }) : T('{n} cards left', { n: b.cardsLeft });
      const li = el('li', null,
        who + ' — ' + hand + ', ' + T('{n} points', { n: b.handValue }) +
        (b.detail.length ? ' (' + b.detail.map(d => labelFromEnglish(d.label) + ' ' + d.value).join(', ') + ')' : ''));
      list.appendChild(li);
    }
    wrap.appendChild(list);
    if (humanWon && mode !== 'learn' && mode !== 'practice' && global.CEPlatform.hosted) {
      // StarHermit high-score board: a won round's points.
      const lb = el('p', 'ce-goal-line ce-lb-line', '');
      lb.setAttribute('aria-live', 'polite');
      wrap.appendChild(lb);
      const paint = () => {
        const r = lbResult;
        lb.textContent = !r || r === 'posting' ? PT.lbPosting : !r.posted ? PT.lbNotPosted
          : r.rank ? global.PlatformStrings.fmtPlatform(PT.lbRank, { rank: r.rank }) : PT.lbPosted;
      };
      if (!rerender) {
        lbResult = 'posting';
        global.CEPlatform.submitScore(st.scores.total).then((r) => { lbResult = r; paint(); });
      }
      paint();
    }

    wrap.appendChild(btn(T('Play again'), 'ce-btn-primary', restartRound));
    if (mode === 'journey' && modeCtx) {
      const next = global.CEContent.JOURNEY[modeCtx.stage.index]; // index is 1-based; next entry
      if (next) wrap.appendChild(btn(T('Next stage'), null, () => startJourneyStage(next)));
    }
    if (mode === 'learn' && modeCtx) {
      const next = global.CEContent.LESSONS[global.CEContent.LESSONS.indexOf(modeCtx.lesson) + 1];
      if (next) wrap.appendChild(btn(T('Next lesson'), null, () => startLesson(next)));
    }
    wrap.appendChild(btn(T('Back to menu'), null, titleScreen));
    global.CEUI.append(wrap);
    if (rerender) return;
    announce(humanWon ? T('You win.') + ' ' + T('Score {n} points.', { n: st.scores.total }) : T('{name} wins.', { name: playerName(st.winner) }) + ' ' + T('Score {n} points.', { n: st.scores.total }));
    const first = wrap.querySelector('button');
    if (first) first.focus();
  }

  /* ---------------- keyboard ---------------- */
  function onKey(e) {
    const act = global.CEPlatform.actionFor(e); // StarHermit control bindings
    if (act === 'cancel') {
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
    if (act === 'pause') pauseOverlay();
    else if (act === 'draw') tryDraw();
    else if (act === 'hint') showHint();
    else if (act === 'undo') doUndo();
  }

  // Card labels in score details are recorded in English by the rules engine
  // ("Ember 7", "Wild Draw Four"); translate them for display.
  function labelFromEnglish(label) {
    const R = global.CERules;
    for (const kind of Object.keys(R.KIND_LABEL)) if (label === R.KIND_LABEL[kind]) return T(label);
    for (const c of R.COLORS) {
      const base = R.COLOR_INFO[c].label + ' ';
      if (label.indexOf(base) === 0) {
        const rest = label.slice(base.length);
        const kind = Object.keys(R.KIND_LABEL).find(k => R.KIND_LABEL[k] === rest);
        return kind ? T('{color} {kind}', { color: colorLabel(c), kind: T(rest) }) : T('{color} {rank}', { color: colorLabel(c), rank: rest });
      }
    }
    return label;
  }

  // Game language changed (Settings → Language, or the account preference
  // arrived): rebuild the visible screen and any open dialog in the new
  // language. The session keeps running untouched (a paused round stays paused).
  function onLanguage() {
    PT = global.PlatformStrings.platformStrings(curLang());
    if (global.CEGfxUI && global.CEGfxUI.setLocale) global.CEGfxUI.setLocale(curLang());
    if (!settings || !screenRender) return;
    const rebuild = overlayRebuild, mandatory = overlayMandatory, hadOverlay = !!overlayEl;
    const keepPaused = session && !session.finished && hadOverlay;
    clearOverlay();
    screenRender();
    // renderGame re-shows the color chooser itself; otherwise reopen the dialog.
    if (hadOverlay && rebuild && !overlayEl) showOverlay(rebuild(), mandatory, rebuild);
    if (keepPaused && session) session.pause();
  }
  if (global.document) global.document.addEventListener('ce-language', onLanguage);

  global.CEApp = { boot };
  // auto-boot when loaded in a browser with the DOM ready
  if (global.document && global.document.getElementById('ce-root')) {
    if (doc().readyState === 'loading') doc().addEventListener('DOMContentLoaded', boot);
    else boot();
  }
})(typeof window !== 'undefined' ? window : globalThis);
