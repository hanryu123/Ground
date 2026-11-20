import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Analytics } from "@vercel/analytics/next";
import { Barlow_Condensed } from "next/font/google";
import AppChrome from "@/components/AppChrome";
import { clubCssVars } from "@/lib/clubTheme";
import { TEAMS } from "@/lib/teams";

const PRETENDARD_CSS =
  "https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css";

/** 숫자(점수·시간·번호·기록) 전용 — 전광판 압축체. 본문은 Pretendard */
const numFont = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-num",
  display: "swap",
});

/**
 * 첫 페인트 전에 응원팀 색(--club-*)을 입힌다 — 티켓·탭 강조가 기본색으로 한 번 그려졌다 바뀌는 깜빡임 방지.
 * AppChrome 도 같은 값을 다시 넣는다 (팀을 바꿨을 때).
 */
const CLUB_BOOT = Object.fromEntries(TEAMS.map((t) => [t.id, clubCssVars(t.id)]));
const themeBootScript = `(function(){try{var id=localStorage.getItem("kbo-my-team")||"";var v=${JSON.stringify(CLUB_BOOT)}[id];if(!v)return;var s=document.documentElement.style;for(var k in v)s.setProperty(k,v[k]);}catch(e){}})();`;

export const metadata: Metadata = {
  title: "내 팀을 위한 극단적 편파 알림 GROUND",
  description:
    "라인업부터 실시간 편파 중계, 하이라이트까지, 내 팀의 결정적 순간을 전해드릴게요.",
  openGraph: {
    title: "내 팀을 위한 극단적 편파 알림 GROUND",
    description:
      "라인업부터 실시간 편파 중계, 하이라이트까지, 내 팀의 결정적 순간을 전해드릴게요.",
    siteName: "GROUND",
  },
  twitter: {
    title: "내 팀을 위한 극단적 편파 알림 GROUND",
    description:
      "라인업부터 실시간 편파 중계, 하이라이트까지, 내 팀의 결정적 순간을 전해드릴게요.",
  },
  applicationName: "GROUND",
  icons: {
    icon: [
      {
        url: "/icons/favicon-32x32.png",
        sizes: "32x32",
        type: "image/png",
      },
    ],
    apple: [
      {
        url: "/icons/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  },
  appleWebApp: {
    capable: true,
    title: "GROUND",
    statusBarStyle: "black-translucent",
  },
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  interactiveWidget: "resizes-content",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f2f2f7" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko" className={numFont.variable}>
      <head>
        {/* 글꼴 CSS 를 globals.css @import 대신 여기서 바로 요청 — 메인 CSS 를 받은 뒤에야 발견되던 직렬 대기 제거 */}
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="anonymous" />
        <link rel="stylesheet" href={PRETENDARD_CSS} />
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body>
        {/*
          AppChrome 이 일반 앱 라우트와 어드민 라우트의 쉘을 분리한다.
          일반 앱에서는 OnboardingGate 가 응원팀 미선택 사용자를 가로챈다.
          팀이 선택되어 있지 않으면 children(전체 라우트 + BottomNav)이 렌더되지 않고
          풀스크린 팀 선택 화면이 우선된다.
        */}
        <Analytics />
        <AppChrome>{children}</AppChrome>
      </body>
    </html>
  );
}
