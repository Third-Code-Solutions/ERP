import type { MetadataRoute } from 'next'
import { publicUrl } from '@/lib/public-origin'

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: publicUrl('/'),
      changeFrequency: 'weekly',
      priority: 1,
    },
  ]
}
