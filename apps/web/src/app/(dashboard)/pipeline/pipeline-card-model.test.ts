import { describe, expect, it } from 'vitest'
import { pipelineClosingDate } from './pipeline-card-model'

describe('pipelineClosingDate', () => {
  it('preserves the Manila calendar date at a UTC boundary', () => {
    expect(pipelineClosingDate(new Date('2026-09-30T16:30:00.000Z'))).toBe('2026-10-01')
  })

  it('keeps an unset closing date empty', () => {
    expect(pipelineClosingDate(null)).toBeNull()
  })
})
