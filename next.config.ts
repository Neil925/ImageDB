import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone", // single self-contained server (Docker image)
  serverExternalPackages: ["better-sqlite3", "sharp"], // native modules: keep out of bundling
  experimental: {
    serverActions: { bodySizeLimit: "32mb" },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
