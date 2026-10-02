import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    "127.0.0.1",
    "localhost",
    "10.15.14.189",
    "192.168.0.112",
  ],
  transpilePackages: ["@senvo/contracts", "@senvo/ui"],
};

export default nextConfig;
