import type { NextConfig } from 'next';

/**
 * Sent with every response. Reset, verification and invitation links carry a one-time token in
 * their URL: `same-origin` keeps it from ever being passed on in a Referer header. No CSP on
 * purpose: the map libraries (Leaflet, Mapbox tiles) and Next's own scripts need a wider policy
 * than is worth maintaining here.
 */
const SECURITY_HEADERS = [
  { key: 'Referrer-Policy', value: 'same-origin' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  // The map's "Je suis sur place" button needs the position; nothing else needs any of these.
  { key: 'Permissions-Policy', value: 'geolocation=(self), camera=(), microphone=()' },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@dossipv/engine'],
  experimental: {
    // Uploads are validated against a 10 MB cap per file in the actions; an equipment form carries up
    // to two files (datasheet + homologation document). Leave headroom for multipart overhead.
    serverActions: { bodySizeLimit: '21mb' },
  },
  headers() {
    return Promise.resolve([{ source: '/:path*', headers: SECURITY_HEADERS }]);
  },
};

export default nextConfig;
