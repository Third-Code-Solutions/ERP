import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SQL } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'

const mocks = vi.hoisted(() => ({
  selectResults: [] as unknown[][],
  lockResults: [] as unknown[][],
  updateResults: [] as unknown[][],
  select: vi.fn(),
  selectWhere: vi.fn(),
  transaction: vi.fn(),
  txSelect: vi.fn(),
  lockWhere: vi.fn(),
  txUpdate: vi.fn(),
  set: vi.fn(),
  updateWhere: vi.fn(),
  createSigningSession: vi.fn(),
  archiveDocuSealSubmission: vi.fn(),
  notifyExternalEmail: vi.fn(),
  notifyRoles: vi.fn(),
  revokeOpenSigningSessions: vi.fn(),
  newestOpenSigningSessionAt: vi.fn(),
  findDefaultCocSigner: vi.fn(),
  writeAuditLog: vi.fn(),
  writeAuditLogInTransaction: vi.fn(),
  revalidatePath: vi.fn(),
  requireUserProfile: vi.fn(),
  can: vi.fn(),
}))

vi.mock('@third-code-erp/auth', () => ({
  requireUserProfile: mocks.requireUserProfile,
  can: mocks.can,
}))

vi.mock('@third-code-erp/database', () => ({
  db: { select: mocks.select, transaction: mocks.transaction },
}))

vi.mock('@/lib/operations/integrations/docuseal', () => ({
  createSigningSession: mocks.createSigningSession,
  archiveDocuSealSubmission: mocks.archiveDocuSealSubmission,
}))

vi.mock('@/lib/operations/signing-sessions', () => ({
  revokeOpenSigningSessions: mocks.revokeOpenSigningSessions,
  newestOpenSigningSessionAt: mocks.newestOpenSigningSessionAt,
}))

vi.mock('./queries', () => ({ findDefaultCocSigner: mocks.findDefaultCocSigner }))
vi.mock('@/lib/audit', () => ({
  writeAuditLog: mocks.writeAuditLog,
  writeAuditLogInTransaction: mocks.writeAuditLogInTransaction,
}))
vi.mock('@/lib/operations/notifications', () => ({
  notifyRoles: mocks.notifyRoles,
  notifyExternalEmail: mocks.notifyExternalEmail,
}))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))

import {
  cancelCocSigningRequest,
  recordCocSigned,
  resendCocSigningLink,
  sendCocForSignature,
} from './actions'

const PROJECT_ID = '11111111-1111-4111-8111-111111111111'
const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const ACCOUNT_ID = '33333333-3333-4333-8333-333333333333'
const COC_ID = '44444444-4444-4444-8444-444444444444'
const DOCUMENT_ID = '66666666-6666-4666-8666-666666666666'
const SIGN_URL = 'https://sign.example.test/portal/sign/secret-token'
const tx = { select: mocks.txSelect, update: mocks.txUpdate }

function selectRows(...rows: unknown[][]): void {
  mocks.selectResults.push(...rows)
}

function cocRow(status: 'draft' | 'pending_signature' | 'signed') {
  return [{ id: COC_ID, project_id: PROJECT_ID, status }]
}

function rendered(fn: ReturnType<typeof vi.fn>, call = 0) {
  return new PgDialect().sqlToQuery(fn.mock.calls[call]![0] as SQL)
}

const PROJECT_ROW = [{ name: 'Tower One', account_id: ACCOUNT_ID }]

describe('COC signing link lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.selectResults.length = 0
    mocks.lockResults.length = 0
    mocks.updateResults.length = 0
    mocks.requireUserProfile.mockResolvedValue({
      role: 'sd_pm_pe',
      tenantId: TENANT_ID,
      user: { id: '55555555-5555-4555-8555-555555555555' },
    })
    mocks.can.mockReturnValue(true)
    mocks.select.mockImplementation(() => ({ from: () => ({ where: mocks.selectWhere }) }))
    mocks.selectWhere.mockImplementation(() => ({
      limit: () => Promise.resolve(mocks.selectResults.shift() ?? []),
    }))
    mocks.transaction.mockImplementation(async (callback: (t: typeof tx) => unknown) => callback(tx))
    mocks.txSelect.mockImplementation(() => ({ from: () => ({ where: mocks.lockWhere }) }))
    mocks.lockWhere.mockImplementation(() => ({
      for: () => Promise.resolve(mocks.lockResults.shift() ?? [{ docusealSubmissionId: null }]),
    }))
    mocks.txUpdate.mockImplementation(() => ({ set: mocks.set }))
    mocks.set.mockImplementation(() => ({ where: mocks.updateWhere }))
    mocks.updateWhere.mockImplementation(() => ({
      returning: () => Promise.resolve(mocks.updateResults.shift() ?? [{ id: COC_ID }]),
    }))
    mocks.createSigningSession.mockResolvedValue({
      mechanism: 'canvas',
      token: 'secret-token',
      url: SIGN_URL,
      is_dev_stub: false,
    })
    mocks.archiveDocuSealSubmission.mockResolvedValue(undefined)
    mocks.findDefaultCocSigner.mockResolvedValue({
      name: 'Ana Client',
      email: ' ana@client.test ',
    })
    mocks.notifyExternalEmail.mockResolvedValue({ delivered: true })
    mocks.notifyRoles.mockResolvedValue(undefined)
    mocks.revokeOpenSigningSessions.mockResolvedValue(undefined)
    mocks.newestOpenSigningSessionAt.mockResolvedValue(null)
    mocks.writeAuditLog.mockResolvedValue(undefined)
    mocks.writeAuditLogInTransaction.mockResolvedValue(undefined)
  })

  describe('sendCocForSignature', () => {
    it('emails the primary contact, returns the link and never audits it', async () => {
      selectRows(cocRow('draft'), PROJECT_ROW)

      const result = await sendCocForSignature(PROJECT_ID)

      expect(result).toEqual({
        url: SIGN_URL,
        emailed: true,
        signerEmail: 'ana@client.test',
        expiresAt: expect.any(String),
      })
      expect(mocks.findDefaultCocSigner).toHaveBeenCalledWith(TENANT_ID, PROJECT_ID, ACCOUNT_ID)
      // The link row is written in the certificate's transaction, never on a second connection.
      expect(mocks.createSigningSession).toHaveBeenCalledWith(
        {
          tenantId: TENANT_ID,
          entityType: 'coc',
          entityId: COC_ID,
          signerEmail: 'ana@client.test',
          signerName: 'Ana Client',
        },
        tx
      )
      expect(mocks.set).toHaveBeenCalledWith({
        status: 'pending_signature',
        docuseal_submission_id: null,
      })
      // Any link left by an earlier, cancelled request stops working.
      expect(mocks.revokeOpenSigningSessions).toHaveBeenCalledWith(
        tx,
        TENANT_ID,
        'coc',
        COC_ID,
        'secret-token'
      )
      expect(mocks.notifyExternalEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT_ID,
          recipientEmail: 'ana@client.test',
          templateId: 'coc-signing-link',
          templateVars: expect.objectContaining({
            project_name: 'Tower One',
            portal_url: SIGN_URL,
          }),
        })
      )
      expect(mocks.notifyExternalEmail.mock.calls[0]?.[0]).not.toHaveProperty('linkUrl')
      expect(mocks.writeAuditLogInTransaction).toHaveBeenCalledOnce()
      expect(mocks.writeAuditLogInTransaction).toHaveBeenCalledWith(tx, expect.any(Object))
      expect(JSON.stringify(mocks.writeAuditLogInTransaction.mock.calls)).not.toContain('secret-token')
      expect(mocks.writeAuditLog).not.toHaveBeenCalled()
      expect(mocks.revalidatePath).toHaveBeenCalledWith(`/projects/${PROJECT_ID}/coc`)
    })

    it('locks the draft certificate of the session tenant before minting the link', async () => {
      selectRows(cocRow('draft'), PROJECT_ROW)

      await sendCocForSignature(PROJECT_ID)

      const lock = rendered(mocks.lockWhere)
      expect(lock.sql).toContain('"certificates_of_completion"."tenant_id"')
      expect(lock.params).toEqual([COC_ID, TENANT_ID, 'draft'])
      expect(mocks.lockWhere.mock.invocationCallOrder[0]).toBeLessThan(
        mocks.createSigningSession.mock.invocationCallOrder[0]!
      )
      // The move repeats the lock's status, so it cannot land on a moved certificate.
      const update = rendered(mocks.updateWhere)
      expect(update.params).toEqual([COC_ID, TENANT_ID, 'draft'])
    })

    it('rolls back and sends nothing when the status-bound move matches no row', async () => {
      selectRows(cocRow('draft'), PROJECT_ROW)
      mocks.updateResults.push([])

      await expect(sendCocForSignature(PROJECT_ID)).rejects.toThrow(/changed while the link was being created/)
      expect(mocks.revokeOpenSigningSessions).not.toHaveBeenCalled()
      expect(mocks.writeAuditLogInTransaction).not.toHaveBeenCalled()
      expect(mocks.notifyExternalEmail).not.toHaveBeenCalled()
    })

    it('emails only after the certificate and the audit row are committed', async () => {
      selectRows(cocRow('draft'), PROJECT_ROW)

      await sendCocForSignature(PROJECT_ID)

      expect(mocks.writeAuditLogInTransaction.mock.invocationCallOrder[0]).toBeLessThan(
        mocks.notifyExternalEmail.mock.invocationCallOrder[0]!
      )
    })

    it('stores the DocuSeal submission id, never the signing slug', async () => {
      selectRows(cocRow('draft'), PROJECT_ROW)
      mocks.createSigningSession.mockResolvedValue({
        mechanism: 'docuseal',
        token: 'slug-credential',
        submissionId: 'submission-7',
        url: 'https://docuseal.example.test/s/slug-credential',
        is_dev_stub: false,
      })

      await sendCocForSignature(PROJECT_ID)

      expect(mocks.set).toHaveBeenCalledWith({
        status: 'pending_signature',
        docuseal_submission_id: 'submission-7',
      })
    })

    it('uses the signer typed by the sender without consulting contacts', async () => {
      selectRows(cocRow('draft'), PROJECT_ROW)

      const result = await sendCocForSignature(PROJECT_ID, {
        name: '  Ben Owner ',
        email: ' ben@owner.test ',
      })

      expect(result.signerEmail).toBe('ben@owner.test')
      expect(mocks.findDefaultCocSigner).not.toHaveBeenCalled()
      expect(mocks.createSigningSession).toHaveBeenCalledWith(
        expect.objectContaining({ signerEmail: 'ben@owner.test', signerName: 'Ben Owner' }),
        tx
      )
    })

    it.each([
      { signer: { name: 'Ben', email: 'not-an-email' }, error: 'Enter a valid email address for the client signer.' },
      { signer: { name: '', email: 'ben@owner.test' }, error: 'Enter the name of the client signer.' },
    ])('rejects an incomplete typed signer before starting signing', async ({ signer, error }) => {
      selectRows(cocRow('draft'), PROJECT_ROW)

      await expect(sendCocForSignature(PROJECT_ID, signer)).resolves.toEqual({ error })
      expect(mocks.transaction).not.toHaveBeenCalled()
      expect(mocks.createSigningSession).not.toHaveBeenCalled()
    })

    it.each([
      { contact: null },
      { contact: { name: 'Client Representative', email: 'invalid-address' } },
      { contact: { name: 'Client Representative', email: '' } },
    ])('asks for a signer when the project has no usable primary contact', async ({ contact }) => {
      selectRows(cocRow('draft'), PROJECT_ROW)
      mocks.findDefaultCocSigner.mockResolvedValue(contact)

      const result = await sendCocForSignature(PROJECT_ID)

      expect(result.error).toMatch(/Enter the name and email of the client signer/)
      expect(mocks.transaction).not.toHaveBeenCalled()
      expect(mocks.createSigningSession).not.toHaveBeenCalled()
    })

    it('still returns the link when the email provider did not confirm delivery', async () => {
      selectRows(cocRow('draft'), PROJECT_ROW)
      mocks.notifyExternalEmail.mockResolvedValue({ delivered: false })

      await expect(sendCocForSignature(PROJECT_ID)).resolves.toMatchObject({
        url: SIGN_URL,
        emailed: false,
      })
    })

    it('still returns the link when the email step throws', async () => {
      selectRows(cocRow('draft'), PROJECT_ROW)
      mocks.notifyExternalEmail.mockRejectedValue(new Error('smtp down'))
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

      await expect(sendCocForSignature(PROJECT_ID)).resolves.toMatchObject({
        url: SIGN_URL,
        emailed: false,
      })
      errorSpy.mockRestore()
    })

    it('reports a plain error when the signing session cannot be created', async () => {
      selectRows(cocRow('draft'), PROJECT_ROW)
      mocks.createSigningSession.mockRejectedValue(new Error('storage exploded'))
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

      await expect(sendCocForSignature(PROJECT_ID)).resolves.toEqual({
        error: 'The signing link could not be created. Try again.',
      })
      expect(mocks.set).not.toHaveBeenCalled()
      expect(mocks.notifyExternalEmail).not.toHaveBeenCalled()
      errorSpy.mockRestore()
    })

    it('mints no link and sends no email when another request already moved the certificate', async () => {
      selectRows(cocRow('draft'), PROJECT_ROW)
      mocks.lockResults.push([])

      const result = await sendCocForSignature(PROJECT_ID)

      expect(result.error).toMatch(/changed while the link was being created/)
      expect(mocks.createSigningSession).not.toHaveBeenCalled()
      expect(mocks.notifyExternalEmail).not.toHaveBeenCalled()
      expect(mocks.writeAuditLogInTransaction).not.toHaveBeenCalled()
    })

    it('refuses a certificate that is not a draft', async () => {
      selectRows(cocRow('pending_signature'))

      await expect(sendCocForSignature(PROJECT_ID)).resolves.toEqual({
        error: 'Only a draft certificate can be sent for signature.',
      })
      expect(mocks.createSigningSession).not.toHaveBeenCalled()
    })

    it('treats a certificate of another tenant as not found', async () => {
      selectRows([])

      await expect(sendCocForSignature(PROJECT_ID)).resolves.toEqual({ error: 'COC not found' })
      // The lookup binds the session tenant, so another tenant's certificate never matches.
      const lookup = rendered(mocks.selectWhere)
      expect(lookup.sql).toContain('"certificates_of_completion"."tenant_id" = $2')
      expect(lookup.params).toEqual([PROJECT_ID, TENANT_ID])
      expect(mocks.transaction).not.toHaveBeenCalled()
    })

    it('refuses a role without the closeout capability before any lookup', async () => {
      mocks.can.mockReturnValue(false)

      const result = await sendCocForSignature(PROJECT_ID)

      expect(result.error).toMatch(/do not have permission/)
      expect(mocks.select).not.toHaveBeenCalled()
      expect(mocks.createSigningSession).not.toHaveBeenCalled()
    })

    it('treats a malformed project id as not found without querying', async () => {
      await expect(sendCocForSignature('not-a-uuid')).resolves.toEqual({ error: 'COC not found' })
      expect(mocks.select).not.toHaveBeenCalled()
    })
  })

  describe('resendCocSigningLink', () => {
    it('issues a new link under the lock and revokes every older link except the new one', async () => {
      selectRows(cocRow('pending_signature'), PROJECT_ROW)

      const result = await resendCocSigningLink(PROJECT_ID, {
        name: 'Ana Client',
        email: 'ana@client.test',
      })

      expect(result).toMatchObject({ url: SIGN_URL, emailed: true, signerEmail: 'ana@client.test' })
      expect(rendered(mocks.lockWhere).params).toEqual([COC_ID, TENANT_ID, 'pending_signature'])
      expect(mocks.createSigningSession).toHaveBeenCalledWith(expect.any(Object), tx)
      expect(rendered(mocks.updateWhere).params).toEqual([COC_ID, TENANT_ID, 'pending_signature'])
      expect(mocks.revokeOpenSigningSessions).toHaveBeenCalledWith(
        tx,
        TENANT_ID,
        'coc',
        COC_ID,
        'secret-token'
      )
      expect(mocks.writeAuditLogInTransaction).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({
          action: 'update',
          diff: expect.objectContaining({ signing_link: 'reissued', previous_links_revoked: true }),
        })
      )
      expect(JSON.stringify(mocks.writeAuditLogInTransaction.mock.calls)).not.toContain('secret-token')
    })

    it('archives the replaced DocuSeal submission after the commit', async () => {
      selectRows(cocRow('pending_signature'), PROJECT_ROW)
      mocks.lockResults.push([{ docusealSubmissionId: 'submission-old' }])

      await resendCocSigningLink(PROJECT_ID, { name: 'Ana', email: 'ana@client.test' })

      expect(mocks.archiveDocuSealSubmission).toHaveBeenCalledWith('submission-old')
      expect(mocks.writeAuditLogInTransaction.mock.invocationCallOrder[0]).toBeLessThan(
        mocks.archiveDocuSealSubmission.mock.invocationCallOrder[0]!
      )
    })

    it('keeps the old link when the certificate was signed meanwhile', async () => {
      selectRows(cocRow('pending_signature'), PROJECT_ROW)
      mocks.lockResults.push([])

      const result = await resendCocSigningLink(PROJECT_ID, { name: 'Ana', email: 'ana@client.test' })

      expect(result.error).toMatch(/changed while the link was being created/)
      expect(mocks.revokeOpenSigningSessions).not.toHaveBeenCalled()
      expect(mocks.archiveDocuSealSubmission).not.toHaveBeenCalled()
      expect(mocks.notifyExternalEmail).not.toHaveBeenCalled()
    })

    it('lets one resend through, refuses an immediate second, and leaves another tenant alone', async () => {
      const OTHER_TENANT_ID = '99999999-9999-4999-8999-999999999999'
      // Newest open canvas link per tenant and certificate, as createSigningSession writes it.
      const issuedAt = new Map<string, Date>()
      const key = (tenantId: string, cocId: string) => `${tenantId}:${cocId}`
      mocks.createSigningSession.mockImplementation(
        async (input: { tenantId: string; entityId: string }) => {
          issuedAt.set(key(input.tenantId, input.entityId), new Date())
          return { mechanism: 'canvas', token: 'secret-token', url: SIGN_URL, is_dev_stub: false }
        }
      )
      mocks.newestOpenSigningSessionAt.mockImplementation(
        async (_tx: unknown, tenantId: string, _type: string, cocId: string) =>
          issuedAt.get(key(tenantId, cocId)) ?? null
      )
      const asTenant = (tenantId: string) =>
        mocks.requireUserProfile.mockResolvedValue({
          role: 'sd_pm_pe',
          tenantId,
          user: { id: '55555555-5555-4555-8555-555555555555' },
        })
      const resend = () => {
        selectRows(cocRow('pending_signature'), PROJECT_ROW)
        return resendCocSigningLink(PROJECT_ID, { name: 'Ana Client', email: 'ana@client.test' })
      }

      vi.useFakeTimers({ toFake: ['Date'] })
      try {
        vi.setSystemTime(new Date('2026-11-24T09:00:00.000Z'))
        await expect(resend()).resolves.toMatchObject({ url: SIGN_URL, emailed: true })

        vi.setSystemTime(new Date('2026-11-24T09:00:05.000Z'))
        await expect(resend()).resolves.toEqual({
          error: 'A signing link was sent for this certificate a few minutes ago. Try again in 10 minutes.',
        })
        // Read under the lock, for this tenant's certificate only.
        expect(mocks.newestOpenSigningSessionAt).toHaveBeenLastCalledWith(tx, TENANT_ID, 'coc', COC_ID)
        // The refusal minted, revoked, emailed and audited nothing.
        expect(mocks.createSigningSession).toHaveBeenCalledOnce()
        expect(mocks.revokeOpenSigningSessions).toHaveBeenCalledOnce()
        expect(mocks.set).toHaveBeenCalledOnce()
        expect(mocks.notifyExternalEmail).toHaveBeenCalledOnce()
        expect(mocks.writeAuditLogInTransaction).toHaveBeenCalledOnce()
        expect(mocks.archiveDocuSealSubmission).toHaveBeenCalledOnce()

        // Another tenant's certificate with the same id keeps its own clock.
        asTenant(OTHER_TENANT_ID)
        await expect(resend()).resolves.toMatchObject({ url: SIGN_URL })
        expect(mocks.createSigningSession).toHaveBeenLastCalledWith(
          expect.objectContaining({ tenantId: OTHER_TENANT_ID, entityId: COC_ID }),
          tx
        )

        // Ten minutes after the first link the first tenant may resend again.
        asTenant(TENANT_ID)
        vi.setSystemTime(new Date('2026-11-24T09:10:00.000Z'))
        await expect(resend()).resolves.toMatchObject({ url: SIGN_URL })
        expect(mocks.createSigningSession).toHaveBeenCalledTimes(3)
      } finally {
        vi.useRealTimers()
      }
    })

    it('refuses to resend a draft or signed certificate', async () => {
      selectRows(cocRow('draft'))

      const result = await resendCocSigningLink(PROJECT_ID)

      expect(result.error).toMatch(/only be sent while the certificate is waiting for signature/)
      expect(mocks.createSigningSession).not.toHaveBeenCalled()
    })
  })

  describe('cancelCocSigningRequest', () => {
    it('returns a pending certificate to draft, revokes its links and archives its DocuSeal request', async () => {
      selectRows(cocRow('pending_signature'))
      mocks.lockResults.push([{ docusealSubmissionId: 'submission-9' }])

      await expect(cancelCocSigningRequest(PROJECT_ID)).resolves.toEqual({})

      expect(rendered(mocks.lockWhere).params).toEqual([COC_ID, TENANT_ID, 'pending_signature'])
      expect(mocks.set).toHaveBeenCalledWith({ status: 'draft', docuseal_submission_id: null })
      expect(rendered(mocks.updateWhere).params).toEqual([COC_ID, TENANT_ID, 'pending_signature'])
      expect(mocks.revokeOpenSigningSessions).toHaveBeenCalledWith(tx, TENANT_ID, 'coc', COC_ID)
      expect(mocks.writeAuditLogInTransaction).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({
          action: 'status_change',
          diff: {
            status: { before: 'pending_signature', after: 'draft' },
            signing_link: 'revoked',
          },
        })
      )
      expect(mocks.archiveDocuSealSubmission).toHaveBeenCalledWith('submission-9')
      expect(mocks.revalidatePath).toHaveBeenCalledWith(`/projects/${PROJECT_ID}/coc`)
    })

    it('does not touch links when the certificate is no longer pending', async () => {
      selectRows(cocRow('pending_signature'))
      mocks.lockResults.push([])

      const result = await cancelCocSigningRequest(PROJECT_ID)

      expect(result.error).toMatch(/no longer waiting for signature/)
      expect(mocks.set).not.toHaveBeenCalled()
      expect(mocks.revokeOpenSigningSessions).not.toHaveBeenCalled()
      expect(mocks.writeAuditLogInTransaction).not.toHaveBeenCalled()
      expect(mocks.archiveDocuSealSubmission).not.toHaveBeenCalled()
    })

    it.each(['draft', 'signed'] as const)('refuses to cancel a %s certificate', async (status) => {
      selectRows(cocRow(status))

      const result = await cancelCocSigningRequest(PROJECT_ID)

      expect(result.error).toMatch(/Only a certificate that is waiting for signature/)
      expect(mocks.transaction).not.toHaveBeenCalled()
    })
  })

  describe('recordCocSigned', () => {
    it('signs a pending certificate under the lock and revokes its links', async () => {
      selectRows(cocRow('pending_signature'), [{ id: DOCUMENT_ID }])

      await expect(recordCocSigned(COC_ID, DOCUMENT_ID)).resolves.toEqual({})

      expect(rendered(mocks.lockWhere).params).toEqual([COC_ID, TENANT_ID, 'pending_signature'])
      expect(mocks.set).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'signed', signed_document_id: DOCUMENT_ID })
      )
      expect(rendered(mocks.updateWhere).params).toEqual([COC_ID, TENANT_ID, 'pending_signature'])
      expect(mocks.revokeOpenSigningSessions).toHaveBeenCalledWith(tx, TENANT_ID, 'coc', COC_ID)
      expect(mocks.writeAuditLogInTransaction).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({ action: 'approve' })
      )
      expect(mocks.notifyRoles).toHaveBeenCalledOnce()
    })

    it('refuses a cancelled (draft) certificate', async () => {
      selectRows(cocRow('draft'))

      await expect(recordCocSigned(COC_ID, DOCUMENT_ID)).resolves.toEqual({
        error: 'The certificate is not waiting for signature, so it cannot be recorded as signed.',
      })
      expect(mocks.transaction).not.toHaveBeenCalled()
      expect(mocks.notifyRoles).not.toHaveBeenCalled()
    })

    it('refuses when a cancel landed between the read and the lock', async () => {
      selectRows(cocRow('pending_signature'), [{ id: DOCUMENT_ID }])
      mocks.lockResults.push([])

      const result = await recordCocSigned(COC_ID, DOCUMENT_ID)

      expect(result.error).toMatch(/not waiting for signature/)
      expect(mocks.set).not.toHaveBeenCalled()
      expect(mocks.notifyRoles).not.toHaveBeenCalled()
    })

    it('stays idempotent for a signed certificate', async () => {
      selectRows(cocRow('signed'))

      await expect(recordCocSigned(COC_ID, DOCUMENT_ID)).resolves.toEqual({})
      expect(mocks.transaction).not.toHaveBeenCalled()
    })

    it('refuses a signed document of another tenant or another project', async () => {
      selectRows(cocRow('pending_signature'), [])

      await expect(recordCocSigned(COC_ID, DOCUMENT_ID)).resolves.toEqual({
        error: 'Signed document not found',
      })
      // The document lookup binds the session tenant and the certificate's project.
      const lookup = rendered(mocks.selectWhere, 1)
      expect(lookup.sql).toContain('"documents"."tenant_id" = $2')
      expect(lookup.sql).toContain('"documents"."project_id" = $3')
      expect(lookup.params).toEqual([DOCUMENT_ID, TENANT_ID, PROJECT_ID])
      expect(mocks.transaction).not.toHaveBeenCalled()
    })
  })
})
