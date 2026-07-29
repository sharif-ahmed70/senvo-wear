import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@senvo/contracts", "@senvo/ui"],
};

export default nextConfig;
