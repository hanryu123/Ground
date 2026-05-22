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
};

export default nextConfig;
