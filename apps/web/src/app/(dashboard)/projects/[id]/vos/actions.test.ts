import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SQL } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'

const mocks = vi.hoisted(() => ({
  updateResults: [] as unknown[][],
  select: vi.fn(),
  update: vi.fn(),
  set: vi.fn(),
  where: vi.fn(),
  loadVo: vi.fn(),
  createSigningSession: vi.fn(),
  revokeOpenSigningSessions: vi.fn(),
  writeAuditLog: vi.fn(),
  revalidatePath: vi.fn(),
  getUserProfile: vi.fn(),
  can: vi.fn(),
}))

vi.mock('@third-code-erp/auth', () => ({
  getUserProfile: mocks.getUserProfile,
  can: mocks.can,
}))
vi.mock('@third-code-erp/database', () => ({
  db: { select: mocks.select, update: mocks.update },
}))
vi.mock('./queries', () => ({ loadVo: mocks.loadVo }))
vi.mock('@/lib/operations/integrations/docuseal', () => ({
  createSigningSession: mocks.createSigningSession,
}))
vi.mock('@/lib/operations/signing-sessions', () => ({
  revokeOpenSigningSessions: mocks.revokeOpenSigningSessions,
}))
vi.mock('@/lib/audit', () => ({ writeAuditLog: mocks.writeAuditLog }))
vi.mock('@/lib/operations/notifications', () => ({ notifyRoles: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))

import {
  cancelVoSigningRequest,
  rejectVo,
  resendVoSigningLink,
  submitVoForClientSignature,
} from './actions'

const TENANT_ID = '11111111-1111-4111-8111-111111111111'
const USER_ID = '22222222-2222-4222-8222-222222222222'
const PROJECT_ID = '33333333-3333-4333-8333-333333333333'
const VO_ID = '44444444-4444-4444-8444-444444444444'
const SIGN_URL = 'https://sign.example.test/portal/sign/secret-token'

function vo(status: string) {
  return {
    id: VO_ID,
    project_id: PROJECT_ID,
    vo_number: 'VO-0001',
    status,
    created_by: USER_ID,
  }
}

describe('variation order signing link lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.updateResults.length = 0
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
    mocks.update.mockImplementation(() => ({ set: mocks.set }))
    mocks.set.mockImplementation(() => ({ where: mocks.where }))
    mocks.where.mockImplementation(() => ({
      returning: () =>
        Promise.resolve(mocks.updateResults.shift() ?? [{ id: VO_ID }]),
    }))
    mocks.createSigningSession.mockResolvedValue({
      mechanism: 'canvas',
      token: 'secret-token',
      url: SIGN_URL,
      is_dev_stub: false,
    })
    mocks.revokeOpenSigningSessions.mockResolvedValue(undefined)
    mocks.writeAuditLog.mockResolvedValue(undefined)
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
      // Any link left by an earlier request that lost a race stops working.
      expect(mocks.revokeOpenSigningSessions).toHaveBeenCalledWith(
        TENANT_ID,
        'variation_order',
        VO_ID,
        'secret-token'
      )
      expect(JSON.stringify(mocks.writeAuditLog.mock.calls)).not.toContain('secret-token')
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
    it('issues a new link, then revokes every older link except the new one', async () => {
      mocks.loadVo.mockResolvedValue(vo('pending_client_signature'))

      const result = await resendVoSigningLink(VO_ID)

      expect(result).toEqual({ url: SIGN_URL, expiresAt: expect.any(String) })
      expect(mocks.revokeOpenSigningSessions).toHaveBeenCalledWith(
        TENANT_ID,
        'variation_order',
        VO_ID,
        'secret-token'
      )
      expect(mocks.set.mock.invocationCallOrder[0]).toBeLessThan(
        mocks.revokeOpenSigningSessions.mock.invocationCallOrder[0]!
      )
      expect(mocks.writeAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          diff: expect.objectContaining({
            from: 'pending_client_signature',
            signing_link: 'reissued',
          }),
        })
      )
      expect(JSON.stringify(mocks.writeAuditLog.mock.calls)).not.toContain('secret-token')
    })

    it('keeps the old link when the VO was signed or rejected meanwhile', async () => {
      mocks.loadVo.mockResolvedValue(vo('pending_client_signature'))
      mocks.updateResults.push([])

      const result = await resendVoSigningLink(VO_ID)

      expect(result.error).toMatch(/changed while the link was being created/)
      expect(mocks.revokeOpenSigningSessions).not.toHaveBeenCalled()
      expect(mocks.writeAuditLog).not.toHaveBeenCalled()
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
    it('returns the VO to commercial pricing and revokes its links', async () => {
      mocks.loadVo.mockResolvedValue(vo('pending_client_signature'))

      await expect(cancelVoSigningRequest(VO_ID)).resolves.toEqual({})

      expect(mocks.set).toHaveBeenCalledWith({
        status: 'pending_commercial_pricing',
        docuseal_submission_id: null,
      })
      expect(mocks.revokeOpenSigningSessions).toHaveBeenCalledWith(
        TENANT_ID,
        'variation_order',
        VO_ID
      )
      expect(mocks.writeAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          diff: {
            from: 'pending_client_signature',
            to: 'pending_commercial_pricing',
            signing_link: 'revoked',
          },
        })
      )
    })

    it('leaves links alone when a signature landed first', async () => {
      mocks.loadVo.mockResolvedValue(vo('pending_client_signature'))
      mocks.updateResults.push([])

      const result = await cancelVoSigningRequest(VO_ID)

      expect(result.error).toMatch(/no longer waiting for client signature/)
      expect(mocks.revokeOpenSigningSessions).not.toHaveBeenCalled()
    })

    it.each(['draft', 'signed'])('refuses to cancel a %s VO', async (status) => {
      mocks.loadVo.mockResolvedValue(vo(status))

      const result = await cancelVoSigningRequest(VO_ID)

      expect(result.error).toMatch(/Only a VO that is waiting for client signature/)
      expect(mocks.set).not.toHaveBeenCalled()
    })
  })

  describe('tenant scope', () => {
    it.each([
      ['resend', () => resendVoSigningLink(VO_ID)],
      ['cancel', () => cancelVoSigningRequest(VO_ID)],
    ] as const)('answers not found when the %s targets a VO outside the caller tenant', async (_label, run) => {
      mocks.loadVo.mockResolvedValue(null)

      await expect(run()).resolves.toEqual({ error: 'VO not found' })
      expect(mocks.loadVo).toHaveBeenCalledWith(VO_ID, TENANT_ID)
      expect(mocks.createSigningSession).not.toHaveBeenCalled()
      expect(mocks.update).not.toHaveBeenCalled()
      expect(mocks.revokeOpenSigningSessions).not.toHaveBeenCalled()
    })

    it.each([
      ['resend', () => resendVoSigningLink(VO_ID)],
      ['cancel', () => cancelVoSigningRequest(VO_ID)],
    ] as const)('the %s status move is guarded by tenant and status', async (_label, run) => {
      mocks.loadVo.mockResolvedValue(vo('pending_client_signature'))

      await run()

      const predicate = new PgDialect().sqlToQuery(mocks.where.mock.calls[0]![0] as SQL)
      expect(predicate.sql).toContain('"variation_orders"."tenant_id"')
      expect(predicate.params).toEqual([VO_ID, TENANT_ID, 'pending_client_signature'])
    })
  })

  describe('rejectVo', () => {
    it('revokes any signing link already sent for the rejected VO', async () => {
      mocks.loadVo.mockResolvedValue(vo('pending_client_signature'))

      await expect(rejectVo(VO_ID, 'Client withdrew the change')).resolves.toEqual({})

      expect(mocks.set).toHaveBeenCalledWith({ status: 'rejected' })
      expect(mocks.revokeOpenSigningSessions).toHaveBeenCalledWith(
        TENANT_ID,
        'variation_order',
        VO_ID
      )
    })

    it('does not revoke anything when the rejection reason is missing', async () => {
      mocks.loadVo.mockResolvedValue(vo('pending_client_signature'))

      await expect(rejectVo(VO_ID, '   ')).resolves.toEqual({
        error: 'Rejection reason is required',
      })
      expect(mocks.revokeOpenSigningSessions).not.toHaveBeenCalled()
    })
  })
})
