# Product

<!-- impeccable:product-schema 1 -->

## Platform

ios

## Stack

Next.js 16 (App Router) + Tailwind + framer-motion, wrapped in Capacitor 8 for iOS. The iOS app loads the production web app (`server.url` → https://ground-alpha.vercel.app), so a web deploy reaches installed apps without an App Store release. Native pieces: push (APNs/FCM), iOS Live Activity. The design language targets iOS-native feel even though screens are rendered by the web app.

## Users

KBO fans who follow one team. About 100 users as of November 2026, mostly fans of KIA, Samsung, LG, KT and other KBO clubs. They use Ground in two equally common situations:

- They can't watch the game (work, school, commute) and follow it through lock-screen alerts and the Live Activity score, opening the app briefly from a notification.
- They watch the game on TV or a stream and keep Ground open beside it for biased reactions, scoring plays, schedule and standings.

## Product Purpose

Ground tells a fan what is happening to their team, from their team's side. Score alerts, pregame previews and postgame reports are written as if by a fellow fan or a biased caster, not a neutral scoreboard. Success is a fan who keeps alerts on all season because the alerts feel like their own team's voice.

## Positioning

"내 팀을 위한 극단적 편파 알림" — extreme one-team bias. The same play reaches each team's fans with opposite emotion: a comeback is celebration for one side and anguish for the other. Fans choose the voice of their score alerts from five styles (담백한 해설위원, 골수팬, 열혈 캐스터, 호랑이 감독, 일론 머스크).

## Operating Context

- Season rhythm: regular season (late March to early October), postseason (wild card → 준PO → PO → 한국시리즈), offseason (club news only).
- Game-day flow: pregame preview about an hour before first pitch → game-start alert → live score alerts and Live Activity → postgame report.
- Push notifications deep-link into the app (`/today`, `/my#caster-style`).
- Data comes from the KBO official site first, with Naver as backup. Highlights come from YouTube.

## Capabilities and Constraints

- Tabs: TODAY (game hero card, highlight shorts, team news, postseason ticket-practice card), SCHEDULE (weekly swipe calendar, month sheet, day games with starters), RANK (standings, postseason bracket). MY (team choice, alert voice, Live Activity recovery) is reached from the TODAY hero card.
- Onboarding: pick team → pick alert voice → turn on notifications. A welcome alert is sent in the chosen voice.
- Notification preferences live in a bell sheet. Scoring alerts deep-link to the voice picker.
- `/download` is the public landing page. `/admin` is internal and out of scope for app design.
- Constraints: no deploys during a live game. Claude spend stays under $10/month. Data cost stays at or below ₩100,000/month. No IP evasion against Naver. Cron jobs are not changed without the owner's say.
- One team per user. Changing team is allowed in MY.

## Brand Commitments

- Name: Ground (wordmark "GROUND"). Tagline: "내 팀을 위한 극단적 편파 알림".
- Team color theming is binding: the app takes on the chosen club's colors.
- Voice: Korean, playful and partisan. Alerts use the five selectable caster voices. Profanity appears only as "(삐-)".
- Promotional material must not use real players' likeness or club logos/uniforms. In-app team logos are existing assets.

## Evidence on Hand

- Real live data: schedules, scores, standings, starters, lineups, highlights, news.
- About 100 users. No testimonials, press, ratings or usage statistics exist yet, so none may be invented.

## Product Principles

1. Partisan first: every surface speaks from the user's team's side, never as a neutral scoreboard.
2. Glanceable in seconds: someone arriving from a notification must get the state of their game immediately.
3. Live truth over decoration: scores, series records and stats are always real data, never filler.
4. Season-aware: the app has something honest to show in the regular season, postseason and offseason.
5. Quiet when nothing is happening: no false urgency on off days.
