import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Make sure the parsed rulebooks ship with the serverless function.
  outputFileTracingIncludes: { "/api/ask": ["./data/rules/**/*"] },
};

export default nextConfig;
