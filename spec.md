# Color Eights — Game Design Document (running spec)

**Status:** shipped; this document describes the game as it runs today.
**Pitch:** a shedding card game in a lamp-lit lounge — match the discard by color or rank, weaponize Skip, Reverse, Draw Two and Wilds, and be the first to empty your hand.
**Genre:** turn-based card game, solo versus 1–3 deterministic AI opponents.
**Session length:** one round is 2–6 minutes (2 players) to 8–12 minutes (4 players, stacking).
**Platforms:** desktop and mobile browsers (portrait and landscape), served as static files.
**Rendering:** Three.js lounge table (felt, wood rim, pendant-lamp pool of light, discard pile, draw-pile stack, opponents' face-down fans) with quality presets and post-processing, under a semantic DOM layer that carries every interactive control.

## 1. Overview and file map

| Path | Responsibility |
|---|---|
| `index.html` | Shell: importmap (`three` → `vendor/three.module.js`, `three/addons/` → `vendor/three/addons/`), `#ce-root` with the `#ce-canvas` (aria-hidden) and the `#ce-ui` screen element; loads `js/bootstrap.js`. |
| `js/bootstrap.js` | Imports `vendor/three.module.js`, sets `window.THREE`, then imports the modules in dependency order (`post.js` optionally — a failure leaves `CEPost` null and the game renders without post-processing). |
| `js/rules.js` | `CERules`: pure deterministic engine — deck, legality, command application, scoring, AI, serialization, replay. No DOM, no Date, no Math.random. |
| `js/content.js` | `CEContent`: 5 themes, 4 color-vision palettes, 40 Journey stages, 7 lessons, daily generator, 5 challenges, offline validators. |
| `js/session.js` | `CESession`: command dispatch with idempotent ids, undo stack, hint, AI scheduling, turn timer, snapshots, pause/resume. |
| `js/store.js` | `CEStore`: localStorage documents (settings v2, progress v2, profile, resume snapshot) with FNV-1a checksums. |
| `js/audio.js` | `CEAudio`: WebAudio buses, sample playback from `sfx/manifest.json`, synth fallbacks, two-tone pad music. |
| `js/platform.js` | `CEPlatform`: StarHermit host adapter — fragment launch token + Bearer + 45-min refresh, profile nickname, cloud-save mirror (zip+base64 slot, debounced, sync status), server-time offset. |
| `js/gfx.js` | `CEGfx`: pure graphics quality model — presets, categories, `detectPreset`, `resolve`, `presetTier`, `withPreset`, `describe`. |
| `js/post.js` | ES module importing the r160 post-processing passes and `RoomEnvironment`; exposes `window.CEPost`. |
| `js/render.js` | `CERender`: Three.js lounge scene, procedural textures, pooled card meshes mirroring the state, theme application, graphics settings (`setGraphics`/`graphicsInfo`), post chain, adaptive resolution, render-on-demand loop. |
| `js/gfx-ui.js` | `CEGfxUI`: the Settings → Graphics section and its strings in nine locales. |
| `js/ui.js` | `CEUI`: screen swapping, element helper, polite live region. |
| `js/game.js` | `CEGame`: thin facade over the session for the human seat (legal actions, play/draw/chooseColor). |
| `js/app.js` | `CEApp`: boot, all screens and overlays, event → SFX/announcement mapping, progress and achievements. |
| `css/style.css` | Dark lounge theme, responsive layout, accessibility variants, illustration styling. |
| `assets/` | `key-art.webp` (title), `results-win.webp`, `results-lose.webp`. |
| `sfx/` | 24 Opus clips, `manifest.txt` (canonical), `manifest.json` (loader + generator input), `manifest.md` (generated). |
| `server.js` | Local static host (`PORT` env, default 8080); refuses `tests/`, `tools/`, `node_modules/` and dotfiles. |
| `tests/rules.test.mjs` | 39 engine and content tests (`npm test`). |
| `tests/gfx.test.mjs` | Graphics model + panel-locale unit tests (`node --test`, part of `npm test`). |
| `tests/e2e.mjs` | Playwright playthrough through the visible UI at desktop and mobile viewports (`npm run test:e2e`). |
| `tests/smoke-screens.mjs` | Targeted screen smoke: journey, save/resume, lesson gating, settings, daily, challenges, keyboard. |
| `starhermit.txt` | `name=Color Eights`, `launch=index.html`, `owner=…`, `server=server.js`, `cover=coverart.png`. |
| `coverart.png`, `icon.png`, `favicon.svg` | Store art (1200×675), 256×256 icon, SVG favicon of two tilted cards. |
| `vendor/three.module.js` | Three.js r160 (MIT). |
| `vendor/three/addons/` | Same-revision (0.160.1) addons: EffectComposer, RenderPass, ShaderPass, OutputPass, GTAOPass, UnrealBloomPass, SMAAPass, FXAAShader, RoomEnvironment and their shader/math dependencies. |
| `LICENSE.md` | PolyForm Noncommercial 1.0.0. |

## 2. Vision and design pillars

1. **Every legal move is visible before you commit.** Playable cards lift 4 px with a white ring; unplayable ones are disabled and their `aria-label` says why (`explainInvalid`). Rules in: hints and lessons use the same `legalActions` API as play. Rules out: hidden "gotcha" rejections, hover-only affordances.
2. **Color is a shape, too.** Ember ◆, Tide ≈, Leaf ♣, Sol ☀, Wild ★. Every card, chip and chooser button carries the glyph, and four palettes (standard, contrast, deuteranopia, tritanopia) swap hues without touching rules. Rules out: any mechanic readable only by hue.
3. **One deck, one seed, one truth.** A round is fully determined by `config.seed` plus the ordered command list; replays hash every turn. Rules in: seeded dailies, journey stages with fixed seeds, verifiable replays. Rules out: cosmetic randomness leaking into outcomes (the AI's "decor" stream is copied, never mutated).
4. **Teach one card at a time.** Lessons rig a hand and accept only the required action; Journey adds Skip, Reverse, Draw Two, Wild and Wild Draw Four in that order with a mastery stage after each group. Rules out: the full 104-card deck on stage 1.
5. **The lounge is warm even when you lose.** Loss plays a soft woodwind descent and a calm blue still-life, never a buzzer; the score breakdown explains exactly which cards cost the opponents. Rules out: punishment audio, streak-loss guilt, timers on unranked play.

## 3. Player experience

**Target player:** someone who knows a shedding card game from family tables and wants a quick, fair solo round on a phone or laptop; secondary, a completionist who wants forty authored stages with goals.

**First 60 seconds.** The title shows the key art, the one-line rule ("Match the discard by color or rank. Empty your hand first.") and Practice as the highlighted primary button. Practice → Start round deals in one click with 2 players, medium AI. On the table the discard, the current-color chip and the "Your turn" label sit above the hand; playable cards are lifted and ringed, the rest greyed. If nothing is playable the Draw button is the only enabled control. A Hint button (H) outlines the best card in gold. Players who want instruction first pick Learn: seven lessons, each a rigged hand where only the required action is accepted and any other click announces the hint text and plays the "invalid" thud.

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

**AI** (`aiChoose`): easy picks a uniformly random legal action; medium prefers non-wild playable cards in its majority color; hard scores each play (card value, −30 for wilds unless the hand is ≤2, +60 for any disruptive card when the next seat has ≤2 cards, +5 for majority color) and takes the top. AI replies are scheduled 650 ms after the human move (+250 ms for hard) by `CESession.scheduleAI`.

**Undo/hints** (`js/session.js`): `undo` is permitted only when `config.assists.undo` (Practice with the Undo assist box) and restores the serialized snapshot taken before the last human command (up to 32); it discards the replay envelope. `hint` returns the highest-value playable card (+2 if it matches the current color) or `draw`.

**Replay** (`replayCreate/Append/Verify`): envelope holds schema 1, rules version 3, seed, config, players, initial hash, ordered commands and a state hash per command; verification rebuilds from the seed and rejects hash or result mismatches.

## 5. Modes and progression

| Mode | Entry | Config | Assists | Progress written |
|---|---|---|---|---|
| Practice | Title → Practice → setup | 2–4 players, easy/medium/hard, Stacking, Draw-to-match, Undo; seed `practice-<time>` | hint + optional undo | stats, achievements |
| Journey | Title → Journey → stage → intro overlay → Play | one of 40 authored stages (`CEContent.JOURNEY`), fixed seed `journey-<n>` | hint only | `journey[id] = {goalMet, best}` |
| Daily Challenge | Title → Daily Challenge (starts immediately) | seed `daily:YYYY-MM-DD` (UTC date from `CEPlatform.serverNow()`), players 2 + h%3, stacking if h%3 = 0, draw-to-match if h%5 = 0, medium AI | none | `stats.dailyCompleted[date]` on a win |
| Challenges | Title → Challenges → row | 5 authored (`CEContent.CHALLENGES`) | none | `challenges[id] = {completed, best}` |
| Learn | Title → Learn → lesson | 7 rigged lessons (`CEContent.LESSONS`), gated input | lesson hint text | `tutorials[id]` |

**Journey curve.** Stages 1–4 numbers only against easy AI (stage 4 asks for a win in ≤24 own turns); 5–8 add Skip and a third seat, mastery *Tempo*; 9–12 Reverse, four seats, *Reckoning: Direction*; 13–16 Draw Two, then the stacking room option, mastery *Pressure* (score ≥ 60); 17–20 Wild, *Reckoning: Palette* (score ≥ 80); 21–24 Wild Draw Four and the full deck, mastery *The Works*; 25–28 win-without-drawing goals and hard AI; 29–32 turn timers 12 s → 8 s, mastery *Velocity*; 33–36 two-color decks and 10-card hands, *Endurance* (score ≥ 120); 37–40 hard AI, stacking, timers, mastery *Color Eights* (score ≥ 100). Goal types (`goalMet`): `win`, `win-turns`, `win-no-draw` (session `humanDraws` = 0), `score-min`. Themes rotate ember_lounge → tide_hall → verdant_room → solarium → midnight_neon by stage index. No stage is locked; ✓ marks a met goal.

**Challenges.** *Twenty Turns* (3p, `moveLimit` 20), *Speed Lounge* (3p, 6 s timer; hesitation draws), *Two-Tone* (2p, ember+tide deck), *Perfect Flow* (2p, 8-card hand; the "no draws" rule is descriptive only — see Known limitations), *Avalanche* (4p, stacking, hard AI).

**Achievements** (`ACHIEVEMENTS` in `app.js`, stored locally): `first-win`, `all-lessons`, `journey-mastery`, `streak-3`, `century` (100+ points in a round). Unlocks are idempotent, chime and are announced.

## 6. Controls and interaction

| Input | Desktop | Mobile | Feedback |
|---|---|---|---|
| Play a card | click a lifted card / Tab + Enter | tap | select tick → card slide or action chime; turn label updates; live region "You played …" |
| Draw | click Draw (N) / **D** | tap Draw | draw whoosh; "You drew 1 card" |
| Choose color (after a Wild) | click a color button / Tab + Enter | tap | mandatory overlay; "Color is now …" |
| Hint | Hint button / **H** | tap Hint | gold outline pulse 1.6 s, sparkle, "Hint: play …" |
| Undo | Undo button / **U** (Practice, assist on) | tap Undo | reverse swish, "Move undone" |
| Pause | Pause button / **P** / **Esc** | tap Pause | overlay; AI timer and turn timer stop |
| Close overlay | **Esc** (non-mandatory only) | tap Resume/Close | session resumes |

Input locking: card and Draw buttons are `disabled` whenever the action is not in `legalActions`; during an AI turn every hand card is disabled; the color chooser is a mandatory overlay (Escape ignored). Double commits are prevented by per-command ids in `CESession` (duplicates return `{ok:true, duplicate:true}`), not by timers. The turn timer (challenge/journey speed stages) shows "(Ns)" in the turn label at render time and dispatches a draw for the human on expiry. Backgrounding the tab pauses AI and timers; returning resumes unless an overlay is open.

## 7. Screens and UI flow

```
boot ─► title ─┬► practice setup ─► game ─► results ─┬► game (Play again / Next stage / Next lesson)
               ├► journey grid ─► stage intro (overlay) ─► game        └► title
               ├► daily (direct) ─► game
               ├► challenges list ─► game
               ├► learn list ─► game (lesson banner) ─► lesson complete (overlay)
               ├► settings (overlay: General | Graphics tabs)
               └► Resume round (only when a saved snapshot is still active)
game overlays: pause (Resume / Restart round / Settings / Save & quit to menu / Quit without saving),
               color chooser (mandatory), lesson complete
```

`CEUI.setScreen` swaps `#ce-ui` between `ce-menu`, `ce-game` and `ce-boot`; overlays are appended inside the screen with `role="dialog"` and receive focus. If WebGL init throws, the boot screen shows a plain-text compatibility message and settings/progress stay intact.

**Layout.** Menus are a centered column `min(92vw, 460px)` (journey grid `min(94vw, 880px)`, `auto-fill minmax(160px,1fr)`), scrollable, with 6–8 vh top padding. The game screen is a column: header (mode title, Pause), table info (turn label, color chip, opponent card counts), draw pile + discard top (`clamp(58px,10vw,74px)` wide), the hand row (`clamp(50px,9vw,64px)` cards, wraps below 720 px), then the action row. Every button is at least 44×44 CSS px. Below 560 px viewport height the key art shrinks to 96 px and results art hides; below 480 px (landscape phones) the table column tightens its spacing, cards shrink to 14 vh and the game screen scrolls instead of clipping. Nothing critical sits under browser chrome: the viewport uses `viewport-fit=cover`, the canvas is behind the DOM, and menus scroll. Must never be cut off: the turn label, the color chip, the Draw button, every hand card, the Pause button, the results headline and breakdown.

## 8. Art direction

**Palette (from `css/style.css`, `rules.js`, `content.js`).** Room `#0c0a0e`; text `#f4efe9`; muted text `#cfc7bd` / `#dcd3ca` / `#d9cec2`; turn label `#ffd9c8`; primary button `#ff7a4d` (hover `#ff9d6b`, contrast mode `#ffcf4d`); focus ring and hint outline `#ffcf4d`; panels `#17121c`; draw pile `#2c2433` (hover `#3d3247`); overlay scrim `#0c0a0ecc`; wild cards `#9a93a3`. Card colors: Ember `#e1483c`, Tide `#2f7fe0`, Leaf `#37a24a`, Sol `#e8b32a`; contrast palette `#d42a1e` / `#0067c4` / `#0f8a3c` / `#e8a000`; deuteranopia `#c44e52` / `#4c72b0` / `#55a868` / `#ccb974`; tritanopia `#e1483c` / `#17becf` / `#2ca02c` / `#bcbd22`.

| Theme | felt | fog/background | accent | used by |
|---|---|---|---|---|
| Ember Lounge (default) | `#5a2320` | `#160a0c` | `#ff7a4d` | title, practice, daily, challenges, lessons, stages 5,10,… |
| Tide Hall | `#16304a` | `#081420` | `#4db2ff` | stages 1,6,11,… |
| Verdant Room | `#1d4023` | `#0a180e` | `#63d97e` | stages 2,7,12,… |
| Solarium | `#4a3a16` | `#181206` | `#ffcf4d` | stages 3,8,13,… |
| Midnight Neon | `#241a3a` | `#0c0818` | `#b44dff` | stages 4,9,14,… |

`CERender.applyTheme` sets the background and fog, felt, table body, wood rim (table color lifted toward walnut), floor, lamp (key) color and hemisphere fill; the DOM keeps the ember accent in every theme.

**Shape language.** Rounded rectangles everywhere (buttons `.7rem`, cards `.6rem`, panels `1rem`); DOM cards are color slabs with a white glyph + label and a 1-px text shadow (with Surface detail on they gain a diagonal sheen, an inner white bevel and a drop shadow; the Draw button becomes a lattice card back on a paper-edge stack; panels get a soft gradient). The 3D table is a round felt top inside a lacquered wood rim, lit by an overhead pendant-lamp spotlight whose pool fades to a dark lounge; distant warm lamp glows sit at the far wall. The hero of the game screen is the hand row — lifted playable cards against the dim felt.

**Typography.** System sans (`system-ui, Segoe UI, Roboto`); title `clamp(26px,4.5vw,40px)` 700; body `clamp(14px,2vw,18px)`; line length capped at 70ch. "Larger text" scales the root to 120%.

**Motion.** Playable cards translate up 4 px; hover brightens; hint outline holds 1.6 s; overlays appear without animation. In 3D a newly played card drops onto the discard pile (320 ms ease-out); with Ambient motion animated, the current-color glow breathes, the lamp flickers by a few percent and the far lamps twinkle; dust motes drift in the lamp cone. Reduced motion (the Settings toggle or `prefers-reduced-motion`) freezes all of it and removes CSS transitions; the camera never moves.

**Graphics.** The renderer uses ACES filmic tone mapping and sRGB output. Lighting is a hemisphere fill (theme fill over floor color) plus a pendant-lamp spotlight whose cone is fitted to the felt and which casts PCF soft shadows (cards, draw pile and rim onto the felt; table onto the floor), plus a dim rim light. The 3D table mirrors the state: the last four discards scattered at the center (top card straight), a draw-pile stack whose height follows the pile, and a face-down fan per opponent (up to 14 cards, seated far / left-right / left-far-right for 1–3 opponents); a soft ring of the current color glows around the discard (theme accent on the title, where the four eights lie fanned beside a pile). Optional effects: shadows; GTAO ambient occlusion (additive glows are hidden from its depth pass); bloom limited to the glow ring, far lamps and brightest highlights (threshold 0.92); a color grade (gentle S-curve, +10 % saturation, warm highlights / cool shadows) with vignette; FXAA/SMAA/MSAA; image-based reflections from a PMREM `RoomEnvironment` (clearcoat on cards and rim, kept dim so the room stays dark); surface detail (procedural felt fibres with a printed ring, wood grain, rounded textured cards with corner indices and a lattice card back, far lamp glows, and the detailed DOM card styling); dust particles; ambient motion. The Settings panel's **Graphics** tab offers Quality (Auto (detected: <tier>), chosen from the GPU's unmasked renderer string — software renderers get Low, discrete GPUs / Apple M get High, others Balanced, touch devices at most Balanced; Low; Balanced; High; Ultra), Render scale 50–200 %, one select per effect ("From preset (<tier>)" by default; choosing a preset clears overrides), Adaptive resolution (averages 90 frames; above 26 ms steps down 0.1 to 60 %, below 14 ms back up 0.05), Show frame rate (`#ce-fps`, bottom-left), a summary "GPU · cost · W×H px", and a note when post-processing is unavailable. Changes apply immediately and persist in `settings.graphics.gfx` (mirrored to the cloud save when hosted); `<body data-gfx-preset data-gfx-auto>` and the `ce-gfx-detailed` class reflect the result.

| Preset | Pixel-ratio cap × scale | Shadows | AO | Bloom | Grade | AA | Reflections | Detail | Particles | Motion |
|---|---|---|---|---|---|---|---|---|---|---|
| Low | 1 × 1 | off | off | off | off | MSAA (canvas) | off | plain | off | static |
| Balanced | 1.5 × 1 | 512² | off | on | on | FXAA | on | detailed | 60 | animated |
| High | 2 × 1 | 1024² | on (8 samples) | on | on | SMAA | on | detailed | 180 | animated |
| Ultra | 2 × 1.25 | 2048² | high (16 samples) | on | on | MSAA 4× target | on | detailed | 180 | animated |

**Visual assets the design calls for.** Title key art (lounge table with the four glowing suits), a win illustration and a loss illustration for results, and a store cover derived from the key art — all shipped under `assets/` and `coverart.png` (see §15).

## 9. Audio direction

**Mix.** Effects are short dry transients on a warm felt table; the "win" fanfare and "achievement" chime are the only bright, sustained cues; loss is a soft descent. Music is a quiet two-oscillator pad (C4 + E4 sines) started on the first user gesture unless muted. Buses (`CEAudio.BUSES`): `music` 0.6, `effects` 0.8, `ambience` 0.5 (reserved, nothing routed) under a 0.9 master; a Mute toggle zeroes all three. Samples are lazy-fetched after the WebAudio unlock; until decoded, or if a fetch fails, `playSfx` falls back to a synthesized blip per event so every cue exists even offline. Several clips per event rotate in order (`sampleRotate`).

**SFX event table** — source for `sfx/manifest.txt`.

| Event id | File(s) | Sound | Fired by |
|---|---|---|---|
| `select` | `ui-select-tick`, `card-select-snap`, `chip-select-click` | soft wooden tick / card snap / chip click | every `btn()` press |
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
| `hint` | `hint-soft-sparkle` | soft sparkle | Hint button / H |
| `achievement` | `achievement-warm-chime` | warm two-chord chime | achievement unlock; lesson complete |
| `shuffle` | `shuffle-deck-riffle` | riffle shuffle | new deal; discard pile recycled |

All clips: MOSS-SoundEffect v2.0, 48 kHz mono Opus 96 kbps, loudness-normalized to −20 LUFS, 1–3 s.

## 10. Localization

The game ships in **English only**, except the Settings → Graphics tab (and its General/Graphics tab labels), whose strings live in `js/gfx-ui.js` for en-US, en-GB, es-419, es-ES, de-DE, fr-FR, fr-CA, pt-BR and it-IT and follow `navigator.language` (base-language fallback, else en-US). Every other string is an inline literal in `app.js` (screens, announcements, reason texts), `content.js` (stage, lesson and challenge copy) and `rules.js` (color and kind labels via `COLOR_INFO`/`KIND_LABEL`). There is no language selector and `<html lang="en">` is fixed. The layout already tolerates ~30 % expansion: buttons wrap, taglines cap at 70ch, card labels are `clamp`-sized. The required locale set — en-US, en-GB, es-419, es-ES, de-DE, fr-FR, fr-CA, pt-BR, it-IT — is design intent (see §17).

## 11. Accessibility

- **Keyboard-only path:** all controls are native `<button>`, `<select>` and `<input>`; Tab order follows the DOM; the first control of each screen and overlay is focused on open; `:focus-visible` draws a 3-px `#ffcf4d` ring. Shortcuts D/H/U/P/Esc.
- **Announcements:** one polite `role="status"` live region (`CEUI.announce`) reports menu changes, every play/draw/penalty/skip/reverse/color change, one-card warnings, timeouts, invalid moves with the reason, undo, achievements and results. The turn label is itself a `role="status"`. Discard top is `role="img"` with a text label; the hand is a labelled group; each card's `aria-label` includes "not playable: <reason>" when disabled.
- **Color vision:** shape glyphs on every card and chip; four palettes in Settings; High contrast mode adds white borders and a yellow primary.
- **Reduced motion, larger text:** Settings toggles (persisted) apply body classes; reduced motion (or the OS preference) also freezes all 3D animation.
- **Graphics tab:** native `<select>`/range/checkbox controls with ids `gfx-preset`, `gfx-scale`, `gfx-<category>`, `gfx-adaptive`, `gfx-fps`; tabs are `role="tab"` buttons (`data-settings-tab`), Arrow Left/Right switch them; the summary is a polite live region.
- **Targets:** ≥ 44 × 44 px for buttons, cards, selects and checkboxes; color-chooser buttons 110 × 56 px.
- **Audio:** no audio-only information — every cue has a text announcement; Mute all.
- **Contrast:** body text `#f4efe9` on `#0c0a0e` (≈ 17:1); primary button text `#1c0d08` on `#ff7a4d` (≈ 7:1); card labels use a 1-px shadow over saturated fills.

## 12. StarHermit integration

Conventions per https://wiki.starhermit.com/.

| Feature | Status |
|---|---|
| Packaging (`starhermit.txt`: name, launch, owner, cover, server) | Used. Launch path is `index.html`; cover is `coverart.png`. |
| Identity / profile | Used when hosted. `#game_token=<jwt>` (fragment, stripped after read; query forms for local dev) is decoded for `sub` + `game_scope`, sent as `Authorization: Bearer`, re-minted every 45 min via `POST /api/v1/games/{slug}/launch-token` (60 s retry). The title menu shows "Playing as <nickname> · sync status" from `GET /api/v1/users/{sub}/profile` (never usernames, never `/api/v1/me`; `Player <id8>` fallback). Offline keeps the local guest profile and the offline status line. |
| Presence, activity start/end | Not used. |
| Server time (`/api/v1/time`) | Not called. `CEPlatform.serverNow()` returns local time + 0 offset; the daily date is derived from it in UTC. |
| Per-game settings / cloud save | Used when hosted. The wrapped settings/progress documents mirror to one zip+base64 slot at `GET/PUT /api/v1/me/cloud-saves/{slug}`: remote wins on boot (checksum-validated through `CEStore.unwrap`), saves debounce 2 s and flush on `pagehide`/hidden with keepalive. localStorage stays the offline cache. |
| Leaderboards | Not used. Daily wins are recorded locally in `stats.dailyCompleted`. |
| Achievements API | Not used. The five achievements are local and announced in-game. |
| Sessions, invitations, matchmaking, chat, voice | Not used. Solo versus deterministic AI only. |
| Game Script | `server=server.js` is declared, but `server.js` is a static file host, not an authoritative rules script. |

The engine is prepared for hosted play — pure rules, idempotent command ids, serializable state, replay hashes — but no network path exists today.

## 13. Technical architecture

- **Module boundaries:** `rules` mutates nothing outside `applyCommand`'s cloned state; `session` is the only caller of `applyCommand` in the browser; `app` never edits `session.state`. Rendering (`CERender.syncState`) and the DOM (`renderGame`) both consume the immutable state after each dispatch.
- **Determinism:** rules RNG and decor RNG are serialized in state; AI deliberation copies the decor stream so replays (which skip deliberation) match live hashes. `hashState` normalizes transient fields and caps the log at 64 entries.
- **Persistence:** `localStorage` keys `coloreights.settings` (v2), `coloreights.progress` (v2), `coloreights.profile`, `coloreights.snapshot`. Documents wrap `{version, data, updatedAt, checksum}`; a corrupt checksum or newer version yields defaults. "Save & quit" stores `session.snapshot()` (state JSON, humanDraws, replay); the title shows Resume round only while the saved phase is `active`; finishing a round clears it. `rules.deserialize` migrates versions < 3 by filling missing fields.
- **Rendering budget:** table body, felt disc, rim torus, floor, glow quad, six far-lamp quads, a draw-pile box and a pool of 72 card meshes (plain `BoxGeometry` or rounded `ExtrudeGeometry`; materials cached per face/color), three lights, ≤ 180 points. Pixel ratio = min(devicePixelRatio, preset cap) × preset scale × render scale × adaptive scale. Camera (0, 7.4, 7.6) → (0, −1.4, 0.35) at ≥ 720 px wide, (0, 10.5, 11.5) narrower. The EffectComposer (HalfFloat target: RenderPass → GTAO → UnrealBloom → OutputPass → grade → SMAA/FXAA) is built only when an effect needs it and rebuilt when its key (effects, size, pixel ratio) changes; if it throws, the game renders directly. When nothing animates (Low, or reduced motion) frames are rendered only after a state, theme, size or settings change, so Low is cheaper than a continuous loop; the loop returns early while `document.hidden`.
- **Performance targets:** first interactive under 2 s on a mid-range phone (three.js ≈ 1.2 MB is the only large asset; images total ≈ 58 KB; SFX are fetched lazily after the first gesture); p95 input-to-feedback < 100 ms (synchronous dispatch + immediate DOM rebuild).
- **How e2e drives the UI:** `tests/e2e.mjs` serves the folder on `PORT` (or an ephemeral port), launches Chrome via `playwright-core`, then clicks the visible Practice → Start round buttons, plays a lifted card or Draw, uses the color chooser if it appears, opens and closes Pause, and drives the round to results with a 120 ms interval that only clicks enabled `.ce-card-btn.ce-playable` / `.ce-draw-pile` / `.ce-color-btn` elements — no engine calls for gameplay.

## 14. Testing and acceptance criteria

`npm test` also runs `tests/gfx.test.mjs` (detectPreset on sample GPU strings incl. touch cap, resolve with auto/preset/override/invalid tier, render-scale clamp, `withPreset` clearing overrides, `describe`, every panel string present in all nine locales). `tests/rules.test.mjs` (39 tests, no dependencies): deck composition and uniqueness; setup invariants; first discard never Wild Draw Four; seed determinism; legality (draw always offered, out-of-turn, color/rank/wild matching, explained mismatches, finished-round rejection); effects (skip, reverse incl. 2-player, draw2 pending and absorbed, stacking on/off, human wild waits for color, wild4 pending); monotonic turn numbers; scoring with breakdown; resign, move limit, rank ordering; malformed commands leave gameplay state untouched; illegal card counted; serialize round-trip, v1 migration, future version rejected; replay verification and tamper detection; 20 seeded games terminate; discard recycling; 400-command fuzz with no duplicate ownership; 40 stages with unique ids/seeds, 5 mastery stages, 5 themes, stable daily seeds, `validateAll` (every stage, daily window, challenge terminates; every lesson's required action is legal).

`npm run test:e2e` (`tests/e2e.mjs`): at 1280×800 and 390×844 (touch) — page loads with zero console errors or warnings (GPU noise filtered), all ten globals exist, title has ≥ 5 buttons incl. Practice, practice setup renders selects, game shows 7 hand cards + discard + draw + turn label + color chip, a human action succeeds through the UI, Settings → Graphics: Auto names the detected tier and resolves to Low headless, Low then High apply live (`data-gfx-preset`, summary shows 1024² shadows), a Bloom override applies live, the panel fits the viewport with Close reachable, preset + override survive reload, Auto clears overrides; Pause → Settings → Graphics → Ultra runs the post chain in game; pause opens/resumes, the round reaches results with a breakdown, Back to menu works, content integrity (40 stages, `j01`), settings/progress round-trip. Screenshots land in `/tmp/color-eights-e2e-*.png`.

`npm run test:smoke` (`tests/smoke-screens.mjs`): journey grid has 40 stages, stage intro → game, save & quit → Resume round keeps stage title and draw count, lesson 1 rejects a wrong card and completes on the right one, settings rows ≥ 6 and palette persists, daily and a challenge start, Escape pauses and resumes.

**QA bar (checkable):** a new player sees the rule line on the title and the lesson banner in Learn; every listed mode starts from the browser; no console errors or warnings during the e2e; no text or control is clipped at 1280×800, 390×844 portrait or 844×390 landscape (menus scroll; the hand wraps); all controls reachable by keyboard; `node --check` passes on every JS file; `LICENSE.md` present.

## 15. Asset inventory

| Path | Purpose | Source | Status |
|---|---|---|---|
| `assets/key-art.webp` (1280×720, 29 KB) | Title screen illustration | FLUX.2 klein, seed 8101, 1536×864, 28 steps | generated in this pass, wired (`titleScreen`) |
| `assets/results-win.webp` (960×534, 15 KB) | Results illustration on a human win | FLUX.2 klein, seed 8102, 1152×640 | generated in this pass, wired (`resultsScreen`) |
| `assets/results-lose.webp` (960×534, 14 KB) | Results illustration on an AI win | FLUX.2 klein, seed 8103, 1152×640 | generated in this pass, wired |
| `coverart.png` (1200×675, 167 KB) | Store cover | key art + ffmpeg drawtext title/tagline, 256-color PNG | replaced in this pass (previous file was a generic placeholder) |
| `icon.png` (256×256), `favicon.svg` | Launcher icon, tab icon | hand-authored SVG of two tilted cards | shipped |
| `sfx/*.opus` × 15 (select, card, draw, action, win) | Core cues | MOSS-SoundEffect v2.0 | shipped |
| `sfx/*.opus` × 9 (lose, invalid, undo, turn, penalty, onecard, hint, achievement, shuffle) | New cues | MOSS-SoundEffect v2.0, 100 steps | generated in this pass, wired in `app.js`/`audio.js` |
| `sfx/manifest.txt` | Canonical clip → event map | authored | shipped |
| 3D models / character animation | — | — | not called for: cards and table are procedural, no humanoid |

## 16. Known limitations

- A card drawn with Draw-to-match is reported as playable (`drew.playableId`) but cannot be played until the player's next turn; the UI does not mention this.
- *Perfect Flow* (`ch-nodraw`, `special: 'no-draw'`) is completed by any win; the no-draw condition is not enforced or checked.
- The turn timer's "(Ns)" text only refreshes when the state changes; there is no ticking countdown or last-seconds cue.
- Daily seeds use the local clock (server time offset is always 0), so a device with a wrong clock plays a different day.
- `settings.controls` declares remappable bindings and `settings.audio.voice` a voice bus, but the keyboard handler uses fixed keys and no voice bus exists.
- The human hand is DOM-only (no 3D hand), and the 3D piles sit under the DOM Draw/discard buttons rather than exactly aligned with them. Music is a static two-tone pad.
- The Antialiasing "Off" tier only affects the post chain; the canvas keeps its native MSAA when no post effect runs.
- `rankResults` and `invalidCounts` are engine-only; results show a single winner.
- On a 390-px-wide phone the 7-card hand row touches the viewport edges (cards stay fully visible and tappable); 8+ cards wrap. Long labels ("Leaf Reverse", "Wild Draw Four") break mid-word inside the 64-px card.
- Achievements, dailies and journey progress live only in this browser's localStorage.

## 17. Design intent not yet implemented

- Localized strings for en-US, en-GB, es-419, es-ES, de-DE, fr-FR, fr-CA, pt-BR, it-IT with a language selector and a string table outside `app.js`.
- Server-time sync for the daily boundary, daily/weekly leaderboards with seed + ruleset + assists, and achievement unlock submission (identity and cloud-saved settings/progress are done).
- Enforce the *Perfect Flow* no-draw condition and show goal progress in the challenge header.
- A ticking turn-timer display with a warning cue in the last three seconds.
- Textured card faces (suit glyph + rank) and opponents' face-down hands in the Three.js scene; an ambience loop routed to the reserved `ambience` bus.
- Hosted play through the StarHermit Games API using the existing replay envelope and idempotent command ids.
