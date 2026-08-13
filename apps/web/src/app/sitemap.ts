import type { MetadataRoute } from 'next'
import { publicUrl } from '@/lib/public-origin'

export const dynamic = 'force-dynamic'

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: publicUrl('/'),
      changeFrequency: 'weekly',
      priority: 1,
    },
  ]
}
