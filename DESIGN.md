---
name: Ground
description: 내 팀을 위한 극단적 편파 알림 — an iOS-native shell where every game is a ticket printed in your club's colour
colors:
  club-field: "#EA0029"
  club-stub: "#B80020"
  club-on-field: "#FFFFFF"
  club-tint: "#D70026"
  club-tint-dark: "#FF4D63"
  sys-bg: "#F2F2F7"
  sys-bg-dark: "#000000"
  sys-card: "#FFFFFF"
  sys-card-dark: "#1C1C1E"
  label: "#000000"
  label-dark: "#FFFFFF"
  label-2: "rgba(60, 60, 67, 0.6)"
  label-2-dark: "rgba(235, 235, 245, 0.6)"
  label-3: "rgba(60, 60, 67, 0.3)"
  label-3-dark: "rgba(235, 235, 245, 0.3)"
  sep: "rgba(60, 60, 67, 0.29)"
  sep-dark: "rgba(84, 84, 88, 0.6)"
  fill: "rgba(120, 120, 128, 0.12)"
  fill-dark: "rgba(120, 120, 128, 0.24)"
  bar: "rgba(249, 249, 249, 0.94)"
  bar-dark: "rgba(22, 22, 24, 0.94)"
  win: "#248A3D"
  win-dark: "#30D158"
  loss: "#D70015"
  loss-dark: "#FF453A"
typography:
  large-title:
    fontFamily: "Pretendard Variable, Pretendard, -apple-system, system-ui, sans-serif"
    fontSize: "34px"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.02em"
  section-title:
    fontFamily: "Pretendard Variable, Pretendard, -apple-system, system-ui, sans-serif"
    fontSize: "22px"
    fontWeight: 700
    letterSpacing: "-0.02em"
  pass-team-name:
    fontFamily: "Pretendard Variable, Pretendard, -apple-system, system-ui, sans-serif"
    fontSize: "24px"
    fontWeight: 900
    lineHeight: 1
    letterSpacing: "-0.03em"
  row-team-name:
    fontFamily: "Pretendard Variable, Pretendard, -apple-system, system-ui, sans-serif"
    fontSize: "18px"
    fontWeight: 900
    lineHeight: 1
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "Pretendard Variable, Pretendard, -apple-system, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 700
    lineHeight: 1.375
  body:
    fontFamily: "Pretendard Variable, Pretendard, -apple-system, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.25
  prose:
    fontFamily: "Pretendard Variable, Pretendard, -apple-system, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.55
  footnote:
    fontFamily: "Pretendard Variable, Pretendard, -apple-system, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.375
  slot-label:
    fontFamily: "Pretendard Variable, Pretendard, -apple-system, system-ui, sans-serif"
    fontSize: "10px"
    fontWeight: 600
    letterSpacing: "0.12em"
  tab-label:
    fontFamily: "Pretendard Variable, Pretendard, -apple-system, system-ui, sans-serif"
    fontSize: "10px"
    fontWeight: 600
    lineHeight: 1
  stamp:
    fontFamily: "Pretendard Variable, Pretendard, -apple-system, system-ui, sans-serif"
    fontSize: "24px"
    fontWeight: 900
    lineHeight: 1
  figure-score:
    fontFamily: "Barlow Condensed, Pretendard Variable, sans-serif"
    fontSize: "44px"
    fontWeight: 700
    lineHeight: 1
  figure-row:
    fontFamily: "Barlow Condensed, Pretendard Variable, sans-serif"
    fontSize: "34px"
    fontWeight: 700
    lineHeight: 1
  figure-inline:
    fontFamily: "Barlow Condensed, Pretendard Variable, sans-serif"
    fontSize: "28px"
    fontWeight: 700
    lineHeight: 1
  figure-table:
    fontFamily: "Barlow Condensed, Pretendard Variable, sans-serif"
    fontSize: "16px"
    fontWeight: 500
    fontFeature: "\"tnum\""
  figure-serial:
    fontFamily: "Barlow Condensed, Pretendard Variable, sans-serif"
    fontSize: "15px"
    fontWeight: 600
    letterSpacing: "0.02em"
rounded:
  icon-tile: "8px"
  stamp: "10px"
  group: "12px"
  card: "14px"
  ticket: "18px"
  full: "9999px"
spacing:
  gutter: "16px"
  ticket-inset: "18px"
  title-inset: "20px"
  row-min: "52px"
  section-gap: "24px"
  feed-gap: "32px"
components:
  ticket-field:
    backgroundColor: "{colors.club-field}"
    textColor: "{colors.club-on-field}"
    rounded: "{rounded.ticket}"
    padding: "14px 18px 0"
  ticket-stub:
    backgroundColor: "{colors.club-stub}"
    textColor: "{colors.club-on-field}"
    rounded: "{rounded.ticket}"
    padding: "12px 18px 16px"
    height: "78px"
  stamp:
    textColor: "{colors.club-on-field}"
    typography: "{typography.stamp}"
    rounded: "{rounded.stamp}"
    size: "54px"
  grouped-list:
    backgroundColor: "{colors.sys-card}"
    rounded: "{rounded.group}"
  grouped-row:
    backgroundColor: "{colors.sys-card}"
    textColor: "{colors.label}"
    typography: "{typography.body}"
    padding: "10px 16px"
    height: "52px"
  icon-tile:
    backgroundColor: "{colors.club-field}"
    textColor: "{colors.club-on-field}"
    rounded: "{rounded.icon-tile}"
    size: "32px"
  game-card:
    backgroundColor: "{colors.sys-card}"
    textColor: "{colors.label}"
    rounded: "{rounded.card}"
    padding: "16px"
  tab-bar:
    backgroundColor: "{colors.bar}"
    textColor: "{colors.label-2}"
    typography: "{typography.tab-label}"
    height: "49px"
  tab-bar-active:
    textColor: "{colors.club-tint}"
  button-on-field:
    backgroundColor: "{colors.club-on-field}"
    textColor: "{colors.club-field}"
    rounded: "{rounded.card}"
    typography: "{typography.headline}"
    height: "52px"
  button-sheet:
    backgroundColor: "{colors.fill}"
    textColor: "{colors.club-tint}"
    rounded: "{rounded.group}"
    height: "48px"
---

# Design System: Ground

## Overview

**Creative North Star: "직관 티켓" (The Game-Day Ticket)**

Every game is a ticket printed in your club's colour. Ground sits inside a plain iOS grouped-list shell, the same system grey (light) or pure black (dark) the phone already uses, and hands the fan one solid pass in club colour: who is playing, the start time or score, the inning, the stakes, the starters. Everything around that pass stays system: large titles, inset grouped rows, a native-style tab bar, sheets. The contrast between the quiet shell and the one loud, club-coloured object is the whole idea.

The pass behaves like paper. A dashed perforation with half-circle notches cut to the ground colour splits it into a body and a stub. Before the game the stub holds the start time; live, it holds the scoreline with the inning; final, it tears away a few points along a serrated edge and takes a 승/패 stamp. The same pass appears at row scale on 일정 for the fan's own team, and the fan's row on 순위 is painted in the same club field. Components feel 단단하고 또렷하게: solid fills, hard edges, heavy names, condensed figures, no glow.

Light and dark follow the device. The club is the only brand colour, and each club's values are hand-verified per use (field, stub, on-field text, tint for each mode) rather than derived at runtime.

**Key Characteristics:**
- One club-colour field per screen: the ticket (or its row-scale pass, or MY's club card). Everything else is system colour.
- iOS-native chrome: 34px large titles, inset grouped lists at 12px radius, a four-tab bar 오늘 · 일정 · 순위 · MY.
- Pretendard at heavy weights for every word and name; Barlow Condensed for every figure.
- The perforation is the signature: notches, dashed rule, a stub that changes with game state and tears when the game is over.
- Flat ground; the only resting shadow sits under the TODAY ticket.

## Colors

A neutral iOS system palette with exactly one brand voice, the user's club, resolved per club from a single verified table.

### Primary
- **Club Field** (`club-field`; KIA fallback shown): the solid face of the ticket, the row-scale pass on 일정, the user's row on 순위, MY's club card, the 32px icon tiles in grouped rows, and the full-bleed background of onboarding steps 2–3. Supplied at runtime as `--club-field` from `lib/clubTheme.ts`; the frontmatter value is the KIA fallback the app uses when no team is chosen.
- **Club Stub** (`club-stub`): the stub below the perforation, one step deeper than the field. For KT and Lotte the stub is the club's second colour (red under black or navy), not a darker shade.
- **On-Field Text** (`club-on-field`): every word and figure printed on field or stub. White for nine clubs; near-black (#1C1C1E) for Hanwha's orange. Verified at 4.5:1 or better. The onboarding CTA swaps it with the field (on-field as background, field as text) so dark-text clubs keep contrast.
- **Club Tint** (`club-tint` light / `club-tint-dark` dark): the club colour as it appears on system ground: the selected tab, checkmarks in MY, toggle-on state in the alert sheet, lineup order numbers, the active round in the bracket, focus rings, and text selection at 28%. A separate value per mode so navy and black clubs (Doosan, KT) stay visible on pure black.

### Tertiary
- **Win / Loss** (`win`/`win-dark`, `loss`/`loss-dark`): iOS system green and red for streak cells, result badges and live markers on neutral cards. Never used on club field, where the outcome is carried by the stamp and on-field white instead.

### Neutral
- **Grouped Background** (`sys-bg` / `sys-bg-dark`): the ground of every screen, and the colour the perforation notches are cut to. Also the `theme-color` of the browser chrome.
- **Card** (`sys-card` / `sys-card-dark`): grouped lists, neutral game cards, the standings table, sheets and skeletons.
- **Label** (`label` / `label-dark`), **Secondary Label** (`label-2`), **Tertiary Label** (`label-3`): primary text, then dates, footnotes, venue and section footers, then chevrons and disclosure glyphs. Exposed as `--label-rgb` so opacity variants (label/70, label/40) can be computed; the row-scale pass re-binds `--label-rgb` to on-field so nested text inverts automatically.
- **Separator** (`sep`): 0.5px hairlines between grouped rows, the tab bar's top edge, 1px standings row rules.
- **Fill** (`fill`): pressed state of every grouped row, and the background of the secondary sheet button.
- **Bar** (`bar`): the near-opaque tab bar surface.

### Named Rules
**The One Field Rule.** Club field paints at most one object per screen region: the ticket, the user's own pass in a schedule list, the user's standings row, or MY's club card. Headers, section titles, backgrounds and buttons on system ground never take club field.

**The Tint-Not-Field Rule.** On system ground the club speaks only through `--club-tint`, in small marks: a selected tab, a checkmark, a toggle, a number, a focus ring. If a mark is larger than a 32px icon tile, it is the wrong place for club colour.

**The One Source Rule.** Every club value comes from `lib/clubTheme.ts` through the `--club-*` variables (painted before first paint by the boot script in `app/layout.tsx`). No component carries a club hex of its own.

**The Device Decides Rule.** Light and dark follow `prefers-color-scheme`. There is no in-app theme switch, and every system token has a verified value for both.

## Typography

**Text Font:** Pretendard Variable (with Pretendard, -apple-system, system-ui fallbacks), served from the jsDelivr CDN with `ss01`, `ss02`, `tnum` on.
**Figure Font:** Barlow Condensed 500/600/700 via `next/font` as `--font-num` (Tailwind `font-num`).

**Character:** Korean text set heavy and tight like a printed pass; numbers set in a narrow scoreboard condensed face so a 4 : 3 or 18:30 reads from arm's length. The two never swap jobs.

### Hierarchy
- **Large Title** (700, 34px, 1.15, -0.02em): one per tab screen: 오늘, 일정's month, 순위, MY, onboarding questions (30px when the question wraps). Preceded on 오늘 by a 13px secondary-label date line.
- **Section Title** (700, 22px, -0.02em): feed sections on 오늘 (`KIA 쇼츠`, news).
- **Pass Team Name** (900, 24px, 1, -0.03em): team names on the ticket; 26px for the full club name on season and off-day passes and MY's card.
- **Row Team Name** (900, 18px, -0.025em): team names in schedule cards; 15px at 700 (900 for the user's row) in standings.
- **Headline** (700, 17px): preview and report headlines, selected list rows.
- **Body** (400, 17px): grouped list rows, following iOS body size.
- **Prose** (400, 15px, 1.55): preview and report text at label/80.
- **Footnote** (400, 13px): secondary lines in rows, section headers and footers in grouped lists, venue.
- **Slot Label** (600, 10px, 0.12em, at 75% opacity): field labels inside the ticket only (우리 선발 / 상대 선발), sitting directly above the value they name.
- **Tab Label** (600, 10px): tab bar captions.
- **Figures** (Barlow Condensed): 44px/700 score and 42px start time on the TODAY stub; 34px/700 on row-scale stubs and season record; 28px/700 inline scores on neutral cards; 20px bracket scores; 16px standings cells (500, 700 on the user's row and on 승률); 15px/600 serial `No.153`; 19px/600 start times on neutral cards; lineup order numbers 15px/600 in club tint.

### Named Rules
**The Figure Rule.** Every number a fan reads as a stat (score, time, serial, rank, win-loss, standings cells, lineup order) is Barlow Condensed. Korean words beside it (승, 패, 회말) stay Pretendard, even inside the same line.

**The Heavy Name Rule.** Team names are Pretendard 900 with negative tracking (-0.02em to -0.03em). Weight, not size, makes a name loud.

## Layout

A single phone column, max 448px (`max-w-md`) on wider screens. Content sits on a 16px side gutter (ticket, grouped lists, cards); large titles and feed section titles sit at 20px; grouped-list section headers and footers indent to 36px so they align with row text, as in iOS Settings.

Each tab screen is one vertical scroller with a safe-area-aware top (`env(safe-area-inset-top)` + 12px) and a bottom pad of 80px + safe area so content clears the tab bar. Vertical rhythm: 24px between the ticket and the first grouped block, 16px between stacked blocks, 28px between grouped sections on MY, 32px above feed sections. Rows are at least 52px tall (48px for plain link rows, 60px for two-line rows); every interactive target is at least 44px.

On 오늘 the ticket owns roughly the upper half of the first viewport, with a grouped block (하이라이트 보기 · 선발 라인업, then the lock-screen live score row) directly under it. Schedule is a week strip, a day header with a count, and a list of game cards where only the user's game becomes a pass. Standings is one dense table on a card with rank and team pinned left and the numeric columns scrolling horizontally behind them; a dashed cut line marks the postseason boundary below 5th.

**The 오늘 쇼츠 deviation (recorded).** The direction contract called for a grouped highlight list below the ticket. The shipped build keeps the existing horizontal 쇼츠 carousel, which plays inline and which the user did not ask to remove, shrunk to cards at 44% of the column (max 190px) at 9:16 with snap scrolling. Treat this as the one sanctioned horizontal carousel; new feed content goes in grouped lists.

## Elevation & Depth

Flat by default. Depth comes from the iOS layering of card on grouped background and from the ticket's own paper behaviour (notches, tear, stamp), not from shadows.

### Shadow Vocabulary
- **Ticket lift** (`box-shadow: 0 14px 30px -18px rgba(0,0,0,0.55)`): under the upper half of the TODAY ticket only, so the pass reads as an object lying on the ground.
- **Sheet** (`box-shadow: 0 16px 48px rgba(0,0,0,0.5)`): the alert-settings sheet floating over a dimmed screen.
- **Notification preview** (`box-shadow: 0 8px 24px -12px rgba(0,0,0,0.45)`): the mock lock-screen notifications in onboarding step 3, which imitate iOS banners.

### Named Rules
**The Flat Ground Rule.** Grouped lists, cards, tables and the tab bar have no shadow and no blur. The tab bar is a near-opaque `--bar` fill with a 0.5px separator, because backdrop blur re-renders every frame during iOS scroll.

## Shapes

Corners are a short ladder, each step tied to one kind of object: 18px for passes (ticket, row-scale pass, MY's club card, the ticket skeleton); 14px for neutral game cards, shorts thumbnails and the onboarding CTA; 12px for grouped lists, the standings card, the preview card and the sheet's secondary button; 10px for the stamp and the series chip; 8px for icon tiles; full circles for team-logo discs (52px on the pass, 32px in lists) and round icon buttons.

The pass is the one non-rectangular form. Its body has rounded top corners only; the stub has rounded bottom corners only; between them a 2px dashed rule at 50% white is inset 16px, with 22px half-circle notches at each edge filled with the grouped background so they read as cut through. A torn stub is clipped by a serrated mask (12px teeth, 7px deep) along its top edge and drops 9px with a -1.2° rotation from its right corner.

**The Perforation Rule.** Anything that is a pass gets the notched perforation and a stub; nothing that is not a pass does. A perforation on a neutral card or a section divider breaks the metaphor.

## Components

### The Ticket (GamePass)
The signature object, and the primary action on 오늘: tapping it toggles the lineup detail; pressed, it scales to 0.985.
- **Header strip:** round label (정규시즌, 플레이오프 6차전, 12px/600 at 90%) left; the season serial `No.N` right in Barlow Condensed. The serial counts this team's games this season including postseason.
- **Matchup:** three-column grid, the user's team always left. Each side is a 52px white logo disc, the team name (Pass Team Name), and a 12px line `홈 · 정규 3위`; the opponent side sits at 80% opacity. A 14px `vs` at 70% between.
- **Series chip:** postseason only, `시리즈 2승 3패` on black/20 at 10px radius.
- **Starter slots:** two cells divided by white/20 hairlines, each a Slot Label over a 16px/800 name (`발표 전` when unknown).
- **Stub by state:** pre-game, start time (42px) with `N시간 M분 후 시작` and venue; live, our score first (44px, theirs at 75%) with a pulsing dot, inning label and `N점 앞서요 / 뒤져요 / 동점`; final, score plus 경기 종료 and the stamp, stub torn; cancelled, `우천 취소` / `경기 취소` with a 취소 stamp, stub torn.
- **Stamp:** 54px square, 2.5px current-colour border, 10px radius, 24px/900 label (승, 패, 무, 취소, a rank like 3위, or 우승), resting at -8°. It springs in from 1.6× scale and -14° (stiffness 420, damping 18, 0.25s delay).
- **Variants:** SeasonPass (off-season: season label + serial, full club name with a thank-you line, stub always torn with the W-L-D record and a final-rank or 우승 stamp); NextGamePass (rest day: next opponent and home/away, stub with start time and date, never torn).

### Row-scale Pass (일정)
The user's own game in the schedule list uses the same body, perforation and stub at row scale: card content on club field, then a stub with the score or start time at 34px and the stamp or inning on the right. It re-binds `--label-rgb` to on-field so shared card markup inverts without a second component. Other games are neutral game cards: 14px radius on the card colour, a meta line (time or result badge, venue), logos and 18px/900 names around a 28px score where the loser sits at 50%, then a 13px pitcher line and a highlight link. Finished games expand to a scoring panel (0.22s, ease-out-quint).

### Grouped Lists & Rows
- **Container:** card colour, 12px radius, 16px side margin, clipped.
- **Rows:** 17px body, 16px horizontal padding, min 52px; 0.5px separators inset to the text start; trailing 18px chevron in tertiary label; pressed state fills with `--fill`.
- **Leading icon tile:** 32px square, 8px radius, club field with an on-field 15–16px icon. Used for 하이라이트 보기, the lock-screen live score row, and the ticket-practice row.
- **Selection:** a 20px club-tint checkmark at weight 2.6 and the row label at 700. Destructive rows (탈퇴) use the loss red.
- **Section header/footer:** 13px secondary label, indented to 36px.

### Standings Table
A single card. 44px rows with 1px separators, the postseason cut as a dashed rule at label/35, rank and team columns sticky with a 1px inset edge. The user's row is painted club field across every cell with on-field text, 900-weight name and 700 figures; streaks lose their green/red there. Skeleton cells shimmer left to right.

### Postseason Bracket
A collapsible grouped card (summary row with 17px/600 title and 13px summary). Series rows show the round in 13px secondary label, the active round in club tint, Barlow Condensed series wins at 20px with the losing side at 42% opacity, and dashed placeholder discs for undecided slots.

### Navigation (Tab Bar)
Four tabs, 오늘 · 일정 · 순위 · MY, fixed to the bottom on `--bar` with a 0.5px top separator and safe-area padding. 24px line icons (ticket, calendar, ordered list, person) over 10px/600 labels, min 49px tall. The selected tab turns club tint with a 2.2 stroke; others are secondary label at 1.8. Pressed state drops to 60% opacity. No pill, no indicator bar.

### Buttons
- **On-field CTA:** on club-field screens (onboarding), a full-width 52px button at 14px radius in on-field colour with field-colour 17px/700 text (편파 알림 켜기). Pressed scales to 0.98.
- **Sheet button:** 48px, 12px radius, `--fill` background, 17px/600 club-tint text.
- **Round icon button:** 44px circle for back arrows and the bell, pressed at 60% opacity.

### Onboarding
Step 1 (team choice) is a plain grouped list on system ground under a large title. Steps 2–3 flood the whole screen with the chosen club's field and on-field text: step 2 lists caster voices on a white grouped card, step 3 previews two iOS-style notifications before the on-field CTA. Steps cross-fade (0.3s).

### Feed
쇼츠 carousel (see the Layout deviation): 14px-radius 9:16 thumbnails on black with a 48px black/55 play disc, 14px/600 two-line titles and 12px meta. News: 16:9 video thumbnails with a duration pill, 15px/600 titles. Section titles are Section Title type with nothing above them.

## Do's and Don'ts

### Do:
- **Do** paint exactly one club-colour object per screen region and keep everything else on system colours (The One Field Rule).
- **Do** read every club value from `lib/clubTheme.ts` via `--club-field`, `--club-stub`, `--club-on-field`, `--club-tint`; add a new use as a new verified field there, not a computed shade.
- **Do** set every stat figure in Barlow Condensed and every word and name in Pretendard, names at 800–900 with negative tracking.
- **Do** give any new pass the full anatomy: 18px body, notched perforation, stub that carries the state, torn edge and stamp when the game is over.
- **Do** build secondary content as inset grouped lists (12px radius, 52px rows, 0.5px inset separators, 32px club icon tiles).
- **Do** verify every new surface in both light and dark, and keep touch targets at 44px or more.
- **Do** honour reduced motion: the global rule collapses animations and transitions, so state must read without the stamp spring or the tear.

### Don't:
- **Don't** use the category's dark poster with a gradient glow, or a neutral scoreboard list, as the hero of a screen; the hero is the pass.
- **Don't** put club field on large titles, section headers, the tab bar, page backgrounds (onboarding steps 2–3 excepted) or ordinary buttons.
- **Don't** hard-code a club hex in a component, or reuse one club's tint on another club's field.
- **Don't** use Black Han Sans, a monospace face, or Pretendard for scores and times; don't set Korean words in Barlow Condensed.
- **Don't** put a tracked small-caps label above a section title or a large title; tracked 10px labels exist only as field labels inside the ticket.
- **Don't** add blur, glass, or resting shadows to bars, lists or cards; the ticket lift is the only resting shadow.
- **Don't** draw a perforation, stub or stamp on anything that is not a game or season pass.
- **Don't** add another horizontal carousel; the 쇼츠 rail is the single recorded exception.
