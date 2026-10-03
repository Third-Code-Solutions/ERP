import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'ABI OPS',
    short_name: 'ABI OPS',
    description:
      'Connected construction operations, enterprise workflows, and permission-aware intelligence.',
    // 'id' pins the installed app to this origin+start_url so a future change to
    // start_url does not register as a second installation.
    id: '/dashboard',
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#0e1116',
    theme_color: '#145f40',
    icons: [
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
      {
        src: '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        // Maskable icons are cropped to the platform's shape, so the mark is
        // inset inside the safe zone rather than drawn edge to edge.
        src: '/icons/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  }
}
