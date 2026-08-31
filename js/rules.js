/* Color Eights — deterministic rules engine.
 * Pure, serializable, no DOM, no Date, no Math.random.
 * Universal: attaches to globalThis.CERules (browser <script>, Node require, sandbox). */
(function (global) {
  'use strict';

  const RULES_VERSION = 3;
  const COLORS = ['ember', 'tide', 'leaf', 'sol'];
  const COLOR_INFO = {
    ember: { label: 'Ember', hex: '#e1483c', shape: 'diamond' },
    tide:  { label: 'Tide',  hex: '#2f7fe0', shape: 'wave' },
    leaf:  { label: 'Leaf',  hex: '#37a24a', shape: 'leaf' },
    sol:   { label: 'Sol',   hex: '#e8b32a', shape: 'sun' },
  };
  const ACTION_KINDS = ['skip', 'reverse', 'draw2', 'wild', 'wild4'];
  const KIND_LABEL = {
    number: 'Number', skip: 'Skip', reverse: 'Reverse',
    draw2: 'Draw Two', wild: 'Wild', wild4: 'Wild Draw Four',
  };
  const SCORE_VALUES = { skip: 20, reverse: 20, draw2: 20, wild: 50, wild4: 50 };

  /* ---------------- seeded RNG (mulberry32) ---------------- */
  function hashSeed(str) {
    // FNV-1a 32-bit
    let h = 0x811c9dc5 >>> 0;
    const s = String(str);
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h >>> 0;
  }
  function rngCreate(streamKey) {
    return { state: hashSeed(streamKey) || 0x9e3779b9 };
  }
  function rngNext(rng) {
    // returns float in [0,1); mutates rng.state
    let t = (rng.state = (rng.state + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function rngInt(rng, n) { return Math.floor(rngNext(rng) * n); }
  function rngPick(rng, arr) { return arr[rngInt(rng, arr.length)]; }

  /* Stable JSON for hashing */
  function stableStringify(v) {
    if (v === null || typeof v !== 'object') return JSON.stringify(v);
    if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']';
    const keys = Object.keys(v).sort();
    return '{' + keys.map(k => JSON.stringify(k) + ':' + stableStringify(v[k])).join(',') + '}';
  }
  function stateHash(obj) {
    const s = stableStringify(obj);
    let h = 0x811c9dc5 >>> 0;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return ('00000000' + h.toString(16)).slice(-8);
  }
  // Canonical game-state hash: normalizes away transient fields before hashing.
  function hashState(state) { return stateHash(cloneState(state)); }

  /* ---------------- deck ---------------- */
  function buildDeck() {
    const deck = [];
    let n = 0;
    for (const color of COLORS) {
      for (let copy = 0; copy < 2; copy++) {
        for (let rank = 1; rank <= 9; rank++) deck.push({ id: 'c' + (n++), kind: 'number', color, rank });
        for (const kind of ['skip', 'reverse', 'draw2']) deck.push({ id: 'c' + (n++), kind, color, rank: null });
      }
    }
    for (let i = 0; i < 4; i++) deck.push({ id: 'c' + (n++), kind: 'wild', color: null, rank: null });
    for (let i = 0; i < 4; i++) deck.push({ id: 'c' + (n++), kind: 'wild4', color: null, rank: null });
    return deck; // 104 cards
  }
  function shuffle(deck, rng) {
    for (let i = deck.length - 1; i > 0; i--) {
      const j = rngInt(rng, i + 1);
      const t = deck[i]; deck[i] = deck[j]; deck[j] = t;
    }
    return deck;
  }

  function cardLabel(card) {
    if (!card) return 'none';
    if (card.kind === 'number') return COLOR_INFO[card.color].label + ' ' + card.rank;
    if (card.kind === 'wild' || card.kind === 'wild4') return KIND_LABEL[card.kind];
    return COLOR_INFO[card.color].label + ' ' + KIND_LABEL[card.kind];
  }
  function cardValue(card) {
    if (card.kind === 'number') return card.rank;
    return SCORE_VALUES[card.kind] || 0;
  }
  function handValue(hand) { return hand.reduce((s, c) => s + cardValue(c), 0); }

  /* ---------------- config ---------------- */
  function normalizeConfig(cfg) {
    cfg = cfg || {};
    const playerCount = clampInt(cfg.playerCount, 2, 4, 2);
    return {
      playerCount,
      stacking: !!cfg.stacking,                 // room option: draw2/draw4 may stack
      handSize: clampInt(cfg.handSize, 1, 10, 7),
      drawToMatch: !!cfg.drawToMatch,           // keep drawing until a playable card appears (max 3)
      moveLimit: cfg.moveLimit ? clampInt(cfg.moveLimit, 1, 500, 50) : 0,   // challenge: total own turns
      turnTimerSec: cfg.turnTimerSec ? clampInt(cfg.turnTimerSec, 3, 120, 15) : 0,
      allowedKinds: Array.isArray(cfg.allowedKinds) && cfg.allowedKinds.length
        ? cfg.allowedKinds.filter(k => k === 'number' || ACTION_KINDS.includes(k)) : null,
      palette: Array.isArray(cfg.palette) && cfg.palette.length >= 1
        ? cfg.palette.filter(c => COLORS.includes(c)) : COLORS.slice(),
      seed: String(cfg.seed == null ? 'default' : cfg.seed),
      contentId: cfg.contentId ? String(cfg.contentId) : null,
      contentVersion: cfg.contentVersion || 1,
      assists: cfg.assists ? { hint: !!cfg.assists.hint, undo: !!cfg.assists.undo } : { hint: false, undo: false },
    };
  }
  function clampInt(v, lo, hi, dflt) {
    v = Math.floor(Number(v));
    if (!Number.isFinite(v)) return dflt;
    return Math.max(lo, Math.min(hi, v));
  }

  /* ---------------- state creation ---------------- */
  function createGame(config, playerSpecs) {
    const cfg = normalizeConfig(config);
    const rng = rngCreate('rules:' + cfg.seed);
    const decor = rngCreate('decor:' + cfg.seed); // reserved stream; cosmetic only
    let deck = buildDeck();
    if (cfg.allowedKinds) deck = deck.filter(c => c.kind === 'number' || cfg.allowedKinds.includes(c.kind));
    if (cfg.palette.length < COLORS.length) {
      deck = deck.filter(c => c.color === null || cfg.palette.includes(c.color));
    }
    shuffle(deck, rng);

    const specs = (playerSpecs && playerSpecs.length ? playerSpecs : defaultPlayers(cfg.playerCount))
      .slice(0, cfg.playerCount);
    while (specs.length < cfg.playerCount) specs.push(defaultPlayers(cfg.playerCount)[specs.length]);
    const players = specs.map((p, i) => ({
      id: p.id || ('p' + i),
      name: p.name || ('Player ' + (i + 1)),
      isAI: !!p.isAI,
      aiLevel: p.aiLevel || 'medium',
      connected: p.connected !== false,
      hand: [],
    }));

    const handSize = Math.min(cfg.handSize, Math.floor((deck.length - 2) / players.length));
    for (let r = 0; r < handSize; r++) {
      for (const pl of players) pl.hand.push(deck.pop());
    }
    // first discard: never a wild4; reshuffle it back in
    let first = deck.pop();
    let guard = 0;
    while (first.kind === 'wild4' && guard++ < 20) { deck.unshift(first); shuffle(deck, rng); first = deck.pop(); }

    const state = {
      version: RULES_VERSION,
      config: cfg,
      rng,                // rules stream (serialized)
      decorStream: decor, // cosmetic stream; never affects rules outcomes
      players,
      drawPile: deck,
      discardPile: [first],
      currentColor: first.color || rngPick(rng, COLORS),
      currentPlayer: 0,
      direction: 1,
      pendingDraw: 0,
      phase: 'active',        // 'active' | 'finished'
      turnNumber: 1,          // monotonically increasing tick
      turnCount: {},          // playerId -> own completed turns (for move limits)
      invalidCounts: {},      // playerId -> invalid action attempts
      winner: null,
      terminalReason: null,
      scores: null,           // filled on finish: { breakdown, total, winner }
      stats: { cardsPlayed: 0, cardsDrawn: 0, actionsUsed: {}, elapsedTicks: 0 },
      pendingColorChoice: null,
      log: [],
    };
    for (const pl of players) { state.turnCount[pl.id] = 0; state.invalidCounts[pl.id] = 0; }
    if (first.kind === 'wild') {
      state.log.push({ t: 0, ev: 'startWild', color: state.currentColor });
    }
    return state;
  }
  function defaultPlayers(n) {
    const out = [{ id: 'p0', name: 'You', isAI: false }];
    const names = ['Vex', 'Mira', 'Tallo'];
    for (let i = 1; i < n; i++) out.push({ id: 'p' + i, name: names[i - 1], isAI: true, aiLevel: 'medium' });
    return out;
  }

  /* ---------------- legality ---------------- */
  function topDiscard(state) { return state.discardPile[state.discardPile.length - 1]; }

  function cardMatches(state, card) {
    if (card.kind === 'wild' || card.kind === 'wild4') return true;
    if (card.color === state.currentColor) return true;
    const top = topDiscard(state);
    if (top && top.kind === 'number' && card.kind === 'number' && card.rank === top.rank) return true;
    if (top && top.kind !== 'number' && card.kind === top.kind) return true; // action rank match
    return false;
  }

  // Legal actions for a player. Returns { ok, actions:[...], reason? }
  function legalActions(state, playerId) {
    if (state.phase !== 'active') return { ok: false, reason: 'round-finished', actions: [] };
    const idx = state.players.findIndex(p => p.id === playerId);
    if (idx < 0) return { ok: false, reason: 'unknown-player', actions: [] };
    if (state.pendingColorChoice) {
      if (state.pendingColorChoice.player !== idx) return { ok: false, reason: 'not-your-turn', actions: [] };
      return { ok: true, actions: COLORS.map(c => ({ type: 'chooseColor', color: c })) };
    }
    if (idx !== state.currentPlayer) return { ok: false, reason: 'not-your-turn', actions: [] };
    const hand = state.players[idx].hand;
    const actions = [];
    if (state.pendingDraw > 0) {
      if (state.config.stacking) {
        for (const card of hand) {
          const top = topDiscard(state);
          const stacks = (card.kind === 'draw2' && top.kind === 'draw2') ||
                         (card.kind === 'wild4') ||
                         (card.kind === 'draw2' && top.kind === 'wild4' && card.color === state.currentColor);
          if (stacks) actions.push(playAction(card, state));
        }
      }
      actions.push({ type: 'draw' }); // absorb the pending penalty
      return { ok: true, actions };
    }
    for (const card of hand) if (cardMatches(state, card)) actions.push(playAction(card, state));
    actions.push({ type: 'draw' });
    return { ok: true, actions };
  }
  function playAction(card, state) {
    const a = { type: 'play', cardId: card.id };
    if (card.kind === 'wild' || card.kind === 'wild4') a.needsColor = true;
    return a;
  }
  function canPlayCard(state, playerId, cardId) {
    const la = legalActions(state, playerId);
    return la.actions.some(a => a.type === 'play' && a.cardId === cardId);
  }

  // Why a specific card is not playable right now (for invalid-action explanations).
  function explainInvalid(state, playerId, cardId) {
    const base = legalActions(state, playerId);
    if (!base.ok) return base.reason;
    const pl = state.players[state.players.findIndex(p => p.id === playerId)];
    const card = pl.hand.find(c => c.id === cardId);
    if (!card) return 'card-not-in-hand';
    if (state.pendingDraw > 0) {
      if (!state.config.stacking) return 'must-draw-penalty';
      return 'stacking-requires-draw-card';
    }
    if (card.kind === 'wild' || card.kind === 'wild4') return null; // wilds always playable
    if (card.color === state.currentColor) return null;
    const top = topDiscard(state);
    if (top && top.kind === 'number' && card.kind === 'number' && card.rank === top.rank) return null;
    if (top && top.kind !== 'number' && card.kind === top.kind) return null;
    return 'no-color-or-rank-match';
  }

  /* ---------------- command application ---------------- */
  let cmdSeqGuard = 0;
  function applyCommand(state, command) {
    // Returns { state, events } or { error, reason, events: [] }. Input state is not mutated.
    if (!command || typeof command !== 'object') return { error: true, reason: 'malformed-command', events: [] };
    if (!command.id || typeof command.id !== 'string') return { error: true, reason: 'missing-command-id', events: [] };
    if (state.phase !== 'active') return { error: true, reason: 'round-finished', events: [] };
    if (++cmdSeqGuard > 100000) return { error: true, reason: 'internal-guard', events: [] };

    const next = cloneState(state);
    const pid = command.player;
    const idx = next.players.findIndex(p => p.id === pid);
    const la = legalActions(state, pid); // legality judged on the pristine state
    if (!la.ok) {
      if (idx >= 0) noteInvalid(next, idx, la.reason);
      return { error: true, reason: la.reason, events: [], state: next };
    }
    const events = [];
    try {
      switch (command.type) {
        case 'play': doPlay(next, idx, command, la, events); break;
        case 'draw': doDraw(next, idx, la, events); break;
        case 'chooseColor': doChooseColor(next, idx, command, la, events); break;
        case 'resign': doResign(next, idx, events); break;
        default:
          noteInvalid(next, idx, 'unknown-command-type');
          return { error: true, reason: 'unknown-command-type', events: [], state: next };
      }
    } catch (e) {
      noteInvalid(next, idx, e.message || 'illegal');
      return { error: true, reason: e.message || 'illegal', events: [], state: next };
    }
    next.turnNumber++;
    next.stats.elapsedTicks++;
    next.log.push({ t: next.turnNumber, cmd: summarizeCommand(command) });
    return { state: next, events };
  }
  function summarizeCommand(c) {
    const o = { id: c.id, type: c.type, player: c.player };
    if (c.cardId) o.cardId = c.cardId;
    if (c.color) o.color = c.color;
    return o;
  }
  function noteInvalid(state, idx, reason) {
    const pl = state.players[idx];
    state.invalidCounts[pl.id] = (state.invalidCounts[pl.id] || 0) + 1;
    state.log.push({ t: state.turnNumber, ev: 'invalid', player: pl.id, reason });
  }

  function doPlay(state, idx, command, la, events) {
    const pl = state.players[idx];
    const card = pl.hand.find(c => c.id === command.cardId);
    if (!card) throw new Error('card-not-in-hand');
    const legal = la.actions.find(a => a.type === 'play' && a.cardId === card.id);
    if (!legal) throw new Error(explainInvalid(state, pl.id, card.id) || 'illegal-card');

    pl.hand.splice(pl.hand.indexOf(card), 1);
    state.discardPile.push(card);
    state.stats.cardsPlayed++;
    if (card.kind !== 'number') state.stats.actionsUsed[card.kind] = (state.stats.actionsUsed[card.kind] || 0) + 1;
    events.push({ ev: 'cardPlayed', player: pl.id, card: cloneCard(card), seat: idx });

    const isWild = card.kind === 'wild' || card.kind === 'wild4';
    if (isWild) {
      if (command.color && COLORS.includes(command.color)) {
        state.currentColor = command.color;
        events.push({ ev: 'colorChosen', player: pl.id, color: command.color });
      } else if (pl.isAI) {
        state.currentColor = bestColorFor(pl);
        events.push({ ev: 'colorChosen', player: pl.id, color: state.currentColor, auto: true });
      } else {
        state.pendingColorChoice = { player: idx };
        events.push({ ev: 'awaitColorChoice', player: pl.id });
        return; // turn advances after chooseColor
      }
    } else {
      state.currentColor = card.color;
    }
    resolveCardEffects(state, idx, card, events);
    finishTurn(state, idx, events);
  }

  function resolveCardEffects(state, idx, card, events) {
    const n = state.players.length;
    if (card.kind === 'skip') {
      const skipped = nextSeat(state, idx);
      events.push({ ev: 'skipped', player: state.players[skipped].id });
      state.currentPlayer = nextSeat(state, skipped);
      state._turnAdvanced = true;
    } else if (card.kind === 'reverse') {
      state.direction *= -1;
      events.push({ ev: 'reversed', direction: state.direction });
      if (n === 2) { // reverse acts as skip in 2-player
        events.push({ ev: 'skipped', player: state.players[nextSeat(state, idx)].id });
        state.currentPlayer = idx;
        state._turnAdvanced = true;
      }
    } else if (card.kind === 'draw2') {
      state.pendingDraw += 2;
      events.push({ ev: 'pendingDraw', amount: state.pendingDraw, source: 'draw2' });
    } else if (card.kind === 'wild4') {
      state.pendingDraw += 4;
      events.push({ ev: 'pendingDraw', amount: state.pendingDraw, source: 'wild4' });
    }
  }

  function doChooseColor(state, idx, command, la, events) {
    if (!command.color || !COLORS.includes(command.color)) throw new Error('invalid-color');
    const legal = la.actions.find(a => a.type === 'chooseColor' && a.color === command.color);
    if (!legal) throw new Error('invalid-color');
    state.currentColor = command.color;
    state.pendingColorChoice = null;
    events.push({ ev: 'colorChosen', player: state.players[idx].id, color: command.color });
    const card = topDiscard(state);
    resolveCardEffects(state, idx, card, events);
    finishTurn(state, idx, events);
  }

  function doDraw(state, idx, la, events) {
    if (!la.actions.some(a => a.type === 'draw')) throw new Error('draw-not-allowed');
    const pl = state.players[idx];
    if (state.pendingDraw > 0) {
      const n = state.pendingDraw;
      drawCards(state, pl, n, events);
      state.pendingDraw = 0;
      events.push({ ev: 'penaltyTaken', player: pl.id, amount: n });
      finishTurn(state, idx, events);
      return;
    }
    const maxDraw = state.config.drawToMatch ? 3 : 1;
    let drew = 0, playable = null;
    while (drew < maxDraw) {
      const c = drawCards(state, pl, 1, events)[0];
      drew++;
      if (c && cardMatches(state, c)) { playable = c; break; }
    }
    events.push({ ev: 'drew', player: pl.id, count: drew, playableId: playable ? playable.id : null });
    finishTurn(state, idx, events);
  }

  function doResign(state, idx, events) {
    const pl = state.players[idx];
    pl.connected = false;
    events.push({ ev: 'resigned', player: pl.id });
    // In solo vs AI, resign ends the round with the leading opponent as winner.
    const alive = state.players.filter(p => p.connected);
    if (state.players.filter(p => !p.isAI).length <= 1) {
      const others = state.players.filter(p => p.id !== pl.id);
      others.sort((a, b) => handValue(a.hand) - handValue(b.hand));
      finishRound(state, others[0], 'resignation', events);
      return;
    }
    if (idx === state.currentPlayer) finishTurn(state, idx, events);
  }

  function drawCards(state, pl, n, events) {
    const out = [];
    for (let i = 0; i < n; i++) {
      if (state.drawPile.length === 0) recycleDiscard(state);
      if (state.drawPile.length === 0) break; // degenerate; everything is on the table
      const c = state.drawPile.pop();
      pl.hand.push(c);
      out.push(c);
      state.stats.cardsDrawn++;
      events.push({ ev: 'cardDrawn', player: pl.id, cardId: c.id });
    }
    return out;
  }
  function recycleDiscard(state) {
    const top = state.discardPile.pop();
    const rest = state.discardPile;
    state.discardPile = [top];
    shuffle(rest, state.rng);
    state.drawPile = rest;
  }

  function finishTurn(state, idx, events) {
    const pl = state.players[idx];
    state.turnCount[pl.id] = (state.turnCount[pl.id] || 0) + 1;

    if (pl.hand.length === 1) events.push({ ev: 'oneCardLeft', player: pl.id });
    if (pl.hand.length === 0) {
      finishRound(state, pl, 'empty-hand', events);
      return;
    }
    // challenge move limit: counted for the human seat(s)
    if (state.config.moveLimit > 0 && !pl.isAI && state.turnCount[pl.id] >= state.config.moveLimit) {
      // out of moves: best opponent wins
      const others = state.players.filter(p => p.id !== pl.id);
      others.sort((a, b) => handValue(a.hand) - handValue(b.hand));
      events.push({ ev: 'moveLimitHit', player: pl.id, limit: state.config.moveLimit });
      finishRound(state, others[0], 'move-limit', events);
      return;
    }
    if (!state._turnAdvanced) state.currentPlayer = nextSeat(state, idx);
    state._turnAdvanced = false;
    events.push({ ev: 'turnPassed', next: state.players[state.currentPlayer].id, turn: state.turnNumber + 1 });
  }

  function finishRound(state, winner, reason, events) {
    state.phase = 'finished';
    state.winner = winner.id;
    state.terminalReason = reason;
    const breakdown = state.players
      .filter(p => p.id !== winner.id)
      .map(p => ({
        player: p.id, name: p.name,
        cardsLeft: p.hand.length,
        handValue: handValue(p.hand),
        detail: p.hand.map(c => ({ label: cardLabel(c), value: cardValue(c) })),
      }));
    const total = breakdown.reduce((s, b) => s + b.handValue, 0);
    state.scores = { winner: winner.id, total, breakdown, reason };
    events.push({ ev: 'roundEnd', winner: winner.id, reason, scores: state.scores });
  }

  function nextSeat(state, from) {
    const n = state.players.length;
    return (((from + state.direction) % n) + n) % n;
  }
  function bestColorFor(pl) {
    const counts = {};
    for (const c of pl.hand) if (c.color) counts[c.color] = (counts[c.color] || 0) + 1;
    let best = COLORS[0], bn = -1;
    for (const c of COLORS) if ((counts[c] || 0) > bn) { bn = counts[c] || 0; best = c; }
    return best;
  }

  /* ---------------- ties / ranking ---------------- */
  function rankResults(state) {
    // primary objective completion, fewer invalid actions, lower elapsed ticks, stable id
    return state.players.slice().sort((a, b) => {
      if (a.id === state.winner) return -1;
      if (b.id === state.winner) return 1;
      const ia = state.invalidCounts[a.id] || 0, ib = state.invalidCounts[b.id] || 0;
      if (ia !== ib) return ia - ib;
      const va = handValue(a.hand), vb = handValue(b.hand);
      if (va !== vb) return va - vb;
      return a.id < b.id ? -1 : 1;
    }).map(p => p.id);
  }

  /* ---------------- AI ---------------- */
  function aiChoose(state, playerId, level) {
    const la = legalActions(state, playerId);
    if (!la.ok) return null;
    const acts = la.actions;
    // Local copy of the cosmetic stream: deliberation must NOT mutate serialized state,
    // otherwise replays (which skip deliberation) diverge from live hashes.
    const rng = { state: state.decorStream.state };
    if (acts[0] && acts[0].type === 'chooseColor') {
      const pl = state.players.find(p => p.id === playerId);
      return { type: 'chooseColor', color: bestColorFor(pl) };
    }
    if (level === 'easy') return rngPick(rng, acts);
    const plays = acts.filter(a => a.type === 'play');
    if (!plays.length) return acts.find(a => a.type === 'draw');
    const pl = state.players.find(p => p.id === playerId);
    const byId = id => pl.hand.find(c => c.id === id);
    if (level === 'medium') {
      // prefer number cards matching the majority color in hand; keep wilds
      const nonWild = plays.filter(a => { const c = byId(a.cardId); return c.kind !== 'wild' && c.kind !== 'wild4'; });
      const pool = nonWild.length ? nonWild : plays;
      const best = bestColorFor(pl);
      const inBest = pool.filter(a => byId(a.cardId).color === best);
      return rngPick(rng, inBest.length ? inBest : pool);
    }
    // hard: dump high-value cards, use actions to disrupt leaders, manage color
    const scored = plays.map(a => {
      const c = byId(a.cardId);
      let s = cardValue(c);
      if (c.kind === 'wild' || c.kind === 'wild4') s -= 30; // hold wilds unless hand is small
      if (pl.hand.length <= 2) s += cardValue(c);           // dump everything late
      const nxt = state.players[nextSeat(state, state.players.findIndex(p => p.id === playerId))];
      if (nxt && nxt.hand.length <= 2 && (c.kind === 'skip' || c.kind === 'draw2' || c.kind === 'wild4' || c.kind === 'reverse')) s += 60;
      const best = bestColorFor(pl);
      if (c.color === best) s += 5;
      return { a, s };
    });
    scored.sort((x, y) => y.s - x.s || (x.a.cardId < y.a.cardId ? -1 : 1));
    const pick = scored[0].a;
    if (pick.needsColor) pick.color = bestColorFor(pl);
    return pick;
  }

  /* ---------------- serialization / cloning ---------------- */
  function cloneCard(c) { return { id: c.id, kind: c.kind, color: c.color, rank: c.rank }; }
  function cloneState(state) {
    return {
      version: state.version,
      config: JSON.parse(JSON.stringify(state.config)),
      rng: { state: state.rng.state },
      decorStream: { state: state.decorStream.state },
      players: state.players.map(p => ({
        id: p.id, name: p.name, isAI: p.isAI, aiLevel: p.aiLevel,
        connected: p.connected, hand: p.hand.map(cloneCard),
      })),
      drawPile: state.drawPile.map(cloneCard),
      discardPile: state.discardPile.map(cloneCard),
      currentColor: state.currentColor,
      currentPlayer: state.currentPlayer,
      direction: state.direction,
      pendingDraw: state.pendingDraw,
      phase: state.phase,
      turnNumber: state.turnNumber,
      turnCount: Object.assign({}, state.turnCount),
      invalidCounts: Object.assign({}, state.invalidCounts),
      winner: state.winner,
      terminalReason: state.terminalReason,
      scores: state.scores ? JSON.parse(JSON.stringify(state.scores)) : null,
      stats: JSON.parse(JSON.stringify(state.stats)),
      pendingColorChoice: state.pendingColorChoice ? Object.assign({}, state.pendingColorChoice) : null,
      pendingDrawnPlay: state.pendingDrawnPlay ? Object.assign({}, state.pendingDrawnPlay) : null,
      log: state.log.slice(-64).map(e => JSON.parse(JSON.stringify(e))),
    };
  }
  function serialize(state) { return JSON.stringify(cloneState(state)); }
  function deserialize(json) {
    const s = typeof json === 'string' ? JSON.parse(json) : json;
    if (!s || s.version > RULES_VERSION) throw new Error('unsupported-state-version');
    return migrate(s);
  }
  // migrations: fill fields introduced after older versions
  function migrate(s) {
    s.turnCount = s.turnCount || {};
    s.invalidCounts = s.invalidCounts || {};
    s.stats = s.stats || { cardsPlayed: 0, cardsDrawn: 0, actionsUsed: {}, elapsedTicks: 0 };
    s.log = s.log || [];
    s.pendingDrawnPlay = s.pendingDrawnPlay || null;
    s.decorStream = s.decorStream || rngCreate('decor:migrated');
    s.version = RULES_VERSION;
    return s;
  }

  /* ---------------- replay ---------------- */
  // envelope: { schema, rulesVersion, seed, config, players, initialHash, commands[], hashes[], result }
  function replayCreate(state) {
    return {
      schema: 1, rulesVersion: RULES_VERSION,
      seed: state.config.seed, config: state.config,
      players: state.players.map(p => ({ id: p.id, name: p.name, isAI: p.isAI, aiLevel: p.aiLevel })),
      initialHash: stateHash(cloneState(state)),
      commands: [], hashes: [], result: null,
    };
  }
  function replayAppend(rep, stateAfter) {
    rep.hashes.push({ turn: stateAfter.turnNumber, hash: stateHash(cloneState(stateAfter)) });
    if (stateAfter.phase === 'finished') {
      rep.result = { winner: stateAfter.winner, reason: stateAfter.terminalReason, total: stateAfter.scores.total };
    }
  }
  function replayVerify(rep) {
    let state = createGame(rep.config, rep.players);
    if (stateHash(cloneState(state)) !== rep.initialHash) return { ok: false, reason: 'initial-hash-mismatch' };
    for (let i = 0; i < rep.commands.length; i++) {
      const r = applyCommand(state, rep.commands[i]);
      if (r.error) return { ok: false, reason: 'command-rejected', index: i, detail: r.reason };
      state = r.state;
      const h = rep.hashes[i];
      if (h && h.hash !== stateHash(cloneState(state))) {
        return { ok: false, reason: 'hash-mismatch', index: i, turn: state.turnNumber };
      }
    }
    if (rep.result) {
      if (state.phase !== 'finished' || state.winner !== rep.result.winner) {
        return { ok: false, reason: 'result-mismatch' };
      }
    }
    return { ok: true, turns: state.turnNumber };
  }

  global.CERules = {
    RULES_VERSION, COLORS, COLOR_INFO, ACTION_KINDS, KIND_LABEL, SCORE_VALUES,
    hashSeed, rngCreate, rngNext, rngInt, rngPick, stableStringify, stateHash, hashState,
    buildDeck, shuffle, cardLabel, cardValue, handValue,
    normalizeConfig, createGame, defaultPlayers,
    legalActions, canPlayCard, explainInvalid, cardMatches, topDiscard,
    applyCommand, aiChoose, bestColorFor, rankResults,
    cloneState, serialize, deserialize, migrate,
    replayCreate, replayAppend, replayVerify,
  };
})(typeof window !== 'undefined' ? window : globalThis);
