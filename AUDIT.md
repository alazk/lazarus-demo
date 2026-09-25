# Lazarus Scan design-system audit

Inventory of `index.html`, `design/*.css`, and `js/*.js` before the cleanup.
Screening logic, `/api/evaluate`, and map geometry (`COV_C`, `COV_R`, `RAY_DEG` in `js/map.js`) are out of scope.

Colour custom properties before this pass: **89** (primitives, semantic aliases, tones, map colours, focus colour, shadows). 40 of all custom properties had no `var()` reference. See section B.

## A. Components

| Element | Render | CSS | States (where JS sets them) | Tokens | Violations | Kit story |
| --- | --- | --- | --- | --- | --- | --- |
| Mast | static `index.html:36` | `layout.css` `.mast` | none | surface-raised, shadow-even, text | none | Mast / Default |
| Badge | static `index.html:93` `#home` | `layout.css` `.badge` | hover opacity `.82` only | text, on-tone | hover is opacity, not a state token | Badge / Product |
| Network pill | static `index.html:95` `.pill` | `layout.css` `.pill` `.dot` | none | surface-sunken, shadow-lift, success | dot uses `--color-success` (alias of leaf) | Badge / Network |
| Intro act panel | `intro.js:64` `renderIntro` | `layout.css` `.act` `.act-panel`; `result.css` `#act-copy` | `.on` + `aria-hidden` in `paintAct` (`intro.js:37`) | text-tertiary, text-secondary | ID selector `#act-copy`; `!important` in `result.css:129` | Intro / Panel |
| Act dots | `intro.js:81` | `layout.css` `.act-dot` | `.on` + `aria-current` (`intro.js:58`) | border, accent, text-secondary | selected is accent; hover is text-secondary. Not the segment family | Act / Dots |
| Filled button | intro, console, verdict | `layout.css` `.btn` `.btn-primary` | `:hover`, `.is-hover`, `:active` scale, `[disabled]` opacity `.5`, `.is-loading` | accent, accent-hover, on-accent | disabled is opacity; press is scale, not a fill | Button / Primary, Hover, Disabled, Loading, Pressed, Focus, WithIcon |
| Outlined button | intro Next, verdict New check | `layout.css` `.btn-tertiary` | hover fill + edge | surface, on-surface, border, interaction-* | press is the shared scale, not press-fill | Button / Tertiary, Hover |
| Field | `console-view.js:27` | `layout.css` `.field` `.err` | `.invalid`, `.is-hover`, `:focus` box-shadow, `[disabled]` opacity | text-disabled border, danger, interaction-* | focus is box-shadow + `outline:none`; invalid uses `--color-danger` | Field / Empty, Hover, Filled, Invalid, Focus, Disabled |
| Error text | `console-view.js:29` `#err` | `layout.css` `.err` | empty hides | tone-block-text | none | Error / Invalid |
| Segment | `reach.js:52` | `map.css` `.cov-seg` `.m-seg-btn` | `.sel` + `aria-pressed` (`reach.js:178`); disabled opacity | surface, shadow-lift, interaction-*, map-alpha | disabled is opacity; selected hover adds an extra inset edge | Segment / OneHop, TwoHops, ThreeHops, Hover, Disabled, Focus |
| Coverage map | `reach.js:40` `renderCoverage`; intro figure `intro.js:2` | `map.css`, overrides in `kit.css` and `result.css` | `.in`/`.out`, `.on`, `.held`, `.scanning`, outcome classes, `.chosen` | map-reach, map-reach-fill (blue-75), tone-* | primitive `--blue-75` via `--map-reach-fill`; several hues at once; ID `#cov-svg` | Console map, Intro map, Radius |
| Map disc | `reach.js:61` | `map.css` `.cov-disc` | radius tween | map-reach-fill | blue wash, not a neutral context wash | part of map stories |
| Map rings | `reach.js:63` | `map.css` `.cov-ring` | `.in`/`.out`/`.held` + outcome class in `syncCoverageRings` (`states.js:51`) | map-reach, map-inactive, tone edges | in-reach is accent, not border-strong; clear ring is leaf | Radius stories |
| Map pills | `reach.js:43` | `map.css` `.cov-pill` | `.on`, `.held`, outcome class | map-reach, tone text | in-reach pill is accent; hover rewrites the label colour | Label stories |
| Map wallets | `reach.js:91` | `kit.css` `.wdot` (not map.css) | `.in`/`.out`, `.chosen`, `.on-core`, outcome class | accent, tone-*, on-tone | styles live in the kit file; selected fill is accent | Circle stories |
| Map pick | `reach.js:78` | `map.css` `.cov-pick` | `.not` `.found` `.outside` `.on-core` `.dragging` | tone-block, tone-caution, map-inactive | none of the interaction family | part of map stories |
| Map bands / flash / wave | `reach.js:62`, `scan.js` | `map.css` `.cband` `.sflash` `.swave` | outcome class; `.on` | tone-pass-a fill, tone-pass-edge flash | clear band is a green fill; flash is leaf | Scanning, outcome grid |
| Wallet row | `console.js:23` `renderWalletList` | `map.css` `.m-row`; duplicate bar rule in `result.css:114` | `.in`, `.chosen` + `aria-pressed`, `.is-hover`, `.is-press` | color-reach on the bar, interaction-* | covered bar is a second accent; selected fill is sunken, not raised + lift | WalletRow stories |
| Paste link | `console.js:62`, `console-view.js:24` | `map.css` `.m-paste` `.paste-link` | `.hide` | text-secondary; hover jumps to text | treated as a colour change, not an underline-only link | Ladder / Header |
| Step tile | `scan.js:102` | `scan.css` `.step` | `.active` `.idle` `.beyond` `.clear` `.listed` `.exposed` `.outside` `.failed` `.waiting` `.resolved` | tone edges mixed at 30% | outcome is a class, not `data-state` | Step stories |
| Attestation tile | `scan.js:108`, `paintAttestation` | same `.step.attest` | `data-state` pending/signing/attested/failed plus a view class | same as steps | already has `data-state`, plus a parallel class | Attestation stories |
| Warnline | `verdict.js:158` | `result.css` `.warnline` | none | tone-caution | none | Warnline stories |
| Result card | `scan.js:92`, filled in `verdict.js:168` | `result.css` `.card-result` | outcome class on `#panel` (`clear`/`listed`/…) | tone edge as top border | ID `#panel` in the kit, not in CSS | Result / six outcomes |
| Status header | `verdict.js:170` | `result.css` `.result-status` | `.tone-pass` etc from `STATUS_LABEL` | tone text + edge | tone class, parallel to outcome | inside Result stories |
| Path strip | `verdict.js:55` | `result.css` `.path-strip` | `.is-lazarus` | text, border | tx link hover not underline-only (inherits stat-link-like border) | Path stories |
| Stats | `verdict.js:75` | `scan.css` `.stat` `.stat-link` | hover border-color | text, text-tertiary | link changes colour via border, not underline | Stats / Clear |
| Detail | `verdict.js:181` | `scan.css` `.detail` | none | text-secondary | none | Detail / Failed |
| Actions | `verdict.js:185` | `result.css` `#actions-slot` | `.on` shows them | — | ID + `.on` for visibility; `!important` not here | inside Result |
| Kit chrome | `states-board.js:254` | `kit.css` | `aria-current`, `.is-focus`, `.is-w375` | on-surface, border-subtle, danger | primitive-alias tokens in the swatch list; nav hover changes colour and underlines | the board itself |

## B. Colour

### Tier of each token (before)

Primitives and ramps (many unused): `--bone-*`, `--coal-*`, `--blue-*`, `--color-white`, `--color-black`, `--color-ink-*`, `--color-leaf-*`, `--color-ruby-*`, `--color-gold-*`.

Semantic and aliases: `--color-surface*`, `--color-on-surface*`, `--color-text*`, `--color-border*`, `--color-accent*`, `--color-danger`, `--color-success`, `--color-warning-subtle`, `--color-magic-*`, `--color-coverage*`, `--color-reach`, `--cov-edge`, `--cov-soft`, `--focus-ring-color`, `--tone-*-{a,b,edge,text}`.

Component: `--map-reach`, `--map-reach-fill` (mixes primitive `--blue-75`), `--map-inactive`, `--map-core`, `--map-core-edge`, `--map-on-mark`, `--shadow-lift`, `--shadow-even`, `--shadow-raise` (unused).

### Unused colour tokens

`--bone-100`, bone alphas except the one alias of `--color-accent-active-text` (itself unused), most `--coal-alpha-*`, `--blue-100`, `--blue-800`, `--color-black`, `--color-on-surface-muted`, `--color-on-surface-subtle`, `--color-surface-alt-hover/strong/subtle`, `--color-accent-active-text`, `--color-warning-subtle`, `--color-gold-50`, `--tone-*-b`, `--tone-neutral-a`, `--tone-neutral-b`, `--color-coverage-mid`, `--cov-edge`, `--shadow-raise`.

### Duplicate values

`--color-danger` = `--tone-block-edge`. `--color-success` = `--tone-pass-edge`. `--color-coverage` = `--color-reach` = `--cov-edge` = accent. `--color-on-surface` = `--color-text`. `--focus-ring-color` = accent. `--color-on-surface-muted` = text-secondary. Caution edge and caution text are both gold-70. Neutral edge and neutral text are both ink-70.

### Primitives used from components

None directly (`var(--bone-*)` etc. do not appear outside `tokens.css`). The leak is `--map-reach-fill`, which mixes primitive `--blue-75`. `index.html` theme-color is the literal `#FBFCFE`.

### Hues per screen (before)

- Intro, no reach: ink, bone, one accent dot.
- Intro, core / all: accent disc and rings, plus the accent dot. Two roles of the same blue.
- Console 1/2/3 hops: accent disc, accent in-reach rings and pills, accent selected wallet, grey out-of-reach, ink type. One chromatic hue.
- Scanning: accent front and pulses, plus the accent disc, on top of in-reach rings.
- Clear: leaf band fill, leaf rings, leaf wallets, leaf flash, and the blue disc. Two hues.
- Listed / exposed: blue disc plus ruby band, rings, pills, wallets. Two hues, and the ruby spreads past the found band.
- Outside: blue disc plus gold dash on the found band and outer rings. Two hues, gold inherited outward.
- Failed / unattested: neutral steps; map stays on the reach blue. The failure is not isolated to the wallet.

## C. Interaction

Grouped by what the control does today. Every row is a divergence from a single rule.

| Family today | Hover | Pressed | Selected | Focus | Disabled |
| --- | --- | --- | --- | --- | --- |
| Filled button | accent-hover | `scale(.98)` on every `.btn` | — | global outline, but `:focus` is cleared in `kit.css:127` | opacity `.5` |
| Tertiary button | interaction fill + edge | same scale | — | same cleared `:focus` | not styled |
| Field | interaction fill + edge | — | — | `outline:none` and a border box-shadow (`layout.css:155`) | opacity `.5` (`kit.css:138`) |
| Segment | unselected: fill, no edge change (`map.css:204`) | — | raised + shadow-lift; hover on the selected one adds an inset edge | kit outline | opacity `--map-alpha-muted` and again `--map-alpha-ghost` |
| Wallet row | fill, not when `.chosen` | press fill | sunken + inset 2px bar | outline, negative offset | — |
| Kit nav link | underline, and colour changes to on-surface | — | `aria-current` colour only, no inset mark | kit outline | — |
| Map ring | `.held` paints the ring accent dashed | — | `.in` is accent solid | focus thickens a knob that is not in the markup | — |
| Map pill | hover fill + edge and recolours the text | — | `.on` is accent stroke and accent text | — | — |
| Wallet dot | hover fill (`kit.css:30`) | — | accent disc, white letter, accent ring | `outline:none`; stroke jumps to text | scanning fades others with opacity |
| Act dot | text-secondary | — | accent | kit outline | — |
| Badge | opacity `.82` | — | — | — | — |
| Paste / fact link | colour or border-colour changes | — | — | — | — |
| Stat link / path tx | border-colour changes to text | — | — | global outline | — |

State classes in use: `.sel`, `.chosen`, `.on`, `.held`, `.in`, `.out`, `.is-hover`, `.is-press`, `.is-pressed`, `.is-focus`, `.is-loading`. `aria-pressed` is already set on rows and segments but the CSS keys off the class.

## D. Dead code

- Tokens with no `var()` use: the unused list in B, plus `--size-dot`, `--map-pulse-cycle`, `--map-pulse-gap`, `--map-front-step`, `--map-flash`, `--map-burst`, `--map-pick-pulse`, `--bp-sm`, `--bp-md`, `--bp-lg`.
- JS never called: `rowSub` (`js/map.js:15`), `usdLabel` (`js/data.js:15`). `.m-dot` is updated in `reach.js:174` and never rendered.
- Selectors with no markup: `.deployed`, `.fact-link`, `.flow-row`, `.flow-n`, `.reach-pair`, `.reach-rings`, `.stack`, `.section-stack`, `.cov-knob`, `.cov-ray`.
- Keyframes all have a consumer: `btn-spin`, `sweep`, `pop`, `pulse`, `rise`, `settleIn`. None are dead.
- Duplicate rules: `.m-row.in .m-bar` in `map.css:24` and `result.css:114`. `.cov-ghost.on` twice in `kit.css`. Focus outline is declared in `layout.css` and again, differently, in `kit.css`.
- `!important`: reduced-motion in `layout.css:16` and `:20` (keep). Map motion lock in `motion.css:9–11` and `:18` (not reduced-motion). `#act-copy` min-height in `result.css:129`. Kit `.cov-pick` pointer-events in `kit.css:62`.
- Width queries are raw px (`640`, `1023`, `1024`) in `responsive.css`. CSS media queries cannot read custom properties, so `--bp-*` was unused. Height query `500px` is also raw.

## E. Structure

- Coverage map: markup in `reach.js`, motion in `map.js` and `motion.css`, outcome paint in `states.js` / `scan.js`, wallet-dot paint in `kit.css`, ray and intro disc in `result.css`.
- Wallet row: markup in `console.js`, most CSS in `map.css`, a duplicate in `result.css`.
- Buttons, field, badge, act dots: CSS in `layout.css`, which is also the page shell.
- Steps and stats: CSS in `scan.css`; the verdict that fills them is in `result.css` and `verdict.js`.
- Result card, path, warnline, actions: `verdict.js` + `result.css`, with step colour in `scan.css`.
- Type roles live at the bottom of `tokens.css`.
- The kit both renders stories and owns `.wdot` appearance.

## Judgement calls

1. Colour custom properties after phase 1: **53** (18 primitives, 25 semantic, 10 component). The target of 40 cannot hold the named semantic set (25) plus the 18 distinct hex steps those roles reference, before map, state, and shadow tokens. Nothing named in the brief was dropped. Before: 89 colour custom properties.
2. `--map-reach` stays, even though it equals accent. The map names its own signal so a later retint does not recolour buttons.
3. `--color-focus-ring` stays, even though it equals accent. Focus is a separate role.
4. The coverage disc left the `--blue-75` mix in this phase. That step was not referenced by tier 2, so it could not remain a primitive. The disc is now a 6% wash of text. Phase 3 states the layer rule.
5. Merged identical roles: danger into block edge, success into pass edge, on-surface into text, on-tone into on-accent (now white, so glyphs on ink and on accent match), border-subtle into border, the coverage aliases into `--map-reach`, map-inactive into text-disabled, map-core into surface-sunken, map-core-edge into border, map-on-mark into on-accent.
6. Press fill is text mixed at 8% into surface-sunken. No extra ink step.
7. `<meta name="theme-color" content="#FBFCFE">` stays. A meta value cannot read a custom property. It matches `--bone-50`.
8. The kit reads primitive names from the `:root` rule. The only primitive names in JavaScript are the prefix filters that group that ramp.
9. Failed and unattested steps use `--tone-neutral-wash` as their fill, so that required token is not dead. The tile is a step greyer than a raised card.
10. `--state-selected-fill`, `--state-selected-mark`, and `--state-disabled` are referenced at the colours those controls already used. Phase 2 is what makes every family follow them.

11. Phase 1 and phase 2 share one commit. State tokens were added in the colour file, and the selector changes touch the same stylesheets. Interactive staging was not used, so the colour system was not committed on its own.
12. Mouse focus clears the outline (`:focus:not(:focus-visible) { outline: none }`). Keyboard focus and the kit `.is-focus` hook keep the single `--color-focus-ring` outline. The ring is not drawn with a box-shadow.
13. A filled button's pressed colour is text mixed at 12% into accent-hover. There is no third blue step.
14. The badge is an ink control, not the accent button. Hover lightens it by mixing on-accent at 16%. It does not change opacity.
15. Act dots are a small segment. The selected dot is text-coloured. An unselected dot's hover edge is border-strong.
16. Coverage uses `data-reach="in|out"`. A radius preview uses `data-preview`, not `data-state`, because it is not an outcome.
17. Selection and activation use `aria-pressed`, `aria-current="step"`, `aria-hidden`, and `data-state`. The classes `.sel`, `.chosen`, `.held`, `.on`, and `.in` are no longer state. `.on-core` stays: it marks the wallet that sits on the centre, which is structure, not selection.
18. The selected wallet is a `--map-reach` stroke. The disc-fill tween is gone; the fill circle stays at radius 0.
19. A selected list row is transparent with the inset mark. It does not also take a sunken fill.
20. Kit navigation is a list row (hover fill, inset mark). Stat links and path links are text links (underline, colour unchanged). Paste is an outlined text button.
21. Segment hover is a fill only. Disabled buttons, fields, and segments use `--state-disabled` at full opacity.
22. `data-state` values `live`, `done`, and `ready` mark the scan wave, the pick pulse, and the result actions. They are activation, not outcomes.
23. The attested step shares the clear step's colour through `data-state="attested"`. Process classes (`active`, `idle`, `waiting`, `resolved`, `beyond`) stay classes.

24. The map's context and signal are separate. In-reach rings are border-strong, out-of-reach rings are a dashed border, and only the ring at the current radius (`aria-pressed`) is `--map-reach`, with its pill and the disc edge. A temporary rule that removed those strokes and drew a drop shadow was deleted because it fought the layer rule.
25. Clear bands no longer fill. A clear result colours only the picked wallet's outline. The clear flash is border-strong.
26. Outcome colour is not painted onto inner rings by looking ahead. A listed or exposed band colours that hop's ring only. An outside band colours that hop's ring with the caution dash. Pills stay context once a result exists.
27. The picked wallet stays a tertiary outline through the scan. `syncCoverageRings` takes `colourPick: false` from the scan walk. `paintMapVerdict` applies pass, block, caution, or neutral when the outcome is known. Failed and unattested clear every band and leave the pick neutral.
28. The scan front and the burst stay `--map-reach`. The ghost radius is the hover edge. Other wallets are a tertiary outline with no fill, including the intro caption. Coverage ticks in the list are border-strong, so choosing does not paint a second blue.
29. While a scan is running, non-picked wallets still fade with `--map-alpha-ghost`. That is opacity, not a second hue.

30. Styles were split by selector into one file per component, emitted in the old load order so an equal-specificity override still wins. Width queries stayed in `responsive.css`, because a media query cannot read a custom property.
31. CSS no longer uses IDs. `#act-copy`, `#actions-slot`, `#home`, `#cov-svg`, and `#right-slot` are now `.act-copy`, `.actions`, `.badge`, `.cov-svg`, and `.right`. The ids stay so the scripts can find the nodes.
32. `!important` remains only on the reduced-motion reset. The map's animation lock keeps `animation: none` without `!important`.
33. Component scripts are classic scripts, not ES modules. `hops`, `view`, `pickAddr`, and `stage` are reassigned across the page, and a module graph would have to thread that state through the scan. Each component file exposes `render`, `update`, and `STATES`. Path and stats moved into their files. The intro composes the button. The scan, the map, and the act panel still live beside the view that owns the live radius and the API result.
34. Class names stayed as they are. They are the contract the renderers and the kit query. A component's rules live in its own file.
