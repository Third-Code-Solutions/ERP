import { describe, expect, it } from 'vitest'
import {
  createProjectRfiCommandSchema,
  projectRfiAnswerCommandSchema,
  projectRfiListQuerySchema,
  projectRfiListResultSchema,
} from './project-rfi'

const PROJECT_ID = '11111111-1111-4111-8111-111111111111'
const USER_ID = '22222222-2222-4222-8222-222222222222'
const RFI_ID = '33333333-3333-4333-8333-333333333333'
const REQUEST_ID = '44444444-4444-4444-8444-444444444444'
const NOW = '2026-09-10T10:00:00.000Z'

describe('project RFI contracts', () => {
  it('normalizes bounded filters and validates the create command', () => {
    expect(projectRfiListQuerySchema.parse({ page: '2', limit: '50' })).toEqual({
      page: 2,
      limit: 50,
    })
    expect(
      createProjectRfiCommandSchema.parse({
        projectId: PROJECT_ID,
        clientRequestId: REQUEST_ID,
        subject: '  Confirm slab opening  ',
        question: '  Please confirm the coordinated opening size. ',
        priority: 'high',
        assignedTo: USER_ID,
        dueAt: NOW,
      }),
    ).toMatchObject({ subject: 'Confirm slab opening', question: 'Please confirm the coordinated opening size.' })
  })

  it('rejects forged fields and invalid optimistic-concurrency commands', () => {
    expect(() =>
      createProjectRfiCommandSchema.parse({
        projectId: PROJECT_ID,
        clientRequestId: REQUEST_ID,
        subject: 'RFI',
        question: 'Question',
        priority: 'normal',
        assignedTo: null,
        dueAt: null,
        tenantId: 'forged',
      }),
    ).toThrow()
    expect(() => projectRfiAnswerCommandSchema.parse({ expectedVersion: 0, response: 'Answer' })).toThrow()
  })

  it('accepts a closed row while retaining the version and answer evidence', () => {
    const result = projectRfiListResultSchema.parse({
      projectId: PROJECT_ID,
      total: 1,
      page: 1,
      limit: 25,
      totalPages: 1,
      rows: [
        {
          id: RFI_ID,
          projectId: PROJECT_ID,
          rfiNumber: 'RFI-0001',
          subject: 'Confirm slab opening',
          question: 'Please confirm the coordinated opening size.',
          priority: 'high',
          status: 'closed',
          requestedBy: USER_ID,
          assignedTo: USER_ID,
          dueAt: NOW,
          response: 'Use the issued structural detail.',
          respondedAt: NOW,
          respondedBy: USER_ID,
          closedAt: NOW,
          closedBy: USER_ID,
          version: 3,
          createdAt: NOW,
          updatedAt: NOW,
        },
      ],
    })
    expect(result.rows[0]).toMatchObject({ status: 'closed', version: 3 })
  })
})
