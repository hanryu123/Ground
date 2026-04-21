import type { Metadata, Viewport } from "next";
import "./globals.css";
import BottomNav from "@/components/BottomNav";
import OnboardingGate from "@/components/OnboardingGate";

export const metadata: Metadata = {
  title: "KBO TODAY",
  description: "오늘의 KBO 야구 일정과 선발 투수",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#000000",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body className="bg-black text-white">
        {/*
          OnboardingGate 가 최상단에서 응원팀 미선택 사용자를 가로챈다.
          팀이 선택되어 있지 않으면 children(전체 라우트 + BottomNav)이 렌더되지 않고
          풀스크린 팀 선택 화면이 우선된다.
        */}
        <OnboardingGate>
          <div className="mx-auto flex h-dvh max-h-dvh min-h-0 w-full max-w-md flex-col overflow-hidden bg-black">
            <main className="flex min-h-0 flex-1 flex-col overflow-y-auto pb-24">
              {children}
            </main>
            <BottomNav />
          </div>
        </OnboardingGate>
      </body>
    </html>
  );
}
