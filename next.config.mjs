import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "replicate.delivery" },
      { protocol: "https", hostname: "*.replicate.delivery" },
      { protocol: "https", hostname: "pbxt.replicate.delivery" },
    ],
  },
  turbopack: {
    // 홈 디렉토리의 package-lock.json이 감지되어 루트가 잘못 잡히는 문제 수정
    root: __dirname,
  },
  // firebase-admin 등 Node.js 전용 패키지를 서버 외부(번들링 제외)로 처리
  serverExternalPackages: ["firebase-admin"],
  // 앱 시작 URL("/") → /today 를 HTTP 단계에서 바로 넘긴다.
  // page.tsx 의 redirect() 는 JS 로딩 후 RSC 요청을 한 번 더 하는 클라이언트 이동이라 첫 화면이 늦었다.
  async redirects() {
    return [{ source: "/", destination: "/today", permanent: false }];
  },
};

export default nextConfig;
