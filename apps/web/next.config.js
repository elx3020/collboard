/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable standalone output for Docker deployments
  // Produces a minimal self-contained build in .next/standalone
  output: 'standalone',

  // Image optimization
  images: {
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    imageSizes: [16, 32, 48, 64, 96, 128, 256],
    remotePatterns: [
      // GitHub/Google avatar CDNs
      { protocol: 'https', hostname: 'avatars.githubusercontent.com' },
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
      // Landing page screenshots
      { protocol: 'https', hostname: 'tailwindcss.com' },
    ],
  },

  // Enable experimental optimizations
  experimental: {
    optimizePackageImports: ['@heroicons/react', '@headlessui/react', 'clsx'],
  },
};

export default nextConfig;
