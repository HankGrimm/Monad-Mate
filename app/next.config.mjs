/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  reactStrictMode: true,
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
