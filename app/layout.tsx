import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Analytics } from "@vercel/analytics/next";
import AppChrome from "@/components/AppChrome";
import { KBO_TEAMS } from "@/config/teams";

const PRETENDARD_CSS =
  "https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css";

/**
 * 첫 페인트 전에 응원팀 배경색을 입힌다.
 * HeroCard 의 useEffect 가 돌기 전까지 검정 → 팀색으로 바뀌는 깜빡임을 없애기 위함.
 * 온보딩 전이거나 /today 가 아닌 탭으로 진입하면 기존처럼 검정을 유지한다.
 */
const TEAM_THEME_BOOT = Object.fromEntries(
  Object.entries(KBO_TEAMS).map(([id, t]) => [id, [t.primary, t.text, t.secondary]])
);
const themeBootScript = `(function(){try{var p=location.pathname;if(p!=="/"&&p.indexOf("/today")!==0)return;if(localStorage.getItem("ground-onboarding-complete")!=="1")return;var id=(localStorage.getItem("kbo-my-team")||"").toUpperCase();var t=${JSON.stringify(TEAM_THEME_BOOT)}[id];if(!t)return;var s=document.documentElement.style;s.setProperty("--app-bg",t[0]);s.setProperty("--app-text",t[1]);s.setProperty("--app-accent",t[2]);}catch(e){}})();`;

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
  themeColor: "#000000",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <head>
        {/* 글꼴 CSS 를 globals.css @import 대신 여기서 바로 요청 — 메인 CSS 를 받은 뒤에야 발견되던 직렬 대기 제거 */}
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="anonymous" />
        <link rel="stylesheet" href={PRETENDARD_CSS} />
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body
        className="bg-black text-white"
        style={{
          backgroundColor: "var(--app-bg, #000000)",
          color: "var(--app-text, #ffffff)",
        }}
      >
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
