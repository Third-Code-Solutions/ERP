import type { MetadataRoute } from 'next'
import { publicUrl } from '@/lib/public-origin'

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
        '/client',
        '/cortex',
        '/crm',
        '/dashboard',
        '/documents',
        '/inspection',
        '/invoices',
        '/permits',
        '/pipeline',
        '/portal',
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
