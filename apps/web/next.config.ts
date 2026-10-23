import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@dossipv/engine'],
  experimental: {
    // Uploads are validated against a 10 MB cap per file in the actions; an equipment form carries up
    // to two files (datasheet + homologation document). Leave headroom for multipart overhead.
    serverActions: { bodySizeLimit: '21mb' },
  },
};

export default nextConfig;
