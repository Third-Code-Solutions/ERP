import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { QualityHoldPointRow } from '@third-code-erp/shared-types'
import { interpretHandoffResponse, captureHandoffFields, QualityPunchlistHandoffForm } from './quality-punchlist-handoff-form'

vi.mock('./actions', () => ({ handoffQualityHoldPointToPunchlist: vi.fn() }))
vi.mock('./document-actions', () => ({ listQualityProjectDocuments: vi.fn() }))
const identity = { projectId: '33333333-3333-4333-8333-333333333333', entryId: '44444444-4444-4444-8444-444444444444', clientRequestId: '55555555-5555-4555-8555-555555555555', actorId: '11111111-1111-4111-8111-111111111111', tenantId: '22222222-2222-4222-8222-222222222222' }
const confirmed = { ok: true, outcome: 'confirmed', success: 'Created.', receipt: identity, refreshWarning: 'Refresh unavailable.' }
const row: QualityHoldPointRow = {
  id: identity.entryId, projectId: identity.projectId, iwrNumber: 'IWR-0001', title: 'Slab inspection',
  description: 'Inspect slab', discipline: 'Structural', location: 'Level 2', planReference: 'S-201 detail 4',
  holdPoint: true, inspectionDate: null, status: 'rejected', requestNotes: '', findings: 'Cover deficient',
  rejectionReason: 'Repair before concealment.', acceptanceNotes: '', requestedBy: identity.actorId,
  assignedTo: null, submittedAt: null, submittedBy: null, acceptedAt: null, acceptedBy: null,
  rejectedAt: null, rejectedBy: null, punchlistHandoffAt: null, punchlistHandoffBy: null, version: 1,
  createdAt: '2026-09-13T00:00:00.000Z', updatedAt: '2026-09-13T00:00:00.000Z',
}

describe('quality punchlist handoff command boundaries', () => {
  it('preserves source evidence and all existing editable fields with an optional picker', () => {
    const html = renderToStaticMarkup(<QualityPunchlistHandoffForm projectId={identity.projectId} row={row} owner={{ actorId: identity.actorId, tenantId: identity.tenantId }} />)
    for (const name of ['projectId', 'entryId', 'clientRequestId', 'descriptions', 'trade', 'location', 'priority', 'dueDate', 'planDocumentId', 'assignedToText']) expect(html).toContain(`name="${name}"`)
    for (const text of ['IWR-0001', 'Cover deficient', 'Repair before concealment.', 'S-201 detail 4', 'Choose project document']) expect(html).toContain(text)
    expect(html).not.toContain('optional UUID')
  })
  it('captures every string pair without trimming, dropping duplicates or following later edits', () => {
    const form = new FormData()
    form.append('descriptions', ' Repair A\nRepair B ')
    form.append('location', 'Level 2')
    form.append('location', 'Repeated value')
    const captured = captureHandoffFields(form)
    form.set('descriptions', 'Changed afterwards')
    expect(captured).toEqual([['descriptions', ' Repair A\nRepair B '], ['location', 'Level 2'], ['location', 'Repeated value']])
  })
  it('keeps a confirmed receipt confirmed despite a refresh warning', () => {
    expect(interpretHandoffResponse(confirmed, identity, true)).toEqual(confirmed)
  })
  it.each(['projectId', 'entryId', 'clientRequestId', 'actorId', 'tenantId'] as const)('rejects mismatched receipt %s as unknown', field => {
    expect(interpretHandoffResponse({ ...confirmed, receipt: { ...identity, [field]: '99999999-9999-4999-8999-999999999999' } }, identity, false)).toMatchObject({ ok: false, outcome: 'unknown' })
  })
  it.each([null, {}, { ...confirmed, extra: true }, { ...confirmed, receipt: { ...identity, actorId: 'invalid' } }])('treats malformed success as unknown', response => {
    expect(interpretHandoffResponse(response, identity, false)).toMatchObject({ ok: false, outcome: 'unknown' })
  })
  it('allows review only for a known rejection before any uncertainty', () => {
    const rejected = { ok: false, outcome: 'rejected', error: 'Fix input.' }
    expect(interpretHandoffResponse(rejected, identity, false)).toEqual(rejected)
    expect(interpretHandoffResponse(rejected, identity, true)).toMatchObject({ ok: false, outcome: 'unknown', error: 'Fix input.' })
  })
})
