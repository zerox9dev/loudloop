import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

const nextConfig: NextConfig = {
  // Personal dashboard: every page reads live DB state, so we keep the classic dynamic model.
  // media uploads (reels) go through a server action and the auth proxy
  experimental: { serverActions: { bodySizeLimit: '210mb' }, proxyClientMaxBodySize: '210mb' },
  devIndicators: false,
  serverExternalPackages: ['sharp', 'bullmq', 'ioredis', 'postgres'],
  turbopack: {
    rules: {
      '*.css': {
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
  },
};

export default withNextIntl(nextConfig);
