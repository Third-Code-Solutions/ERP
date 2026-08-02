import { describe, expect, it } from 'vitest'
import {
  hashCortexText,
  redactCortexMessages,
  redactCortexText,
} from './redaction'

describe('Cortex prompt redaction', () => {
  it('removes common direct identifiers while preserving useful context', () => {
    const result = redactCortexText(
      'Contact jane@example.com about TIN 123-456-789 and call +639171234567 for the 3F fit-out.'
    )

    expect(result).toContain('3F fit-out')
    expect(result).not.toContain('jane@example.com')
    expect(result).not.toContain('123-456-789')
    expect(result).not.toContain('+639171234567')
    expect(result).toContain('[email redacted]')
    expect(result).toContain('[tax id redacted]')
    expect(result).toContain('[phone redacted]')
  })

  it('redacts every prompt turn without changing its role', () => {
    expect(
      redactCortexMessages([
        { role: 'user', content: 'jane@example.com' },
        { role: 'assistant', content: 'No sensitive data here.' },
      ])
    ).toEqual([
      { role: 'user', content: '[email redacted]' },
      { role: 'assistant', content: 'No sensitive data here.' },
    ])
  })

  it('provides a stable non-reversible audit hash', () => {
    const one = hashCortexText('same question')
    expect(one).toHaveLength(64)
    expect(one).toBe(hashCortexText('same question'))
    expect(one).not.toBe(hashCortexText('different question'))
  })
})
