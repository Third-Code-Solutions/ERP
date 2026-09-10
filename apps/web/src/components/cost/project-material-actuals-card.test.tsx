import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ProjectMaterialActualsCard } from './project-material-actuals-card'
import type { ProjectMaterialActualsResult } from '@third-code-erp/shared-types'

const result: ProjectMaterialActualsResult = {
  projectId: '33333333-3333-4333-8333-333333333333',
  asOf: '2026-09-10T00:00:00.000Z',
  currency: 'PHP',
  status: 'ready',
  rows: [
    {
      materialItemId: '44444444-4444-4444-8444-444444444444',
      code: 'MAT-001',
      description: 'Concrete',
      unit: 'm3',
      receivedQuantityMicros: 10_000_000,
      issuedQuantityMicros: 4_000_000,
      receivedValueCents: 250_000,
      issuedValueCents: 100_000,
      receiptLineCount: 1,
      issueLineCount: 1,
      remainingQuantityMicros: 6_000_000,
      remainingValueCents: 150_000,
      notes: [],
    },
  ],
  totals: {
    receiptCount: 1,
    issueCount: 1,
    receiptLineCount: 1,
    issueLineCount: 1,
    receivedQuantityMicros: 10_000_000,
    issuedQuantityMicros: 4_000_000,
    receivedValueCents: 250_000,
    issuedValueCents: 100_000,
    remainingQuantityMicros: 6_000_000,
    remainingValueCents: 150_000,
  },
  notes: ['Inventory issue value is operational evidence.'],
}

describe('ProjectMaterialActualsCard', () => {
  it('shows separate receipt and issue evidence', () => {
    const markup = renderToStaticMarkup(<ProjectMaterialActualsCard result={result} />)
    expect(markup).toContain('Inventory actuals')
    expect(markup).toContain('₱2,500.00')
    expect(markup).toContain('₱1,000.00')
    expect(markup).toContain('Operational evidence only')
  })
})
