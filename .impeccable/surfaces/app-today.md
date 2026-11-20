---
version: 1
slug: "app-today"
primary_target: "app/today"
related_targets: ["app/schedule","app/rank","app/my","components/OnboardingFlow.tsx","components/NotificationBell.tsx"]
---

# Surface: Ground app (TODAY · SCHEDULE · RANK · MY · notification sheet · onboarding)

Scope: every in-app screen in `app/today`, `app/schedule`, `app/rank`, `app/my`, `components/` shell, bell sheet and onboarding. Excludes `/download` and `/admin`.
Mode: Operate. Build path: code-led (no image generation).
Audience/job: one-team KBO fans, arriving from a lock-screen alert or keeping the app open beside the broadcast. They need the state of their team's game in about a second, then schedule, standings and alert settings.
Constraints: club colour theming is binding for all 10 clubs; iOS-native structure (tab bar, large titles, grouped lists, sheets, 44pt targets, safe areas, light + dark appearance, Reduce Motion); real data only; no deploy during a live game.
Font decision (user, 2026-11-20): Pretendard for all Korean/UI text at heavy weights for names; Barlow Condensed for every figure (scores, times, serials, ERA, ranks, records). Not Black Han Sans, not system mono.

## Direction contract

THESIS: Every game is a ticket in your club's colour. The app refuses the category's dark poster with a gradient glow and the neutral scoreboard list; it hands you the one pass that matters today, printed from your side.

OWN-WORLD: iOS grouped-list shell (systemGroupedBackground light / pure black dark) with exactly one club-colour field per screen: the ticket. Ticket = 18px-radius pass in club primary with a darker stub below a perforation (dashed rule + half-circle notches cut to the ground colour), segmented slots with tiny tracked labels, Barlow Condensed figures, Pretendard 800–900 names. Chrome stays system: native-style tab bar, large titles, inset grouped rows, SF-style sheets. Tones come from one ramp per club derived from its primary.

STORY: Fan taps an alert → TODAY opens on today's ticket: who, score or start time, inning, series stakes, starters. Final games get the stub torn with a 승/패 stamp. They glance at highlights/news below, swipe to SCHEDULE where past games are torn stubs and future ones are numbered tickets, check RANK where their row is the ticket colour, and change voice/team in MY.

FIRST VIEWPORT: Large title "오늘" + date line, bell button top-right (44pt). Ticket fills ~55% of the 390×844 screen: header strip (round · serial No.), matchup with logos and names, series/stakes chip, starter slots, perforation, stub with time or score+inning and venue. Below: grouped "하이라이트" list. Tab bar: 오늘 · 일정 · 순위 · MY. Primary action: tapping the ticket opens the game detail (lineups/scoring).

FORM: Direction 1 of 7 ordered list position 5 (직관 티켓), assigned by roll; raises from factory catalog (season serial numbers), zoo map (one dominant colour field per screen), darkroom (single tonal ramp per club), design annual (strict hairline/tabular grid in standings). seed:2fb68f9908a09a79

Signature move: the perforation. Before the game the stub holds the start time; live, the stub becomes the scoreline with inning; final, the stub tears away a few points and carries a 승/패 stamp. Schedule renders the same pass at row scale.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
