import { describe, expect, it } from 'vitest'
import { createProjectSubmittalCommandSchema, projectSubmittalDecisionCommandSchema, projectSubmittalListQuerySchema } from './project-submittals'

const PROJECT_ID = '33333333-3333-4333-8333-333333333333'
const REQUEST_ID = '55555555-5555-4555-8555-555555555555'

describe('project submittal contracts', () => {
  it('defaults bounded list pagination', () => {
    expect(projectSubmittalListQuerySchema.parse({})).toEqual({ page: 1, limit: 25 })
  })

  it('requires a real due date and strict project-safe create shape', () => {
    expect(createProjectSubmittalCommandSchema.parse({
      projectId: PROJECT_ID,
      clientRequestId: REQUEST_ID,
      title: 'Shop drawing — HVAC',
      description: 'Submit coordinated HVAC shop drawings for review.',
      specSection: '23 30 00',
      discipline: 'Mechanical',
      planReference: 'M-202',
      dueDate: '2026-09-18',
      assignedTo: null,
    })).toMatchObject({ dueDate: '2026-09-18' })
    expect(() => createProjectSubmittalCommandSchema.parse({
      projectId: PROJECT_ID,
      clientRequestId: REQUEST_ID,
      title: 'Shop drawing',
      description: 'Submit drawings.',
      specSection: '',
      discipline: '',
      planReference: '',
      dueDate: '2026-02-30',
      assignedTo: null,
    })).toThrow()
  })

  it('requires a reason when rejecting', () => {
    expect(() => projectSubmittalDecisionCommandSchema.parse({ expectedVersion: 1, decision: 'reject', reviewNotes: '', rejectionReason: '' })).toThrow()
    expect(projectSubmittalDecisionCommandSchema.parse({ expectedVersion: 1, decision: 'approve', reviewNotes: 'Approved', rejectionReason: '' })).toMatchObject({ decision: 'approve' })
  })
})
