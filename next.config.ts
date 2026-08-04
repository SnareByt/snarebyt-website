import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Spotify embeds and R2 assets are the only external origins we allow.
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'i.scdn.co' },
      { protocol: 'https', hostname: '*.spotifycdn.com' },
      { protocol: 'https', hostname: 'cdn.snarebyt.com' },
    ],
  },
  // 2GB stems never go through the server, but briefs and images do.
  experimental: { serverActions: { bodySizeLimit: '8mb' } },
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default nextConfig;
