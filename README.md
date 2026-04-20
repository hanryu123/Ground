# GROUND

KBO 10구단 매거진 커버 톤의 모바일 우선 앱. 응원 팀의 그날 경기·선발 투수를 풀스크린 히어로 카드로, AI(Replicate LoRA)로 즉석 생성한 9:16 화보를 배경으로 보여준다. 우천 시에는 자동으로 '수중전 모드'로 전환된다.

## Stack

- Next.js 16 (App Router, Turbopack)
- React 19
- Tailwind CSS 3.4
- Framer Motion
- Lucide React
- Replicate (LoRA img2img)
- OpenWeather (구장 위치 기반 실시간 날씨)

## Pages

- `/today` — 응원 팀의 오늘 경기를 풀스크린 히어로 카드로
- `/schedule` — 어제·오늘·내일 경기 리스트
- `/my` — 응원 팀 선택

## Run

```bash
npm install
cp .env.local.example .env.local   # 토큰/키 채우기
npm run dev
```

브라우저에서 [http://localhost:3000](http://localhost:3000) 을 열고 모바일 뷰(390x844)로 확인.

## Environment

`.env.local`에 아래 값을 채운다. 키가 비어 있어도 서비스는 fallback으로 정상 동작한다.

| 변수 | 용도 | 미설정 시 동작 |
|---|---|---|
| `REPLICATE_API_TOKEN` | LoRA 이미지 생성 | placeholder ref 이미지로 fallback |
| `REPLICATE_MODEL_VERSION` | 기본 LoRA 모델 | `config/teams.ts`의 팀별 `modelId` 사용 |
| `OPENWEATHER_API_KEY` | 구장 위치 날씨 조회 | `isRainy: false` (항상 맑음) |

## 디버그 쿼리

- `?director=1` — 디렉터 퀵 네비(10구단 즉시 전환) 강제 ON (`?director=0`로 OFF)
- `?forceWeather=rain` / `?forceWeather=clear` — 날씨 강제 오버라이드 (수중전 UI 검수)

## 디렉터리

```
app/
  layout.tsx           // 루트 + BottomNav
  page.tsx             // /today 리다이렉트
  today/page.tsx       // 응원 팀 히어로 카드
  schedule/page.tsx    // 어제/오늘/내일 일정
  my/page.tsx          // 응원 팀 선택
  api/
    generate/route.ts  // Replicate img2img 프록시 (mode/isRainy 분기)
    logos/route.ts     // /public/images/logos 매니페스트
    weather/route.ts   // OpenWeather 프록시 (force=rain|clear 디버그)

components/
  HeroCard.tsx         // 히어로 카드 (배경 / 슬로건 / 정보 / 수중전 배지)
  LogoImage.tsx        // 로고 (매니페스트 lookup + 텍스트 폴백)
  BottomNav.tsx        // 메인 탭 바
  DirectorNav.tsx      // dev/디렉터 퀵 스위처

config/
  teams.ts             // KBO 10구단 → modelId / triggerWord / 슬로건(ready·victory·rainy)

lib/
  teams.ts             // 팀 메타 (이름/컬러/매니페스토)
  games.ts             // mock 경기 데이터 (yesterday/today/tomorrow)
  stadiums.ts          // 10구단 홈구장 위경도
  useWeather.ts        // 구장별 싱글톤 캐시 훅
  useMyTeam.ts         // 응원 팀 영속화 훅 (localStorage)
  director.ts          // 디렉터 모드 토글 훅
  logoManifest.ts      // 로고 매니페스트 클라이언트 훅
  dailySlogan.ts       // (서버) 결정론적 일일 카피 풀
  replicate.ts         // 프롬프트 빌더 + 트리거 처리
```

## 슬로건 우선순위

`api/generate` 응답의 `sloganSource`로 노출:

1. **rainy** — `isRainy=true` AND `TEAM_CONFIG.sloganRainy` 존재
2. **daily** — `lib/dailySlogan.ts`의 결정론적 풀에서 픽
3. **fallback** — `TEAM_CONFIG.sloganReady` (또는 victory)
4. **none** — 슬로건 없음 → 클라가 `team.manifestoEn`으로 최종 폴백

## 레퍼런스 이미지 폴더 규칙

`public/images/refs/{ready,victory}/`에 jpg/png/webp 파일을 두면 자동 픽.

- 파일명에 `rain`/`rainy`/`rainny` 키워드 포함 → 우천 시 우선 사용
- 그 외 → 비 오지 않을 때 우선 사용
- 매칭 풀이 비면 전체 풀에서 fallback

## 로고 폴더 규칙

`public/images/logos/`에 파일을 떨어뜨리면 끝. 케이스/확장자 무관.

- 우선순위: SVG > PNG > WebP > JPG
- 케이스 무관 매칭 (`Lg.png`, `LG.png`, `lg.png` 모두 OK)
- 매칭 실패 시 → 텍스트 워드마크 폴백 (예: "KIA TIGERS"). 엑박 절대 안 뜸.
