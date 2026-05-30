import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Analytics } from "@vercel/analytics/next";
import AppChrome from "@/components/AppChrome";

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
