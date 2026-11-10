import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone", // single self-contained server (Docker image)
  serverExternalPackages: ["pg", "pg-boss", "sharp", "better-auth"], // native/db modules: keep out of bundling
  experimental: {
    serverActions: { bodySizeLimit: "50mb" }, // must be >= MAX_UPLOAD_BYTES
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
