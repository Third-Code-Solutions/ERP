import { describe, expect, it } from 'vitest'
import {
  docuSealWebhookCommandSchema,
  docuSealWebhookResultSchema,
} from './docuseal-webhook'

const SUBMISSION_ID = 'submission-123'
const BOM_ID = '33333333-3333-4333-8333-333333333333'
const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const PROJECT_ID = '44444444-4444-4444-8444-444444444444'

describe('DocuSeal webhook contract', () => {
  it('normalizes an accepted completion command', () => {
    expect(
      docuSealWebhookCommandSchema.parse({
        event: 'submission.completed',
        submissionId: ` ${SUBMISSION_ID} `,
        documents: [{ url: 'https://sign.example.test/signed.pdf' }],
      })
    ).toEqual({
      event: 'submission.completed',
      submissionId: SUBMISSION_ID,
      documents: [{ url: 'https://sign.example.test/signed.pdf' }],
    })
  })

  it('defaults missing documents for non-completion events', () => {
    expect(
      docuSealWebhookCommandSchema.parse({
        event: 'submission.opened',
        submissionId: SUBMISSION_ID,
      }).documents
    ).toEqual([])
  })

  it('rejects empty completions, unknown fields, and unsafe URLs', () => {
    expect(() =>
      docuSealWebhookCommandSchema.parse({
        event: 'submission.completed',
        submissionId: SUBMISSION_ID,
        unexpected: true,
      })
    ).toThrow()
    expect(() =>
      docuSealWebhookCommandSchema.parse({
        event: 'submission.completed',
        submissionId: SUBMISSION_ID,
        documents: [{ url: 'file:///private/signed.pdf' }],
      })
    ).toThrow()
  })

  it('requires bounded, nullable identity metadata in the result', () => {
    expect(
      docuSealWebhookResultSchema.parse({
        received: true,
        handled: true,
        duplicate: false,
        tenantId: TENANT_ID,
        bomId: BOM_ID,
        projectId: PROJECT_ID,
        projectName: 'Fit-out',
        tcvCents: 125_000,
        signedDocument: {
          name: 'signed.pdf',
          storagePath: `${TENANT_ID}/${PROJECT_ID}/signed.pdf`,
          sizeBytes: 1_024,
        },
      })
    ).toMatchObject({ handled: true, tcvCents: 125_000 })

    expect(() =>
      docuSealWebhookResultSchema.parse({
        received: true,
        handled: true,
        duplicate: false,
        tenantId: TENANT_ID,
        bomId: BOM_ID,
        projectId: PROJECT_ID,
        projectName: 'Fit-out',
        tcvCents: 125_000,
        signedDocument: {
          name: 'signed.pdf',
          storagePath: 'https://provider.example.test/signed.pdf',
          sizeBytes: 1_024,
        },
      })
    ).toThrow()
  })
})
