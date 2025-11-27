import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Exclude Placement Portal Design folder from build
  // This folder is a separate React/Vite project and not part of the Next.js app
  // It's already excluded in tsconfig.json, but we also exclude it from page detection
  pageExtensions: ['ts', 'tsx', 'js', 'jsx'],
};

export default nextConfig;
