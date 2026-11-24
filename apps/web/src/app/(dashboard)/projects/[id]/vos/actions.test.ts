import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SQL } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'

const mocks = vi.hoisted(() => ({
  lockResults: [] as unknown[][],
  select: vi.fn(),
  transaction: vi.fn(),
  txSelect: vi.fn(),
  lockWhere: vi.fn(),
  txUpdate: vi.fn(),
  set: vi.fn(),
  updateWhere: vi.fn(),
  loadVo: vi.fn(),
  createSigningSession: vi.fn(),
  archiveDocuSealSubmission: vi.fn(),
  revokeOpenSigningSessions: vi.fn(),
  writeAuditLog: vi.fn(),
  writeAuditLogInTransaction: vi.fn(),
  revalidatePath: vi.fn(),
  getUserProfile: vi.fn(),
  can: vi.fn(),
}))

vi.mock('@third-code-erp/auth', () => ({
  getUserProfile: mocks.getUserProfile,
  can: mocks.can,
}))
vi.mock('@third-code-erp/database', () => ({
  db: { select: mocks.select, transaction: mocks.transaction },
}))
vi.mock('./queries', () => ({ loadVo: mocks.loadVo }))
vi.mock('@/lib/operations/integrations/docuseal', () => ({
  createSigningSession: mocks.createSigningSession,
  archiveDocuSealSubmission: mocks.archiveDocuSealSubmission,
}))
vi.mock('@/lib/operations/signing-sessions', () => ({
  revokeOpenSigningSessions: mocks.revokeOpenSigningSessions,
}))
vi.mock('@/lib/audit', () => ({
  writeAuditLog: mocks.writeAuditLog,
  writeAuditLogInTransaction: mocks.writeAuditLogInTransaction,
}))
vi.mock('@/lib/operations/notifications', () => ({ notifyRoles: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))

import {
  cancelVoSigningRequest,
  recordVoSigned,
  rejectVo,
  resendVoSigningLink,
  submitVoForClientSignature,
} from './actions'

const TENANT_ID = '11111111-1111-4111-8111-111111111111'
const USER_ID = '22222222-2222-4222-8222-222222222222'
const PROJECT_ID = '33333333-3333-4333-8333-333333333333'
const VO_ID = '44444444-4444-4444-8444-444444444444'
const SIGN_URL = 'https://sign.example.test/portal/sign/secret-token'
const tx = { select: mocks.txSelect, update: mocks.txUpdate }

function vo(status: string) {
  return {
    id: VO_ID,
    project_id: PROJECT_ID,
    vo_number: 'VO-0001',
    status,
    created_by: USER_ID,
  }
}

function rendered(fn: ReturnType<typeof vi.fn>) {
  return new PgDialect().sqlToQuery(fn.mock.calls[0]![0] as SQL)
}

describe('variation order signing link lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.lockResults.length = 0
    mocks.getUserProfile.mockResolvedValue({
      tenantId: TENANT_ID,
      role: 'commercial',
      user: { id: USER_ID },
    })
    mocks.can.mockReturnValue(true)
    mocks.select.mockImplementation(() => ({
      from: () => ({
        where: () => ({ limit: () => Promise.resolve([{ email: 'creator@firm.test' }]) }),
      }),
    }))
    mocks.transaction.mockImplementation(async (callback: (t: typeof tx) => unknown) => callback(tx))
    mocks.txSelect.mockImplementation(() => ({ from: () => ({ where: mocks.lockWhere }) }))
    mocks.lockWhere.mockImplementation(() => ({
      for: () => Promise.resolve(mocks.lockResults.shift() ?? [{ docusealSubmissionId: null }]),
    }))
    mocks.txUpdate.mockImplementation(() => ({ set: mocks.set }))
    mocks.set.mockImplementation(() => ({ where: mocks.updateWhere }))
    mocks.updateWhere.mockResolvedValue(undefined)
    mocks.createSigningSession.mockResolvedValue({
      mechanism: 'canvas',
      token: 'secret-token',
      url: SIGN_URL,
      is_dev_stub: false,
    })
    mocks.archiveDocuSealSubmission.mockResolvedValue(undefined)
    mocks.revokeOpenSigningSessions.mockResolvedValue(undefined)
    mocks.writeAuditLogInTransaction.mockResolvedValue(undefined)
  })

  describe('submitVoForClientSignature', () => {
    it('returns the link and expiry and never writes the link to the audit log', async () => {
      mocks.loadVo.mockResolvedValue(vo('pending_commercial_pricing'))

      const result = await submitVoForClientSignature(VO_ID)

      expect(result).toEqual({ url: SIGN_URL, expiresAt: expect.any(String) })
      expect(mocks.set).toHaveBeenCalledWith({
        status: 'pending_client_signature',
        docuseal_submission_id: null,
      })
      // Any link left by an earlier cancelled request stops working.
      expect(mocks.revokeOpenSigningSessions).toHaveBeenCalledWith(
        tx,
        TENANT_ID,
        'variation_order',
        VO_ID,
        'secret-token'
      )
      expect(mocks.writeAuditLogInTransaction).toHaveBeenCalledWith(tx, expect.any(Object))
      expect(JSON.stringify(mocks.writeAuditLogInTransaction.mock.calls)).not.toContain('secret-token')
    })

    it('stores the DocuSeal submission id, never the signing slug', async () => {
      mocks.loadVo.mockResolvedValue(vo('pending_commercial_pricing'))
      mocks.createSigningSession.mockResolvedValue({
        mechanism: 'docuseal',
        token: 'slug-credential',
        submissionId: 'submission-7',
        url: 'https://docuseal.example.test/s/slug-credential',
        is_dev_stub: false,
      })

      await submitVoForClientSignature(VO_ID)

      expect(mocks.set).toHaveBeenCalledWith({
        status: 'pending_client_signature',
        docuseal_submission_id: 'submission-7',
      })
    })

    it('refuses a VO that commercial has not priced', async () => {
      mocks.loadVo.mockResolvedValue(vo('draft'))

      await expect(submitVoForClientSignature(VO_ID)).resolves.toEqual({
        error: 'VO must be priced by commercial first',
      })
      expect(mocks.createSigningSession).not.toHaveBeenCalled()
    })

    it('reports a plain error when the signing session cannot be created', async () => {
      mocks.loadVo.mockResolvedValue(vo('pending_commercial_pricing'))
      mocks.createSigningSession.mockRejectedValue(new Error('storage exploded'))
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

      await expect(submitVoForClientSignature(VO_ID)).resolves.toEqual({
        error: 'The signing link could not be created. Try again.',
      })
      expect(mocks.set).not.toHaveBeenCalled()
      errorSpy.mockRestore()
    })
  })

  describe('resendVoSigningLink', () => {
    it('mints the new link under the VO lock, then revokes every older link in the same transaction', async () => {
      mocks.loadVo.mockResolvedValue(vo('pending_client_signature'))

      const result = await resendVoSigningLink(VO_ID)

      expect(result).toEqual({ url: SIGN_URL, expiresAt: expect.any(String) })
      expect(mocks.lockWhere.mock.invocationCallOrder[0]).toBeLessThan(
        mocks.createSigningSession.mock.invocationCallOrder[0]!
      )
      expect(mocks.set.mock.invocationCallOrder[0]).toBeLessThan(
        mocks.revokeOpenSigningSessions.mock.invocationCallOrder[0]!
      )
      expect(mocks.revokeOpenSigningSessions).toHaveBeenCalledWith(
        tx,
        TENANT_ID,
        'variation_order',
        VO_ID,
        'secret-token'
      )
      expect(mocks.writeAuditLogInTransaction).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({
          diff: expect.objectContaining({
            from: 'pending_client_signature',
            signing_link: 'reissued',
          }),
        })
      )
      expect(JSON.stringify(mocks.writeAuditLogInTransaction.mock.calls)).not.toContain('secret-token')
    })

    it('archives the DocuSeal submission the new link replaces', async () => {
      mocks.loadVo.mockResolvedValue(vo('pending_client_signature'))
      mocks.lockResults.push([{ docusealSubmissionId: 'submission-old' }])

      await resendVoSigningLink(VO_ID)

      expect(mocks.archiveDocuSealSubmission).toHaveBeenCalledWith('submission-old')
    })

    it('mints no link when the VO was signed or rejected meanwhile', async () => {
      mocks.loadVo.mockResolvedValue(vo('pending_client_signature'))
      mocks.lockResults.push([])

      const result = await resendVoSigningLink(VO_ID)

      expect(result.error).toMatch(/changed while the link was being created/)
      expect(mocks.createSigningSession).not.toHaveBeenCalled()
      expect(mocks.revokeOpenSigningSessions).not.toHaveBeenCalled()
      expect(mocks.writeAuditLogInTransaction).not.toHaveBeenCalled()
    })

    it('lets a failed revoke abort the transaction before any audit row', async () => {
      mocks.loadVo.mockResolvedValue(vo('pending_client_signature'))
      mocks.revokeOpenSigningSessions.mockRejectedValue(new Error('revoke failed'))

      await expect(resendVoSigningLink(VO_ID)).rejects.toThrow('revoke failed')
      expect(mocks.writeAuditLogInTransaction).not.toHaveBeenCalled()
      expect(mocks.archiveDocuSealSubmission).not.toHaveBeenCalled()
    })

    it.each(['draft', 'pending_commercial_pricing', 'signed', 'rejected'])(
      'refuses to resend a %s VO',
      async (status) => {
        mocks.loadVo.mockResolvedValue(vo(status))

        const result = await resendVoSigningLink(VO_ID)

        expect(result.error).toMatch(/only be created while the VO is waiting for client signature/)
        expect(mocks.createSigningSession).not.toHaveBeenCalled()
      }
    )

    it('refuses a role that may not send VOs for signature', async () => {
      mocks.can.mockReturnValue(false)

      const result = await resendVoSigningLink(VO_ID)

      expect(result.error).toMatch(/Forbidden/)
      expect(mocks.loadVo).not.toHaveBeenCalled()
    })
  })

  describe('cancelVoSigningRequest', () => {
    it('returns the VO to commercial pricing and revokes its links in one transaction', async () => {
      mocks.loadVo.mockResolvedValue(vo('pending_client_signature'))
      mocks.lockResults.push([{ docusealSubmissionId: 'submission-old' }])

      await expect(cancelVoSigningRequest(VO_ID)).resolves.toEqual({})

      expect(mocks.set).toHaveBeenCalledWith({
        status: 'pending_commercial_pricing',
        docuseal_submission_id: null,
      })
      expect(mocks.revokeOpenSigningSessions).toHaveBeenCalledWith(
        tx,
        TENANT_ID,
        'variation_order',
        VO_ID
      )
      expect(mocks.writeAuditLogInTransaction).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({
          diff: {
            from: 'pending_client_signature',
            to: 'pending_commercial_pricing',
            signing_link: 'revoked',
          },
        })
      )
      expect(mocks.archiveDocuSealSubmission).toHaveBeenCalledWith('submission-old')
    })

    it('leaves links alone when a signature landed first', async () => {
      mocks.loadVo.mockResolvedValue(vo('pending_client_signature'))
      mocks.lockResults.push([])

      const result = await cancelVoSigningRequest(VO_ID)

      expect(result.error).toMatch(/no longer waiting for client signature/)
      expect(mocks.set).not.toHaveBeenCalled()
      expect(mocks.revokeOpenSigningSessions).not.toHaveBeenCalled()
    })

    it.each(['draft', 'signed'])('refuses to cancel a %s VO', async (status) => {
      mocks.loadVo.mockResolvedValue(vo(status))

      const result = await cancelVoSigningRequest(VO_ID)

      expect(result.error).toMatch(/Only a VO that is waiting for client signature/)
      expect(mocks.set).not.toHaveBeenCalled()
    })
  })

  describe('recordVoSigned', () => {
    it('records the signature and revokes every link still out', async () => {
      mocks.loadVo.mockResolvedValue(vo('pending_client_signature'))

      await expect(recordVoSigned(VO_ID, null)).resolves.toEqual({})

      expect(mocks.set).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'signed', signed_document_id: null })
      )
      expect(mocks.revokeOpenSigningSessions).toHaveBeenCalledWith(
        tx,
        TENANT_ID,
        'variation_order',
        VO_ID
      )
    })

    it('refuses when the VO left pending signature before the lock', async () => {
      mocks.loadVo.mockResolvedValue(vo('pending_client_signature'))
      mocks.lockResults.push([])

      await expect(recordVoSigned(VO_ID, null)).resolves.toEqual({
        error: 'VO must be awaiting client signature before it can be signed',
      })
      expect(mocks.set).not.toHaveBeenCalled()
      expect(mocks.revokeOpenSigningSessions).not.toHaveBeenCalled()
    })
  })

  describe('rejectVo', () => {
    it('revokes any signing link already sent for the rejected VO', async () => {
      mocks.loadVo.mockResolvedValue(vo('pending_client_signature'))

      await expect(rejectVo(VO_ID, 'Client withdrew the change')).resolves.toEqual({})

      expect(mocks.set).toHaveBeenCalledWith({ status: 'rejected' })
      expect(mocks.revokeOpenSigningSessions).toHaveBeenCalledWith(
        tx,
        TENANT_ID,
        'variation_order',
        VO_ID
      )
      expect(mocks.writeAuditLogInTransaction).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({
          diff: { from: 'pending_client_signature', to: 'rejected', reason: 'Client withdrew the change' },
        })
      )
    })

    it('does not overwrite a VO the client signed while the rejection was in flight', async () => {
      mocks.loadVo.mockResolvedValue(vo('pending_client_signature'))
      mocks.lockResults.push([])

      const result = await rejectVo(VO_ID, 'Client withdrew the change')

      expect(result.error).toMatch(/changed while you were rejecting it/)
      expect(mocks.set).not.toHaveBeenCalled()
      expect(mocks.revokeOpenSigningSessions).not.toHaveBeenCalled()
      expect(mocks.writeAuditLogInTransaction).not.toHaveBeenCalled()
    })

    it('does not revoke anything when the rejection reason is missing', async () => {
      mocks.loadVo.mockResolvedValue(vo('pending_client_signature'))

      await expect(rejectVo(VO_ID, '   ')).resolves.toEqual({
        error: 'Rejection reason is required',
      })
      expect(mocks.transaction).not.toHaveBeenCalled()
      expect(mocks.revokeOpenSigningSessions).not.toHaveBeenCalled()
    })
  })

  describe('tenant scope', () => {
    it.each([
      ['resend', () => resendVoSigningLink(VO_ID)],
      ['cancel', () => cancelVoSigningRequest(VO_ID)],
      ['reject', () => rejectVo(VO_ID, 'No longer needed')],
      ['record', () => recordVoSigned(VO_ID, null)],
    ] as const)('answers not found when the %s targets a VO outside the caller tenant', async (_label, run) => {
      mocks.loadVo.mockResolvedValue(null)

      await expect(run()).resolves.toEqual({ error: 'VO not found' })
      expect(mocks.loadVo).toHaveBeenCalledWith(VO_ID, TENANT_ID)
      expect(mocks.transaction).not.toHaveBeenCalled()
      expect(mocks.createSigningSession).not.toHaveBeenCalled()
      expect(mocks.revokeOpenSigningSessions).not.toHaveBeenCalled()
    })

    it.each([
      ['resend', 'pending_client_signature', () => resendVoSigningLink(VO_ID)],
      ['cancel', 'pending_client_signature', () => cancelVoSigningRequest(VO_ID)],
      ['reject', 'pending_commercial_pricing', () => rejectVo(VO_ID, 'No longer needed')],
    ] as const)('the %s locks the VO by tenant and status and updates it by tenant', async (_label, status, run) => {
      mocks.loadVo.mockResolvedValue(vo(status))

      await run()

      const lock = rendered(mocks.lockWhere)
      expect(lock.sql).toContain('"variation_orders"."tenant_id"')
      expect(lock.params).toEqual([VO_ID, TENANT_ID, status])
      const update = rendered(mocks.updateWhere)
      expect(update.sql).toContain('"variation_orders"."tenant_id"')
      expect(update.params).toEqual([VO_ID, TENANT_ID])
    })
  })
})
