import type { NextConfig } from "next";
import { parserTraceIncludes } from "./scripts/deployment-tracing.ts";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  outputFileTracingIncludes: {
    "/api/resume/extract": parserTraceIncludes(process.cwd()),
  },
};

export default nextConfig;
