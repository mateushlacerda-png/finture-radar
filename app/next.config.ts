import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite carrega WASM e arquivos de dados em runtime; não deve ser empacotado.
  serverExternalPackages: ["@electric-sql/pglite"],
  turbopack: {
    // Fixa a raiz no app: com outro package-lock acima, o Next infere a raiz errada.
    root: path.resolve(__dirname),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
