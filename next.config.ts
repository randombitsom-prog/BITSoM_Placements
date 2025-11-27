import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack: (config, { isServer }) => {
    // Exclude Placement Portal Design folder from webpack compilation
    config.watchOptions = {
      ...config.watchOptions,
      ignored: [
        ...(Array.isArray(config.watchOptions?.ignored) 
          ? config.watchOptions.ignored 
          : [config.watchOptions?.ignored].filter(Boolean)),
        '**/Placement Portal Design/**',
      ],
    };
    return config;
  },
  // Exclude from TypeScript checking (already done in tsconfig.json, but adding here for safety)
  typescript: {
    ignoreBuildErrors: false,
  },
};

export default nextConfig;
