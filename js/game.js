/* Color Eights — game: session, state, actions, scoring, win/loss. */
(function (global) {
  'use strict';

  const R = global.CERules;
  let S = null; // current session
  let startedAt = 0;
  let lastActionId = '';

  function start(config, players) {
    S = global.CESession.createSession({ config: Object.assign({}, config), players });
    startedAt = Date.now();
    return S;
  }

  function state() { return S ? S.state : null; }
  function isHumanTurn() { return S && S.isHumanTurn(); }
  function currentColor() { const st = state(); return st ? st.currentColor : null; }
  function currentPlayerIdx() { const st = state(); return st ? st.currentPlayer : -1; }

  // legal actions for the human (p0)
  function legalActions() {
    if (!S || !state()) return [];
    const la = R.legalActions(state(), 'p0');
    return la.ok ? la.actions : [];
  }

  function canPlay(cardId) {
    const acts = legalActions();
    return acts.some(a => a.type === 'play' && a.cardId === cardId);
  }
  function mustDraw() {
    const st = state(); if (!st) return false;
    // pending penalty: only draw is allowed (no play, no stacking option here)
    return st.pendingDraw > 0;
  }

  function playCard(cardId) {
    if (!canPlay(cardId)) return { ok: false };
    S.dispatch({ type: 'play', player: 'p0', cardId });
    lastActionId = 'play:' + cardId;
    return { ok: true };
  }

  function drawCard() {
    const acts = legalActions();
    if (!acts.some(a => a.type === 'draw')) return { ok: false };
    S.dispatch({ type: 'draw', player: 'p0' });
    lastActionId = 'draw';
    return { ok: true };
  }

  function chooseColor(color) {
    if (!S || !state()) return;
    const la = R.legalActions(state(), 'p0');
    if (!(la.ok && la.actions.some(a => a.type === 'chooseColor'))) return;
    S.dispatch({ type: 'chooseColor', player: 'p0', color });
    lastActionId = 'color:' + color;
  }

  function isFinished() { const st = state(); return !!st && st.phase === 'finished'; }
  function winnerName() { const st = state(); if (!st || !st.winner) return null; return R.cardLabel ? '' : ''; }

  // score: sum of remaining hand values (winner has none)
  function totalScore() { const st = state(); if (!st || !st.scores) return 0; return st.scores.total; }

  global.CEGame = {
    start, state, isHumanTurn, currentColor, currentPlayerIdx,
    legalActions, canPlay, mustDraw, playCard, drawCard, chooseColor,
    isFinished, winnerName, totalScore, lastActionId: () => lastActionId,
  };
})(typeof window !== 'undefined' ? window : globalThis);
