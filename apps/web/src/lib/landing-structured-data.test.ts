import { describe, expect, it } from 'vitest'
import { buildLandingStructuredData } from './landing-structured-data'

describe('landing structured data', () => {
  it('describes one connected, crawlable product graph', () => {
    const data = buildLandingStructuredData('https://example.test/', [
      { question: 'What does it connect?', answer: 'Projects and evidence.' },
    ])
    const graph = data['@graph']

    expect(graph.map((item) => item['@type'])).toEqual([
      'Organization',
      'WebSite',
      'WebPage',
      'SoftwareApplication',
      'FAQPage',
    ])

    const website = graph[1]!
    const webpage = graph[2]!
    const software = graph[3]!
    const faq = graph[4]!

    expect(website.url).toBe('https://example.test/')
    expect(webpage.inLanguage).toBe('en-PH')
    expect(webpage.primaryImageOfPage).toContain(
      '/images/third-code-erp-hero.png'
    )
    expect(software.areaServed).toEqual({
      '@type': 'Country',
      name: 'Philippines',
    })
    expect(faq.mainEntity).toHaveLength(1)
  })
})
