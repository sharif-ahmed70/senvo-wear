import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Admin browser requests stay same-origin so workforce bearer/CSRF material can
  // remain server-side. The proxy forwards them to SENVO_ADMIN_API_UPSTREAM_URL.
  env: {
    NEXT_PUBLIC_SENVO_API_URL: "/api/admin",
  },
  transpilePackages: ["@senvo/contracts", "@senvo/ui"],
};

export default nextConfig;
