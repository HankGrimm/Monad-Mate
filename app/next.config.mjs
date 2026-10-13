/** @type {import('next').NextConfig} */
const basePath = "/app";

const nextConfig = {
  output: "standalone",
  reactStrictMode: true,
  // 挂在 landing 的 /app 路由下（经 rewrites 转发），资源/路由自动带 /app 前缀，
  // 避免与 landing 的 /_next 静态资源冲突
  basePath,
  // Next.js 会自动把 basePath 加到 rewrites 的 source 上（实际匹配
  // /app/api/:path*），但**不会**加到手写 fetch 的 URL 上。把 basePath
  // 注入给前端，让 lib/api.ts 拼出带前缀的路径，避免两处各写一份而走偏。
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
  },
  images: {
    unoptimized: true,
  },
  // Proxy API calls through the app's own origin so the browser never needs
  // CORS and the backend URL stays a server-side concern.
  //
  // BACKEND_ORIGIN is read at request time (not build time) so the same image
  // works locally (localhost:8000) and in compose (http://api:9999).
  async rewrites() {
    const backend = process.env.BACKEND_ORIGIN ?? "http://localhost:8000";
    return [
      {
        source: "/api/:path*",
        destination: `${backend}/:path*`,
      },
    ];
  },
};

export default nextConfig;
