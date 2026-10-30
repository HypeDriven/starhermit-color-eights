# Color Eights — Game Design Document (running spec)

**Status:** shipped; this document describes the game as it runs today.
**Pitch:** a shedding card game in a lamp-lit lounge — match the discard by color or rank, weaponize Skip, Reverse, Draw Two and Wilds, and be the first to empty your hand.
**Genre:** turn-based card game, solo versus 1–3 deterministic AI opponents.
**Session length:** one round is 2–6 minutes (2 players) to 8–12 minutes (4 players, stacking).
**Platforms:** a StarHermit engine script game (engine 1.30.0, host API 1.32): played natively by the StarHermit client and in desktop and mobile browsers (portrait and landscape) by the engine's web runtime, from one package.
**Rendering:** a `starhermit:scene` lounge table (felt, wood rim, pendant-lamp pool of light, discard pile, draw-pile stack, opponents' face-down fans) with looks per graphics level and post effects, under a `starhermit:ui` layer that carries every control.

## 1. Overview and file map

| Path | Responsibility |
|---|---|
| `starhermit.txt` | Package manifest: name, description, owner, `server=score-script.js`, `cover=cover.jpg`, `launch=index.html`, `engine.api=1`, `engine.entry=native/main.ts`, `engine.version=1.30.0`, `engine.minor=32`, `engine.capabilities=platform,storage,clipboard`, the `control.*` and `engine.gamepad.*` actions. |
| `index.html`, `starhermit-files.json` | The engine's web loader and file index, written by `npm run package` (`starhermit package --web .`); never edited by hand. |
| `native/main.ts` | Entry module: screen flow, the session wiring, the human seat's commands and the lesson gate, events → sounds and announcements, progress and achievements, results and score posting, Save & quit / Resume round, input actions and the lifecycle. Time is the runtime's fixed steps. |
| `native/screens.ts` | Every screen, the table HUD, the dialogs and the toast in `starhermit:ui`; the hand-drawn cards, piles, colour chip and chooser. |
| `native/render.ts` | The lounge on `starhermit:scene`: table, lights, card pool mirroring the state, glow, far lamps, motes, the look per level. |
| `native/glyphs.ts` | The suit and kind symbols (◆ ≈ ♣ ☀ ★ ⊘ ⇄) as drawn shapes, for the overlay and the card-face canvases. |
| `native/quality.ts` | The browser build's four presets and budgets keyed by the runtime's quality tier and level index. |
| `native/style.ts` | Registers `assets/ui-style.json` (theme, tokens, styles); Surface detail's panels per level. |
| `native/audio.ts` | One-shots from `sfx/manifest.json` on the runtime's buses, the C4 + E4 pad rendered into a seamless loop. |
| `native/platform.ts` | The save (`saves`), the game's options (`settings`), the browser build's foreign cloud save and legacy settings migration, the player, invite link, score posting through `score-script.js`, the platform clock. |
| `native/i18n.ts` | Locale from the runtime's interface language; `tr()`, `N()`, the platform strings. |
| `native/classic.ts` | Loads the classic scripts below (`loadClassic`) and types what the client reads. |
| `js/rules.js` | `CERules`: pure deterministic engine — deck, legality, command application, scoring, AI, serialization, replay. No DOM, no Date, no Math.random. |
| `js/content.js` | `CEContent`: 5 themes, 4 color-vision palettes, 40 Journey stages, 7 lessons, daily generator, 5 challenges, offline validators. |
| `js/session.js` | `CESession`: command dispatch with idempotent ids, undo stack, hint, AI scheduling, turn timer, snapshots, pause/resume; timers and clock injected (the client passes fixed-step timers). |
| `js/store.js` | `CEStore`: the pure save model — the save document, progress merge, the browser build's cloud-save reader, the game's options and their checks. |
| `js/i18n.js`, `js/strings.js`, `js/platform-strings.js` | Nine-locale tables (English keys) and the lookup `CEI18N`; the StarHermit lines. |
| `tools/ui-style.css` → `assets/ui-style.json` | The class-based style sheet, converted with `starhermit css` (`npm run css`). |
| `tools/package-web.mjs`, `tools/css.mjs`, `tools/gen-play.mjs`, `tools/browser-play.mjs` | Packaging, CSS conversion, the generated Journey play script, the headless-Chrome play of the web package. |
| `assets/` | `key-art.webp` (title), `results-win.webp`, `results-lose.webp`, `ui-style.json`. |
| `sfx/` | 24 Opus clips, `manifest.txt` (canonical), `manifest.json` (loader), `manifest.md` (generated). |
| `score-script.js` | StarHermit platform script (`server=`): range-checks a won round's points and posts them to the `high-score` leaderboard (canonical copy in the games repo's `tools/score-script.js`). |
| `server.js` | Local static host for development (left out of the package). |
| `tests/` | `rules.test.mjs`, `progress.test.mjs`, `i18n.test.mjs`, `native.mjs` and `native/*.play` (§14). |
| `.starhermitignore` | Leaves `tests/`, `tools/`, `server.js`, `spec.md`, `README.md`, `coverart.png` out of the package. |
| `LICENSE.md` | PolyForm Noncommercial 1.0.0. |

## 2. Vision and design pillars

1. **Every legal move is visible before you commit.** Playable cards lift 4 px with a white ring; unplayable ones are disabled and their `aria-label` says why (`explainInvalid`). Rules in: hints and lessons use the same `legalActions` API as play. Rules out: hidden "gotcha" rejections, hover-only affordances.
2. **Color is a shape, too.** Ember ◆, Tide ≈, Leaf ♣, Sol ☀, Wild ★. Every card, chip and chooser button carries the glyph, and four palettes (standard, contrast, deuteranopia, tritanopia) swap hues without touching rules. Rules out: any mechanic readable only by hue.
3. **One deck, one seed, one truth.** A round is fully determined by `config.seed` plus the ordered command list; replays hash every turn. Rules in: seeded dailies, journey stages with fixed seeds, verifiable replays. Rules out: cosmetic randomness leaking into outcomes (the AI's "decor" stream is copied, never mutated).
4. **Teach one card at a time.** Lessons rig a hand and accept only the required action; Journey adds Skip, Reverse, Draw Two, Wild and Wild Draw Four in that order with a mastery stage after each group. Rules out: the full 104-card deck on stage 1.
5. **The lounge is warm even when you lose.** Loss plays a soft woodwind descent and a calm blue still-life, never a buzzer; the score breakdown explains exactly which cards cost the opponents. Rules out: punishment audio, streak-loss guilt, timers on unranked play.

## 3. Player experience

**Target player:** someone who knows a shedding card game from family tables and wants a quick, fair solo round on a phone or laptop; secondary, a completionist who wants forty authored stages with goals.

**First 60 seconds.** The title shows the key art, the one-line rule ("Match the discard by color or rank. Empty your hand first.") and Practice as the highlighted primary button. Practice → Start round deals in one click with 2 players, medium AI. On the table the discard, the current-color chip and the "Your turn" label sit above the hand; playable cards are lifted and ringed, the rest greyed. If nothing is playable the Draw button is the only enabled control. A Hint button (H, or Y on a gamepad) outlines the best card in gold. Players who want instruction first pick Learn: seven lessons, each a rigged hand where only the required action is accepted and any other click announces the hint text and plays the "invalid" thud.

**Session shape.** Deal (shuffle riffle) → 10–40 alternating turns, each acknowledged by a card slide or draw whoosh, with a bell on "your turn", knocks when anyone hits one card, and a flurry when a penalty lands → fanfare or soft descent → results with the score breakdown → Play again / Next stage / Back to menu.

**Emotional beat.** The pivot when a Wild or Draw Two flips the tempo — the color chip changes, the opponent count jumps, and the "one card left" knock lands — is what the game is built around.

## 4. Core loop and rules contract

All rules live in `js/rules.js` (`CERules`); the UI only dispatches commands through `CESession.dispatch`.

**Deck** (`buildDeck`): per color (ember, tide, leaf, sol) two copies of ranks 1–9 and of Skip, Reverse, Draw Two = 96 cards, plus 4 Wild and 4 Wild Draw Four = **104 cards**. There is no rank 0; "eights" in the title is flavor — 8 is an ordinary rank. Stage/challenge configs may filter kinds (`allowedKinds`) or colors (`palette`).

**Setup** (`createGame`): `normalizeConfig` clamps `playerCount` 2–4, `handSize` 1–10 (default 7, capped so two cards remain), `moveLimit` 0/1–500, `turnTimerSec` 0/3–120, flags `stacking`, `drawToMatch`, `assists.{hint,undo}`. The rules RNG is mulberry32 seeded with FNV-1a of `'rules:' + seed`; a second `'decor:' + seed` stream is reserved for cosmetics. Deck is filtered, shuffled, dealt round-robin; the first discard is redrawn (reshuffle) if it is a Wild Draw Four; a plain Wild first card picks the starting color from the rules RNG. Seat 0 is always the human (`p0`, "You"); AI seats are Vex, Mira, Tallo.

**Legal actions** (`legalActions(state, playerId)`): returns `{ok, actions}` or `{ok:false, reason}` with reasons `round-finished`, `unknown-player`, `not-your-turn`. During a pending color choice only `chooseColor` for the chooser. Otherwise:
- `play` for each card where `cardMatches`: any Wild/Wild Draw Four; same color as `currentColor`; same rank as a number top card; same action kind as an action top card.
- `draw` is always offered.
- With `pendingDraw > 0` and `stacking` off: only `draw`. With `stacking` on, also `play` of Draw Two on Draw Two, Wild Draw Four on anything, Draw Two on Wild Draw Four if its color equals `currentColor`.

**Resolution order** (`applyCommand` → `doPlay`/`doDraw`/`doChooseColor`/`doResign` → `resolveCardEffects` → `finishTurn`): the input state is never mutated; malformed commands (`missing-command-id`, `unknown-command-type`, `invalid-color`, `card-not-in-hand`, `no-color-or-rank-match`, `must-draw-penalty`, `stacking-requires-draw-card`) return `{error, reason}`, increment `invalidCounts[player]` and are logged. On success `turnNumber` increments (monotonic tick).
- Number card: `currentColor` = card color.
- Skip: the next seat is skipped (`skipped` event), play moves to the seat after.
- Reverse: `direction *= -1`; with 2 players it acts as a Skip (same player again).
- Draw Two: `pendingDraw += 2`. Wild Draw Four: `pendingDraw += 4` after the color is chosen.
- Wild played by a human without a `color` field: `pendingColorChoice` is set, the turn does not advance until `chooseColor`; AI wilds choose `bestColorFor` (majority color in hand) instantly.
- Draw with a penalty pending: draws `pendingDraw` cards (`penaltyTaken`), resets it, turn passes. Draw without penalty: one card, or with `drawToMatch` up to 3 until one matches; **the turn passes either way** — a drawn playable card is played on a later turn.
- Empty draw pile: `recycleDiscard` shuffles everything but the top discard back with the rules RNG.
- `finishTurn`: `oneCardLeft` at hand size 1; hand size 0 ends the round (`empty-hand`); a human reaching `moveLimit` own turns ends the round with the lowest-value opponent hand as winner (`move-limit`); otherwise `currentPlayer` advances (`turnPassed`).
- Resign (`Quit without saving` in pause): in solo the opponent with the lowest hand value wins (`resignation`).

**Scoring** (`finishRound`): the winner scores the sum of every other seat's remaining hand: numbers at face value, Skip/Reverse/Draw Two 20, Wild/Wild Draw Four 50 (`SCORE_VALUES`, `cardValue`). Worked example: You empty your hand while Vex holds Tide 7, Leaf Skip and a Wild → 7 + 20 + 50 = **77 points**, shown on the results screen as "Vex — 3 cards left, 77 points (Tide 7 7, Leaf Skip 20, Wild 50)". When an AI wins, the total still sums the losing hands (including yours) and is displayed, but only wins add to `progress.mastery.points`.

**Terminal states:** `phase: 'finished'` with `terminalReason` ∈ {`empty-hand`, `resignation`, `move-limit`} and `winner`. **Tie-break** (`rankResults`, API only): winner first, then fewer invalid actions, lower remaining hand value, then stable id.

**AI** (`aiChoose`): easy picks a uniformly random legal action; medium prefers non-wild playable cards in its majority color; hard scores each play (card value, −30 for wilds unless the hand is ≤2, +60 for any disruptive card when the next seat has ≤2 cards, +5 for majority color) and takes the top. AI replies are scheduled 650 ms after the human move (+250 ms for hard) by `CESession.scheduleAI` (counted in the runtime's fixed steps, 60 a second).

**Undo/hints** (`js/session.js`): `undo` is permitted only when `config.assists.undo` (Practice with the Undo assist box) and restores the serialized snapshot taken before the last human command (up to 32); it discards the replay envelope. `hint` returns the highest-value playable card (+2 if it matches the current color) or `draw`.

**Replay** (`replayCreate/Append/Verify`): envelope holds schema 1, rules version 3, seed, config, players, initial hash, ordered commands and a state hash per command; verification rebuilds from the seed and rejects hash or result mismatches.

## 5. Modes and progression

| Mode | Entry | Config | Assists | Progress written |
|---|---|---|---|---|
| Practice | Title → Practice → setup | 2–4 players, easy/medium/hard, Stacking, Draw-to-match, Undo; seed `practice-<time>` | hint + optional undo | stats, achievements |
| Journey | Title → Journey → stage → intro overlay → Play | one of 40 authored stages (`CEContent.JOURNEY`), fixed seed `journey-<n>` | hint only | `journey[id] = {goalMet, best}` |
| Daily Challenge | Title → Daily Challenge (starts immediately) | seed `daily:YYYY-MM-DD` (UTC date from the platform clock (`serverNow()`, the device's UTC date while it has not answered)), players 2 + h%3, stacking if h%3 = 0, draw-to-match if h%5 = 0, medium AI | none | `stats.dailyCompleted[date]` on a win |
| Challenges | Title → Challenges → row | 5 authored (`CEContent.CHALLENGES`) | none | `challenges[id] = {completed, best}` |
| Learn | Title → Learn → lesson | 7 rigged lessons (`CEContent.LESSONS`), gated input | lesson hint text | `tutorials[id]` |

**Journey curve.** Stages 1–4 numbers only against easy AI (stage 4 asks for a win in ≤24 own turns); 5–8 add Skip and a third seat, mastery *Tempo*; 9–12 Reverse, four seats, *Reckoning: Direction*; 13–16 Draw Two, then the stacking room option, mastery *Pressure* (score ≥ 60); 17–20 Wild, *Reckoning: Palette* (score ≥ 80); 21–24 Wild Draw Four and the full deck, mastery *The Works*; 25–28 win-without-drawing goals and hard AI; 29–32 turn timers 12 s → 8 s, mastery *Velocity*; 33–36 two-color decks and 10-card hands, *Endurance* (score ≥ 120); 37–40 hard AI, stacking, timers, mastery *Color Eights* (score ≥ 100). Goal types (`goalMet`): `win`, `win-turns`, `win-no-draw` (session `humanDraws` = 0), `score-min`. Themes rotate ember_lounge → tide_hall → verdant_room → solarium → midnight_neon by stage index. No stage is locked; ✓ marks a met goal.

**Challenges.** *Twenty Turns* (3p, `moveLimit` 20), *Speed Lounge* (3p, 6 s timer; hesitation draws), *Two-Tone* (2p, ember+tide deck), *Perfect Flow* (2p, 8-card hand; the "no draws" rule is descriptive only — see Known limitations), *Avalanche* (4p, stacking, hard AI).

**Achievements** (`ACHIEVEMENTS` in `native/main.ts`, kept in the save): `first-win`, `all-lessons`, `journey-mastery`, `streak-3`, `century` (100+ points in a round). Unlocks are idempotent, chime and are announced.

## 6. Controls and interaction

Actions are declared in `starhermit.txt` and rebound by the player in the runtime's Options (F1 › Controls). The cards, piles and buttons are `ui` widgets: Tab / Shift+Tab and the arrows move focus, Enter or Space activates; on a gamepad the D-pad or left stick moves focus and South activates.

| Input | Keyboard | Gamepad | Pointer / touch | Feedback |
|---|---|---|---|---|
| Play a card | focus + Enter | D-pad + A | click / tap a lifted card | select tick → card slide or action chime; turn label updates; announcement "You played …" |
| Draw | **D** (`draw`), or the Draw pile | **X** (West) | click / tap Draw (N) | draw whoosh; "You drew 1 card" |
| Choose color (after a Wild) | focus + Enter | A | click / tap a color | mandatory dialog; "Color is now …" |
| Hint | **H** (`hint`) | **Y** (North) | Hint button | gold outline 1.6 s, sparkle, "Hint: play …" |
| Undo | **U** (`undo`; Practice, assist on) | **Select** | Undo button | reverse swish, "Move undone" |
| Pause | **P** (`pause`) / **Esc** (`cancel`) | **Start** / **B** (East) | Pause button | dialog; AI and turn timer stop |
| Close a dialog / back to the title | **Esc** | **B** | Close / Cancel / Back | the round resumes |

The action labels in the action row show the bound key ("Hint (H)", from `bindingLabel`). Input locking: card widgets and the Draw pile are disabled whenever the action is not in `legalActions` (and while any dialog is open); during an AI turn every hand card is disabled; the color chooser is mandatory (Escape does not close it, Pause does nothing). Double commits are prevented by per-command ids in `CESession`. The turn timer (challenge and speed stages) shows "(Ns)" after the turn label, counting down every frame, and dispatches a draw for the human on expiry. A hidden window (`onSuspend`) halts the AI and the turn timer; showing it again resumes unless a dialog is open.

## 7. Screens and UI flow

```
title ─┬► practice setup ─► table ─► results ─┬► table (Play again / Next stage / Next lesson)
       ├► journey grid ─► stage intro (dialog) ─► table   └► title
       ├► daily (direct) ─► table
       ├► challenges list ─► table
       ├► learn list ─► table (lesson banner) ─► lesson complete (dialog)
       ├► settings (dialog)
       └► Resume round (only when a saved round is still active)
table dialogs: pause (Resume / Restart round / Settings / Save & quit to menu / Quit without saving),
               color chooser (mandatory), lesson complete
```

Screens are built every frame (`native/screens.ts`) over the lounge, which shows behind every screen (the menus dim it with a `#0c0a0e88 → #0c0a0e66` gradient). Opening a screen focuses its first control (Practice, or Resume round when there is one). Dialogs are `ui.dialog`s (modal, a `#0c0a0ecc` backdrop); the press that opened one never closes it.

**Title.** Key art (cover-fit, rounded, 26 % of the height between 120 and 300 px; 96 px at ≤ 560 px tall), "Color Eights", the rule line, the account line ("Offline — progress is stored on this device." for a guest; "Playing as <name> · progress synced / saving… / cloud sync unavailable" signed in), then Resume round (when saved), Practice, Journey, Daily Challenge, Challenges, Learn, Settings, Invite a friend (signed in) and Sign in with StarHermit (a guest; the runtime's sign-in).

**Settings** (dialog, from the title or the pause menu): Color palette (standard, contrast, deuteranopia, tritanopia) with the four suit swatches; a note that sound volumes, graphics quality, the language, controls, reduced motion, high contrast and text size are in the StarHermit Options, with **Open Options** (`openMenu()`); Close.

**Layout.** The browser build's clamp() sizes and media queries are computed from the window's logical size (window pixels ÷ the UI scale, inside the safe area). Menus are a centered column min(92 % of the width, 460 px) (the journey grid min(94 %, 880 px), columns of at least 160 px), scrolling when taller than the window. The table is a header (mode title clamp(20, 3vw, 30), Pause) over a column whose parts spread top to bottom: lesson banner, turn label, color chip, opponents' counts; the draw pile and discard top (clamp(58, 10vw, 74) × clamp(82, 13vw, 104)); the hand (cards clamp(50, 9vw, 64) × clamp(70, 12vw, 88), wrapping into rows); the action row (Hint, Undo, Restart lesson). At ≤ 480 px tall the column tightens and cards and piles take 14 / 15 % of the height; when it still does not fit, the table scrolls. Card labels shrink (to 60 %) where a word or the whole label would not fit. Every button is at least 44 × 44 px. Larger interface and text sizes from the runtime's Options scale everything.

## 8. Art direction

**Palette.** Room `#0c0a0e`; text `#f4efe9`; muted text `#cfc7bd` / `#dcd3ca` / `#d9cec2`; turn label `#ffd9c8`; primary button `#ff7a4d` (hover `#ff9d6b`); focus ring and hint outline `#ffcf4d`; panels `#17121c`; draw pile `#2c2433` (hover `#3d3247`); dialog scrim `#0c0a0ecc`; wild cards `#9a93a3`. Card colors: Ember `#e1483c`, Tide `#2f7fe0`, Leaf `#37a24a`, Sol `#e8b32a`; contrast palette `#d42a1e` / `#0067c4` / `#0f8a3c` / `#e8a000`; deuteranopia `#c44e52` / `#4c72b0` / `#55a868` / `#ccb974`; tritanopia `#e1483c` / `#17becf` / `#2ca02c` / `#bcbd22`. High contrast is the runtime's (it forces the UI's colors).

| Theme | felt | fog/background | accent | used by |
|---|---|---|---|---|
| Ember Lounge (default) | `#5a2320` | `#160a0c` | `#ff7a4d` | title, practice, daily, challenges, lessons, stages 5,10,… |
| Tide Hall | `#16304a` | `#081420` | `#4db2ff` | stages 1,6,11,… |
| Verdant Room | `#1d4023` | `#0a180e` | `#63d97e` | stages 2,7,12,… |
| Solarium | `#4a3a16` | `#181206` | `#ffcf4d` | stages 3,8,13,… |
| Midnight Neon | `#241a3a` | `#0c0818` | `#b44dff` | stages 4,9,14,… |

`render.setTheme` sets the background and fog, felt, table body, wood rim (table color lifted toward walnut), floor, lamp color and hemisphere fill; the UI keeps the ember accent in every theme.

**Shape language.** Rounded rectangles everywhere (buttons 11 px, cards 9.6 px, panels 16 px); 2D cards are color slabs with a drawn white suit glyph over the label and a 1-px shadow; playable ones lift 4 px with a white ring and a drop shadow, unplayable ones are at half opacity, the hinted one gets a gold ring. With Surface detail (the detailed levels) they gain a diagonal sheen, an inner white bevel and a drop shadow; the Draw pile becomes a lattice card back on a paper-edge stack; the colour chip glows; dialogs get a soft gradient and shadow; the primary button a gradient. The suit symbols are drawn shapes (`native/glyphs.ts`), never font glyphs. The table's status text has a dark text shadow so it stays legible over the opponents' fans.

**Typography.** The system's sans (`system-ui`); title 40 (28 below 520 px) bold; body 17; turn label clamp(15, 2.4vw, 20) semibold.

**Motion.** Playable cards stand lifted; the hint outline holds 1.6 s; dialogs appear without animation. In 3D a newly played card drops onto the discard pile (320 ms ease-out); on the ambient levels the current-color glow breathes, the lamp flickers by a few percent and the far lamps twinkle; dust motes drift in the lamp cone. Reduced motion (the runtime's Options) freezes all of it; the camera never moves.

**Graphics.** ACES filmic tone mapping at exposure 1.05. Lighting is a hemisphere fill (theme fill over floor color; brighter without reflections), a pendant-lamp spotlight (three.js intensities ÷ π) fitted to the felt that casts the shadows, and a dim rim light. The table mirrors the state: the last four discards scattered at the center (top card straight), a draw-pile stack whose height follows the pile, a face-down fan per opponent (up to 14 cards, seated far / left-right / left-far-right for 1–3 opponents), and an additive ring of the current color around the discard (the theme's accent on the title, where the four eights lie fanned beside a pile). Camera: 45° at (0, 7.4, 7.6) looking at (0, −1.4, 0.35), (0, 10.5, 11.5) below 720 logical px wide.

The runtime's Options choose the graphics level (Auto by the device, or a level); `native/quality.ts` maps its quality tier to the browser build's preset and budget, and the runtime owns render scale, the pixel-ratio cap, adaptive resolution, the frame-rate limit and readout, the shadow-map ceiling and MSAA samples:

| Look | Low | Balanced | High | Ultra |
|---|---|---|---|---|
| Materials (table, felt, rim, floor, cards) | Lambert | Standard | Physical (clearcoat cards and rim) | Physical |
| Shadows (spot map) | off | 512 | 1024 | 2048 |
| AO (`renderer.ao`) | off | off | on (8 samples) | high (16) |
| Bloom (threshold 0.92) / grade + vignette | off | on | on | on |
| Antialiasing | MSAA | FXAA | SMAA | MSAA |
| Reflections (PMREM `RoomEnvironment`, per-surface intensity 0.02–0.35) | off | on | on | on |
| Surface detail (felt fibres + printed ring, wood grain, rounded textured cards with corner marks, lattice back, far lamps, detailed 2D cards) | plain | detailed | detailed | detailed |
| Card face / felt texture | 128 / 256 | 128 / 256 | 256 / 512 | 384 / 1024 |
| Round-geometry segments | ×0.5 | ×0.75 | ×1 | ×1.5 |
| Dust motes (grow with the level within the tier, ≤ 4×) | 0 | 40 (≤ 60) | 120 | 180 (≤ 600) |
| Ambient motion | static | animated | animated | animated |

**Visual assets.** Title key art, a win and a loss illustration for results, and a store cover derived from the key art (§15).

## 9. Audio direction

**Mix.** Effects are short dry transients on a warm felt table; the win fanfare and achievement chime are the only bright, sustained cues; loss is a soft descent. Music is a quiet two-tone pad (C4 + E4 sines at 0.08 / 0.10, rendered once into a 4-second seamless loop) that starts once the mixer runs (natively at once, in a browser after the first press). The browser build's buses are the runtime's: music → `music`, effects → `effects`, the button tick → `interface`; its default levels (master 0.9, music 0.6, effects 0.8) are folded into each sound's gain, and Options › Audio owns the volumes, mute and voice limit. Clips load one at a time once the mixer runs (the table's cues first); a cue whose clips have not loaded yet is silent. Several clips per event play in turn.

**SFX event table** — source for `sfx/manifest.txt`.

| Event id | File(s) | Sound | Fired by |
|---|---|---|---|
| `select` | `ui-select-tick`, `card-select-snap`, `chip-select-click` | soft wooden tick / card snap / chip click | every button, card, pile and color press |
| `card` | `card-play-slide`, `card-place-thump`, `card-flip-snap` | card slides, thumps, flips on felt | `cardPlayed` with a number card |
| `draw` | `deck-draw-whoosh`, `deck-draw-slide`, `deck-tap-draw` | card pulled from the deck | `drew` |
| `action` | `wild-eight-chime`, `action-whoosh-shimmer`, `action-zap-pop` | chime, shimmer whoosh, zap-pop | `cardPlayed` with an action card; `reversed` |
| `win` | `win-fanfare-brass`, `win-chime-arpeggio`, `win-applause-brief` | fanfare, arpeggio, applause | `roundEnd` when the human wins |
| `lose` | `lose-soft-descend` | gentle descending woodwind | `roundEnd` when an AI wins |
| `invalid` | `invalid-felt-thud` | polite double tap on felt | `invalidAction` for the human; lesson gate |
| `undo` | `undo-card-slide-back` | card slides back and is picked up | `undone` |
| `turn` | `turn-glass-bell` | single glass bell | `turnPassed` whose next seat is the human |
| `penalty` | `penalty-cards-flurry` | flurry of dealt cards | `penaltyTaken` |
| `onecard` | `onecard-knock-alert` | two knuckle knocks | `oneCardLeft` |
| `hint` | `hint-soft-sparkle` | soft sparkle | Hint |
| `achievement` | `achievement-warm-chime` | warm two-chord chime | achievement unlock; lesson complete |
| `shuffle` | `shuffle-deck-riffle` | riffle shuffle | new deal; discard pile recycled |

All clips: MOSS-SoundEffect v2.0, 48 kHz mono Opus 96 kbps, loudness-normalized to −20 LUFS, 1–3 s.

## 10. Localization

Nine locales ship: **en-US, en-GB, es-419, es-ES, de-DE, fr-FR, fr-CA, pt-BR, it-IT**. The locale is the runtime's interface language (`preferences().language`: the player's choice in Options › Language, else the StarHermit account's preferred language, else the device's), mapped to the nearest shipped locale (es-MX → es-419, en-AU → en-GB, fr → fr-FR) and given to `ui.setLanguage`; a change shows on the next frame (every string is looked up as it is drawn), the round untouched. The runtime's Options replaced the game's own Language selector.

- **Strings.** English source strings are the keys; `js/strings.js` holds the tables (es-419, de-DE, fr-FR, pt-BR, it-IT in full; en-GB derived with British spelling; es-ES and fr-CA list only their differences, e.g. es-ES *Cambio de sentido*, fr-CA *pointage*). Every string the client draws or announces goes through `tr()`: menus, practice setup, journey and challenge lists, the stage dialog and goals, lessons, the table (turn label, color chip, Draw pile, discard and card names, unplayable reasons), hints, pause and settings, results with the score breakdown, achievements and all announcements. Content stays English and is translated at display time: stage names and intros, lessons and their hints, challenges, and card names — suits Ember/Tide/Leaf/Sol and kinds are localized ("Brasa 7", "Salto Brasa", de "Glut-Stopp"). StarHermit lines (sign in, invite, toasts, the leaderboard line) come from `js/platform-strings.js`. "Color Eights", "StarHermit" and the opponents' names stay as they are.
- **Expansion.** Buttons wrap their labels; card labels wrap and shrink to fit; German card kinds use the short forms *Stopp* and *Wende*.

## 11. Accessibility

- **Keyboard and gamepad:** every control is a `ui` widget in build order (Tab, arrows, D-pad); the first control of each screen and dialog is focused on open; focus rings are 3 px `#ffcf4d`. Shortcuts D/H/U/P/Esc, rebindable.
- **Screen readers:** the UI's accessibility tree names every widget (each card by its name, with "not playable: <reason>" as its description; the Draw pile "Draw from the pile, N cards left"; the discard "Top of discard: <card>"); `ui.announce` reports menu changes, every play/draw/penalty/skip/reverse/color change, one-card warnings, timeouts, invalid moves with the reason, undo, achievements and results.
- **Color vision:** drawn shape glyphs on every card, chip and chooser button; four palettes in Settings (2D cards and the 3D table alike).
- **Reduced motion, high contrast, interface and text size:** the runtime's Options; reduced motion also freezes all 3D animation.
- **Targets:** ≥ 44 × 44 px for buttons, cards and selects; color-chooser buttons 110 × 56 px.
- **Audio:** no audio-only information — every cue has an announcement.
- **Contrast:** body text `#f4efe9` on `#0c0a0e` (≈ 17:1); primary button text `#1c0d08` on `#ff7a4d` (≈ 7:1).

## 12. StarHermit integration

The engine runtime provides the platform (`starhermit:platform`, `starhermit:storage`); the game never sees a token. Guests play fully offline with no platform calls beyond the clock.

| Feature | Status |
|---|---|
| Packaging (`starhermit.txt`) | Used: engine 1.30.0 pin, entry `native/main.ts`, capabilities platform, storage, clipboard; `launch=index.html` is the engine's web loader. |
| Identity | `player()`: signed in, the title shows "Playing as <displayName> · sync status"; a guest sees the offline line and **Sign in with StarHermit** (`requestSignIn()`). Signing out (`onSessionEnded`) shows a toast and play continues locally. |
| Save | `saves`: `{ v: 1, progress, snapshot }` on the device and in the cloud slot `game:<slug>`; a conflict merges both devices' progress (`CEStore.mergeDocs`: goals met on either side and the higher best per stage, every lesson, achievements at their earliest unlock, daily and challenge completion, the larger lifetime stats; the running streak and the saved round stay this device's); an account save replacing the device's is merged in. |
| Migration | The browser build's cloud save (the JS SDK's zipped `save.json` with checksummed `{ settings, progress }`) shows as foreign: its progress is merged in, its palette and practice options carried over, and the merge saved with `replaceForeign`. The old per-player settings groups (`audio`, `graphics`, `accessibility`, `camera`, `rulesOptions`, `ui.language`, …) carry the palette and practice options over and are then removed. A guest's old browser localStorage progress does not migrate. |
| Game settings | `settings` (`game.palette`, `game.stacking`, `game.drawToMatch`), synced with the account. Volumes, graphics, language, controls and accessibility are the runtime's. |
| Controls | `control.*` / `engine.gamepad.*`: cancel, pause, draw, hint, undo; rebinding in Options. |
| Invite link | Signed in: **Invite a friend** copies `inviteLink()` (clipboard) with a toast. |
| Server time | `serverTime()` at start; the daily date is `serverNow()` in UTC (the device's clock until the platform answers). |
| Leaderboards | Signed in: every round the player wins in Journey, Daily Challenge or Challenges (not Practice or Learn) posts its points through `score-script.js` (a practice session whose socket carries `{ type: 'result', scores: { 'high-score': n } }`; the script range-checks 0–1,000,000 and posts to the `high-score` board), and the results show "Leaderboard rank: #N" (or posted / not posted). |
| Reports, crash capture | The runtime's own (Options › Report a problem). |
| Achievements | Local (in the save); not platform achievements. |
| Sessions, matchmaking, chat, voice | Not used: solo versus deterministic AI. |

## 13. Technical architecture

- **Module boundaries:** `rules` mutates nothing outside `applyCommand`'s cloned state; `session` is the only caller of `applyCommand`; the client never edits `session.state`. The scene (`render.sync`) follows every state change; the UI reads the state every frame.
- **Determinism:** rules RNG and decor RNG are serialized in state; replays hash every turn. The client's timers (AI replies, the turn timer, the results' 650 ms delay) and the session clock count the runtime's fixed steps (60 a second), so play scripts replay exactly.
- **Persistence:** the save document (§12); "Save & quit" stores `session.snapshot()` (state JSON, humanDraws, replay) in it; the title shows Resume round only while the saved phase is `active`; finishing a round clears it. `rules.deserialize` migrates versions < 3.
- **Rendering budget:** table body, felt disc, rim torus, floor, glow quad, six far-lamp quads, a draw-pile box and a pool of 72 card meshes (a box with face/edge groups, or a rounded `ExtrudeGeometry`; face materials cached per card and color), three lights, ≤ 600 points. A level change rebuilds materials, textures and geometry.
- **Classic scripts:** `js/*.js` are evaluated with `loadClassic`, so the Node tests run the shipped code unchanged.

## 14. Testing and acceptance criteria

`npm test` runs:
- `npm run test:unit`: `tests/progress.test.mjs` (save merge, document merge keeping this device's round, the browser build's cloud save and settings migration, option checks), `tests/i18n.test.mjs` (every key the client, rules and content show is translated in every locale with intact placeholders, no unused keys; locale switching), `tests/rules.test.mjs` (39 rules and content tests: deck, setup, legality, effects, scoring, resign, move limit, serialization and migration, replay verification, fuzz, 40 stages, dailies, `validateAll`).
- `npm run test:native` (`tests/native.mjs`): the web index matches the files; `tsc` (TypeScript 5.9, no skipLibCheck); `starhermit check .` with no warnings; each `tests/native/*.play` as a signed-out `--render-check` run through the real UI: `journey-match.play` (generated by `tools/gen-play.mjs`: stage 1 played to its results), `learn-lessons.play` (lessons 1–6 through the lesson gate and the color chooser), `screens.play` (journey grid and stage intro, challenges, daily with pause and quit, settings, practice with hint, draw, undo, pause, Save & quit, Resume round and Restart round).

`npm run test:browser` (`tools/browser-play.mjs`): the packaged loader in headless Chrome at 1366×768, 390×844 (touch) and 844×390 (touch): starts, Practice → Start round by keyboard, hint, draw, pause and back, a tap on Pause on the phone — no console errors or warnings, no error screen. `npm run package` regenerates the loader and index after every change.

**QA bar (checkable):** every mode starts; no text or control is clipped at desktop, phone portrait and phone landscape (menus and the table scroll when they must); all controls reachable by keyboard and gamepad; `LICENSE.md` present.

## 15. Asset inventory

| Path | Purpose | Source | Status |
|---|---|---|---|
| `assets/key-art.webp` (1280×720, 29 KB) | Title screen illustration | FLUX.2 klein, seed 8101, 1536×864, 28 steps | generated in this pass, wired (title screen) |
| `assets/results-win.webp` (960×534, 15 KB) | Results illustration on a human win | FLUX.2 klein, seed 8102, 1152×640 | generated in this pass, wired (`resultsScreen`) |
| `assets/results-lose.webp` (960×534, 14 KB) | Results illustration on an AI win | FLUX.2 klein, seed 8103, 1152×640 | generated in this pass, wired |
| `coverart.png` (1200×675, 167 KB) | Store cover | key art + ffmpeg drawtext title/tagline, 256-color PNG | replaced in this pass (previous file was a generic placeholder) |
| `icon.png` (256×256) | Launcher icon | hand-authored SVG of two tilted cards | shipped |
| `sfx/*.opus` × 15 (select, card, draw, action, win) | Core cues | MOSS-SoundEffect v2.0 | shipped |
| `sfx/*.opus` × 9 (lose, invalid, undo, turn, penalty, onecard, hint, achievement, shuffle) | New cues | MOSS-SoundEffect v2.0, 100 steps | generated in this pass, wired in `native/main.ts`/`native/audio.ts` |
| `sfx/manifest.txt` | Canonical clip → event map | authored | shipped |
| 3D models / character animation | — | — | not called for: cards and table are procedural, no humanoid |

## 16. Known limitations

- A card drawn with Draw-to-match is reported as playable (`drew.playableId`) but cannot be played until the player's next turn; the UI does not mention this.
- *Perfect Flow* (`ch-nodraw`, `special: 'no-draw'`) is completed by any win; the no-draw condition is not enforced or checked (kept: the rules and replays depend on it).
- `rankResults` and `invalidCounts` are engine-only; results show a single winner.
- The 3D piles sit under the 2D Draw pile and discard rather than exactly aligned with them; the human hand is 2D only.
- Very long localized card names ("Joker pioche quatre") shrink to fit their card.
- At 960 × 540 the title, journey grid and results scroll (the play scripts reach below-the-fold controls by Tab).
- Achievements and dailies are local to the save (no platform achievements); a guest's old browser localStorage progress did not migrate.
- Cues whose clips have not loaded yet are silent (the browser build played synthesized blips meanwhile).

## 17. Design intent not yet implemented

- Per-daily/weekly leaderboards with seed + ruleset + assists, and platform achievement unlocks.
- Enforce the *Perfect Flow* no-draw condition and show goal progress in the challenge header.
- A warning cue in the last three seconds of the turn timer.
- Opponents' hands as more than fans, an ambience loop.
- Hosted play using the existing replay envelope and idempotent command ids.
