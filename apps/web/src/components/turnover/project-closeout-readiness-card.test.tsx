import React from 'react'
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ProjectCloseoutReadinessResult } from '@third-code-erp/shared-types'
import { ProjectCloseoutReadinessCard } from './project-closeout-readiness-card'

const RESULT: ProjectCloseoutReadinessResult = {
  projectId: '33333333-3333-4333-8333-333333333333',
  asOf: '2026-09-10T00:00:00.000Z',
  status: 'partial',
  bonds: { total: 1, refunded: 0, open: 1, rows: [] },
  retention: { invoiceCount: 2, retainedCentavos: 125000, allocatedCentavos: 100000, openCentavos: 25000 },
  pnlCloseoutStatus: 'unavailable',
  blockers: ['1 bond record(s) remain without refund evidence.'],
  notes: ['Evidence only.'],
}

describe('ProjectCloseoutReadinessCard', () => {
  it('renders evidence counts, PHP retention, blockers, and the P&L boundary', () => {
    const html = renderToStaticMarkup(<ProjectCloseoutReadinessCard result={RESULT} />)
    expect(html).toContain('Financial close-out evidence')
    expect(html).toContain('₱250.00')
    expect(html).toContain('1 bond record(s) remain without refund evidence.')
    expect(html).toContain('Separate from SAP statutory books')
  })
})
