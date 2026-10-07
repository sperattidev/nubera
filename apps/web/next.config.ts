import path from "node:path";
import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Solo tiene efecto por HTTPS; los navegadores lo ignoran en conexiones sin cifrar.
  { key: "Strict-Transport-Security", value: "max-age=31536000" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  output: "standalone",
  // Raíz del monorepo: el build "standalone" incluye los paquetes del workspace.
  outputFileTracingRoot: path.join(import.meta.dirname, "../.."),
  // Los paquetes internos se publican como TypeScript, sin compilar.
  transpilePackages: ["@nubera/core"],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default config;
