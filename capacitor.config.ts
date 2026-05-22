import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor 설정
 *
 * server.url 방식: WebView가 Vercel 라이브 서버를 직접 로드.
 *   - API 라우트, 서버 액션, Prisma 등 모든 서버 기능이 그대로 동작.
 *   - /api/... 상대 경로 호출도 그대로 동작 (별도 URL 분기 불필요).
 *   - webDir은 Capacitor CLI가 필요로 하는 폴더이나 실제 서빙엔 사용 안 됨.
 *
 * 로컬 개발 시: server.url을 "http://localhost:3000" 으로 바꾸고 next dev 실행.
 */
const config: CapacitorConfig = {
  appId: "com.ground.kbo",
  appName: "Ground",
  webDir: "public",
  server: {
    url: "https://ground-alpha.vercel.app",
    cleartext: false,
    // 네이티브 앱에서 HTTPS origin 관련 쿠키/헤더 문제 방지
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
  },
  android: {
    // Android 13+ 알림 권한 런타임 요청을 자동 처리
    allowMixedContent: false,
  },
};

export default config;
