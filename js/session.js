/* Color Eights — session layer: command dispatch with idempotent action IDs,
 * AI scheduling, undo, turn timers, replay recording, snapshots.
 * UI-agnostic; timing injectable for tests. No rules mutation outside applyCommand. */
(function (global) {
  'use strict';
  const R = global.CERules;

  let cmdCounter = 0;
  function nextCommandId(prefix) {
    cmdCounter = (cmdCounter + 1) % 0xffff;
    return (prefix || 'cmd') + '-' + Date.now().toString(36) + '-' + cmdCounter.toString(36);
  }

  function createSession(opts) {
    const R0 = global.CERules;
    const humanId = opts.humanId || 'p0';
    const players = opts.players || R0.defaultPlayers(opts.config.playerCount);
    let state = opts.restoreState ? R0.deserialize(opts.restoreState) : R0.createGame(opts.config, players);
    const session = {
      id: opts.sessionId || ('s-' + Math.random().toString(36).slice(2, 10)),
      mode: opts.mode || 'practice',
      humanId,
      state,
      replay: opts.restoreState ? null : R0.replayCreate(state),
      appliedCommandIds: new Set(),
      undoStack: [],           // serialized snapshots before each human command
      maxUndo: 32,
      humanDraws: 0,           // for journey "win-no-draw" goals
      listeners: { events: [], state: [], error: [] },
      aiDelayMs: opts.aiDelayMs != null ? opts.aiDelayMs : 750,
      scheduler: opts.scheduler || ((fn, ms) => setTimeout(fn, ms)),
      canceler: opts.canceler || ((h) => clearTimeout(h)),
      turnTimer: null,
      turnDeadline: 0,
      finished: state.phase === 'finished',
    };
    if (opts.restoreState) session.finished = state.phase === 'finished';

    function emit(type, payload) {
      for (const fn of session.listeners[type]) {
        try { fn(payload); } catch (e) { /* listener faults never corrupt the session */ }
      }
    }
    function on(type, fn) { session.listeners[type].push(fn); return session; }

    // dispatch a command; returns { ok, events?, reason? }
    function dispatch(command) {
      if (session.finished) return { ok: false, reason: 'round-finished' };
      if (!command.id) command.id = nextCommandId(session.mode);
      if (session.appliedCommandIds.has(command.id)) {
        return { ok: true, duplicate: true, events: [] }; // idempotent dedupe
      }
      const isHuman = command.player === humanId;
      const snapshot = isHuman ? R0.serialize(state) : null;
      const res = R0.applyCommand(state, command);
      if (res.error) {
        emit('error', { reason: res.reason, command });
        emit('events', [{ ev: 'invalidAction', player: command.player, reason: res.reason }]);
        return { ok: false, reason: res.reason };
      }
      session.appliedCommandIds.add(command.id);
      if (session.appliedCommandIds.size > 512) {
        // bound memory; ids are unique per session so old ones are safe to drop
        const it = session.appliedCommandIds.values();
        for (let i = 0; i < 256; i++) session.appliedCommandIds.delete(it.next().value);
      }
      if (snapshot) {
        session.undoStack.push(snapshot);
        if (session.undoStack.length > session.maxUndo) session.undoStack.shift();
      }
      if (isHuman && command.type === 'draw') session.humanDraws++;
      state = res.state;
      session.state = state;
      if (session.replay) {
        session.replay.commands.push(command);
        R0.replayAppend(session.replay, state);
      }
      if (state.phase === 'finished') {
        session.finished = true;
        stopTurnTimer();
      }
      emit('events', res.events);
      emit('state', state);
      scheduleAI();
      armTurnTimer();
      return { ok: true, events: res.events };
    }

    function undo() {
      // undo where rules permit: practice/assisted solo only, before round end
      if (session.finished) return { ok: false, reason: 'round-finished' };
      if (!state.config.assists || !state.config.assists.undo) return { ok: false, reason: 'undo-not-permitted' };
      if (!session.undoStack.length) return { ok: false, reason: 'nothing-to-undo' };
      const snap = session.undoStack.pop();
      state = R0.deserialize(snap);
      // roll back any AI replies that happened after the human move? Undo restores the
      // pre-human-command snapshot, so the human simply re-decides. humanDraws is best-effort.
      session.state = state;
      session.replay = null; // undo invalidates the authoritative replay
      emit('events', [{ ev: 'undone', player: humanId }]);
      emit('state', state);
      scheduleAI();
      armTurnTimer();
      return { ok: true };
    }
    function canUndo() {
      return !session.finished && state.config.assists && state.config.assists.undo && session.undoStack.length > 0;
    }

    function hint() {
      const la = R0.legalActions(state, humanId);
      if (!la.ok) return { ok: false, reason: la.reason };
      // hint calls the same legal-action API used by play
      const plays = la.actions.filter(a => a.type === 'play');
      if (plays.length) {
        const pl = state.players.find(p => p.id === humanId);
        let best = plays[0], bv = -1;
        for (const a of plays) {
          const c = pl.hand.find(x => x.id === a.cardId);
          const v = R0.cardValue(c) + (c.color === state.currentColor ? 2 : 0);
          if (v > bv) { bv = v; best = a; }
        }
        return { ok: true, action: best };
      }
      return { ok: true, action: la.actions.find(a => a.type === 'draw') || la.actions[0] };
    }

    /* ----- AI scheduling ----- */
    let aiHandle = null;
    function scheduleAI() {
      if (session.finished) return;
      if (aiHandle != null) { session.canceler(aiHandle); aiHandle = null; }
      if (state.pendingColorChoice) {
        const pl = state.players[state.pendingColorChoice.player];
        if (pl && pl.isAI) {
          aiHandle = session.scheduler(() => {
            aiHandle = null;
            dispatch({ type: 'chooseColor', player: pl.id, color: R0.bestColorFor(pl) });
          }, session.aiDelayMs);
        }
        return;
      }
      const cur = state.players[state.currentPlayer];
      if (cur && cur.isAI && cur.connected) {
        aiHandle = session.scheduler(() => {
          aiHandle = null;
          const cmd = R0.aiChoose(state, cur.id, cur.aiLevel);
          if (cmd) { cmd.player = cur.id; dispatch(cmd); }
        }, session.aiDelayMs + (cur.aiLevel === 'hard' ? 250 : 0));
      }
    }

    /* ----- turn timer (challenge / speed) ----- */
    let timerHandle = null;
    function armTurnTimer() {
      stopTurnTimer();
      const secs = state.config.turnTimerSec;
      if (!secs || session.finished) return;
      const cur = state.players[state.currentPlayer];
      if (!cur || cur.isAI) return;
      session.turnDeadline = nowMs() + secs * 1000;
      timerHandle = session.scheduler(() => {
        timerHandle = null;
        // hesitation draws a card (or absorbs the penalty)
        emit('events', [{ ev: 'turnTimeout', player: cur.id }]);
        dispatch({ type: 'draw', player: cur.id });
      }, secs * 1000);
    }
    function stopTurnTimer() {
      if (timerHandle != null) { session.canceler(timerHandle); timerHandle = null; }
      session.turnDeadline = 0;
    }
    function nowMs() { return (opts.clock || Date.now)(); }
    function turnTimeLeft() {
      if (!session.turnDeadline) return 0;
      return Math.max(0, (session.turnDeadline - nowMs()) / 1000);
    }

    function snapshot() {
      return {
        sessionId: session.id, mode: session.mode, humanId,
        state: R0.serialize(state),
        humanDraws: session.humanDraws,
        replay: session.replay,
        savedAt: nowMs(),
      };
    }

    session.on = on;
    session.dispatch = dispatch;
    session.undo = undo;
    session.canUndo = canUndo;
    session.hint = hint;
    session.turnTimeLeft = turnTimeLeft;
    session.snapshot = snapshot;
    session.stopTurnTimer = stopTurnTimer;
    session.scheduleAI = scheduleAI;
    session.isHumanTurn = function () {
      if (state.pendingColorChoice) return state.players[state.pendingColorChoice.player].id === humanId;
      return state.phase === 'active' && state.players[state.currentPlayer].id === humanId;
    };
    return session;
  }

  global.CESession = { createSession, nextCommandId };
})(typeof window !== 'undefined' ? window : globalThis);
