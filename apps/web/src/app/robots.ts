import type { MetadataRoute } from 'next'
import { publicUrl } from '@/lib/public-origin'

export const dynamic = 'force-dynamic'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/admin',
        '/api',
        '/auth',
        '/bom',
        '/claims',
        '/cortex',
        '/crm',
        '/dashboard',
        '/documents',
        '/inspection',
        '/invoices',
        '/permits',
        '/pipeline',
        // Token-addressed client pages (/portal/bom/<token>) are unguessable
        // and must never be indexed, so the whole prefix stays excluded.
        '/portal',
        '/platform-admin',
        '/procurement',
        '/projects',
        '/punchlist',
        '/purchase-orders',
        '/reports',
        '/settings',
        '/tasks',
        '/warranty',
        '/weekly-report',
      ],
    },
    sitemap: publicUrl('/sitemap.xml'),
  }
}
