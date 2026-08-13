import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'ABI OPS',
    short_name: 'ABI OPS',
    description:
      'Connected construction operations, enterprise workflows, and permission-aware intelligence.',
    start_url: '/',
    display: 'standalone',
    background_color: '#0e1116',
    theme_color: '#145f40',
    icons: [
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
      },
    ],
  }
}
