import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Third Code ERP',
    short_name: 'Third Code ERP',
    description:
      'Connected construction operations, enterprise workflows, and permission-aware intelligence.',
    start_url: '/',
    display: 'standalone',
    background_color: '#07131f',
    theme_color: '#07131f',
    icons: [
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
      },
    ],
  }
}
