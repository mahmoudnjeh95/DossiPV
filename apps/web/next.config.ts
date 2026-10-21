import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@dossipv/engine'],
  experimental: {
    // Bill photos are validated against a 10 MB cap in the action; leave headroom for multipart overhead.
    serverActions: { bodySizeLimit: '11mb' },
  },
};

export default nextConfig;
