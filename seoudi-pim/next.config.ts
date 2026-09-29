import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["exceljs", "bcryptjs"],
  experimental: {
    serverActions: { bodySizeLimit: "20mb" },
  },
  images: { unoptimized: true },
};

export default nextConfig;
