/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      // Replicate generated image CDN
      { protocol: "https", hostname: "replicate.delivery" },
      { protocol: "https", hostname: "*.replicate.delivery" },
      { protocol: "https", hostname: "pbxt.replicate.delivery" },
    ],
  },
};

export default nextConfig;
