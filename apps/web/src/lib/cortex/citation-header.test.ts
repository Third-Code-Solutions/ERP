import { describe, expect, it } from 'vitest'
import {
  decodeCortexCitationHeader,
  encodeCortexCitationHeader,
  normalizeCortexCitations,
} from './citation-header'

const PROJECT_ID = '11111111-1111-4111-8111-111111111111'

function citation(index: number) {
  const suffix = String(index).padStart(12, '0')
  return {
    nodeId: `22222222-2222-4222-8222-${suffix}`,
    nodeType: 'project',
    refTable: 'projects',
    refId: `33333333-3333-4333-8333-${suffix}`,
    title: `MEP Project ${index} — Metro Manila`,
    projectId: PROJECT_ID,
  }
}

describe('Cortex citation response header', () => {
  it('round-trips UTF-8 citation data', () => {
    const encoded = encodeCortexCitationHeader([citation(1)])

    expect(decodeCortexCitationHeader(encoded)).toEqual([citation(1)])
  })

  it('bounds the response header to eight citations and short titles', () => {
    const encoded = encodeCortexCitationHeader(
      Array.from({ length: 12 }, (_, index) => ({
        ...citation(index),
        title: 'A'.repeat(500),
      }))
    )
    const decoded = decodeCortexCitationHeader(encoded)

    expect(decoded).toHaveLength(8)
    expect(decoded[0]?.title).toHaveLength(80)
    expect(encoded.length).toBeLessThan(6_000)
  })

  it('fails closed for malformed, oversized, or invalid structures', () => {
    expect(decodeCortexCitationHeader('not-base64')).toEqual([])
    expect(decodeCortexCitationHeader('A'.repeat(6_001))).toEqual([])
    expect(
      normalizeCortexCitations([
        { ...citation(1), refId: 'not-a-uuid' },
        citation(2),
      ])
    ).toEqual([citation(2)])
  })
})
