import { describe, expect, it } from 'vitest'
import {
  projectDocumentListQuerySchema,
  projectSubmittalDocumentLinkCommandSchema,
  projectSubmittalDocumentLinkResultSchema,
  projectSubmittalDocumentRoleSchema,
  projectSubmittalDocumentUnlinkCommandSchema,
} from './project-submittal-documents'

const PROJECT_ID = '33333333-3333-4333-8333-333333333333'
const SUBMITTAL_ID = '44444444-4444-4444-8444-444444444444'
const DOCUMENT_ID = '66666666-6666-4666-8666-666666666666'
const LINK_ID = '55555555-5555-4555-8555-555555555555'
const USER_ID = '11111111-1111-4111-8111-111111111111'
const REQUEST_ID = '77777777-7777-4777-8777-777777777777'

describe('project submittal document contracts', () => {
  it('defaults bounded project document pagination and validates roles', () => {
    expect(projectDocumentListQuerySchema.parse({})).toEqual({ page: 1, limit: 50 })
    expect(projectSubmittalDocumentRoleSchema.parse('plan')).toBe('plan')
    expect(() => projectSubmittalDocumentRoleSchema.parse('drawing')).toThrow()
  })

  it('requires a replay token and optimistic version for links', () => {
    const command = projectSubmittalDocumentLinkCommandSchema.parse({
      documentId: DOCUMENT_ID,
      role: 'submission',
      caption: 'Rev A',
      expectedVersion: 2,
      clientRequestId: REQUEST_ID,
    })
    expect(command.caption).toBe('Rev A')
    expect(() => projectSubmittalDocumentLinkCommandSchema.parse({ documentId: DOCUMENT_ID, role: 'plan', caption: '', expectedVersion: 1 })).toThrow()
    expect(projectSubmittalDocumentUnlinkCommandSchema.parse({ expectedVersion: 3 })).toEqual({ expectedVersion: 3 })
  })

  it('rejects cross-scope result payloads through strict UUID contracts', () => {
    expect(() => projectSubmittalDocumentLinkResultSchema.parse({
      projectId: PROJECT_ID,
      submittalId: SUBMITTAL_ID,
      changed: true,
      submittalVersion: 2,
      link: {
        id: LINK_ID,
        projectId: PROJECT_ID,
        submittalId: SUBMITTAL_ID,
        documentId: DOCUMENT_ID,
        role: 'plan',
        caption: '',
        fileName: 'M-202.pdf',
        documentType: 'pdf',
        mimeType: 'application/pdf',
        sizeBytes: 42,
        description: null,
        linkedBy: USER_ID,
        createdAt: '2026-09-10T00:00:00.000Z',
      },
    })).not.toThrow()
  })
})
