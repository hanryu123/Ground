import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor 설정
 *
 * ── server.url 방식 ─────────────────────────────────────────────────────────
 *  Next.js는 API 라우트·서버 액션이 있어 정적 export 불가.
 *  WebView가 원격 URL(Vercel 또는 로컬 dev 서버)을 직접 로드한다.
 *  /api/... 상대 경로 호출이 그대로 동작하므로 별도 URL 분기 불필요.
 *
 * ── 환경 분기 ────────────────────────────────────────────────────────────────
 *  개발 (시뮬레이터/실기기 USB):
 *    CAPACITOR_ENV=development npx cap run ios
 *    → http://localhost:3000 (npm run dev 가 먼저 실행 중이어야 함)
 *    → iOS 시뮬레이터는 Mac의 localhost에 직접 접근 가능.
 *    → 실기기 USB 연결 시에도 Mac의 IP 대신 localhost 터널링이 동작함.
 *
 *  프로덕션 (앱스토어 빌드 / TestFlight):
 *    npx cap run ios   (CAPACITOR_ENV 미설정 or "production")
 *    → https://ground-alpha.vercel.app
 */
const isDev = process.env.CAPACITOR_ENV === "development";

const config: CapacitorConfig = {
  appId: "com.ground.kbo",
  appName: "Ground",
  webDir: "public",
  server: isDev
    ? {
        // ── 로컬 개발 모드 ──────────────────────────────────────────────────
        url: "http://localhost:3000",
        cleartext: true, // HTTP 허용 (시뮬레이터/개발 전용)
        allowNavigation: ["localhost"],
      }
    : {
        // ── 프로덕션 모드 (Vercel 라이브) ───────────────────────────────────
        url: "https://ground-alpha.vercel.app",
        cleartext: false,
        allowNavigation: ["ground-alpha.vercel.app"],
      },
  plugins: {
    PushNotifications: {
      // 포그라운드에서 알림이 오면 배지·사운드·배너 모두 표시
      presentationOptions: ["badge", "sound", "alert"],
    },
    SplashScreen: {
      launchShowDuration: 0,
    },
  },
  ios: {
    contentInset: "always",
    // 개발 중 WKWebView 인스펙터 허용
    allowsLinkPreview: false,
  },
  android: {
    allowMixedContent: isDev, // 개발 시 HTTP 허용, 프로덕션은 false
  },
};

export default config;
