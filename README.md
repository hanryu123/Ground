# KBO TODAY

KBO 야구 일정과 선발 투수를 한눈에 보여주는 모바일 우선 미니멀 앱.

## Stack
- Next.js 15 (App Router)
- React 19
- Tailwind CSS 3.4
- Framer Motion 11
- Lucide React

## Pages
- `/today` — 풀스크린 카드 + 인스타 스토리 형태의 경기 스위처
- `/schedule` — 어제/오늘/내일 경기 리스트
- `/my` — 응원 팀 선택 (KBO 10개 구단)

## Run

```bash
npm install
npm run dev
```

브라우저에서 [http://localhost:3000](http://localhost:3000) 을 열고 모바일 뷰(390x844)로 확인하세요.

## 디자인 시스템
- **컬러**: 완전한 블랙(#000000) 배경, 화이트 텍스트, 다크 그레이 포인트.
- **폰트**: Pretendard / SF Pro 폴백, 굵고 명확한 산세리프.
- **레이아웃**: `100dvh` 기반 모바일 풀스크린, 테두리 라인 제거.

## 디렉터리

```
app/
  layout.tsx        // 루트 + 바텀 네비게이션
  page.tsx          // /today 리다이렉트
  today/page.tsx
  schedule/page.tsx
  my/page.tsx
components/
  BottomNav.tsx
  StoryBar.tsx
  GameCard.tsx
lib/
  teams.ts          // KBO 10개 구단
  games.ts          // mock 경기 데이터
```

## TODO
- AI 생성 이미지 카드 배경 연동
- SCHEDULE 무한 스크롤 실제 데이터 fetch
- TODAY 카드 좌우 스와이프 제스처
