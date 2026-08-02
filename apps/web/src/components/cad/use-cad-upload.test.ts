import { describe, expect, it } from 'vitest'
import { formatCompletionProgress, type CompleteResponse } from './use-cad-upload'

const base: CompleteResponse = {
  id: '44444444-4444-4444-8444-444444444444',
  storagePath: 'tenant/project/drawing.dwg',
  documentType: 'dxf',
  cadFormat: 'dwg',
}

describe('CAD upload progress formatting', () => {
  it('renders the Nest-succeeded extraction with the existing summary shape', () => {
    expect(
      formatCompletionProgress({
        ...base,
        cadResult: {
          status: 'succeeded',
          scopeItemsCreated: 4,
          warnings: [],
          layerCount: 0,
          entityCount: 0,
          detectedFormat: 'dwg',
          dwgVersion: null,
          extensionMismatch: false,
          message: 'DWG processed by ERP Core - 4 scope items committed.',
          bomId: null,
          bomTcvCents: 0,
          bomCostCents: 0,
          bomGpMarginBps: 0,
          ragMatches: 0,
          aiEstimateMatches: 0,
          processingJobId: '55555555-5555-4555-8555-555555555555',
        },
      })
    ).toContain('DWG: 4 scope items extracted')
  })

  it('keeps queued processing progress actionable', () => {
    expect(
      formatCompletionProgress({
        ...base,
        cadParseQueued: true,
        cadResult: {
          status: 'queued',
          scopeItemsCreated: 0,
          warnings: [],
          layerCount: 0,
          entityCount: 0,
          detectedFormat: 'dwg',
          dwgVersion: null,
          extensionMismatch: false,
          message: 'DWG processing queued in ERP Core.',
          bomId: null,
          bomTcvCents: 0,
          bomCostCents: 0,
          bomGpMarginBps: 0,
          ragMatches: 0,
          aiEstimateMatches: 0,
          processingJobId: '55555555-5555-4555-8555-555555555555',
        },
      })
    ).toBe('DWG processing queued in ERP Core.')
  })
})
