import path from "node:path";
import type { NextConfig } from "next";

const baseHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

// El panel y la página pública no se pueden meter en un marco ajeno; el reproductor incrustable sí.
const securityHeaders = [...baseHeaders, { key: "X-Frame-Options", value: "DENY" }];
const embedHeaders = [...baseHeaders, { key: "Content-Security-Policy", value: "frame-ancestors *" }];

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  output: "standalone",
  // Raíz del monorepo: el build "standalone" incluye los paquetes del workspace.
  outputFileTracingRoot: path.join(import.meta.dirname, "../.."),
  // Los paquetes internos se publican como TypeScript, sin compilar.
  transpilePackages: ["@nubera/core"],
  async headers() {
    return [
      { source: "/((?!embed/).*)", headers: securityHeaders },
      { source: "/embed/:path*", headers: embedHeaders },
    ];
  },
};

export default config;
