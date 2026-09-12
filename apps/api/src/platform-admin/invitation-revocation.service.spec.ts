import 'reflect-metadata'

import { ConflictException, ForbiddenException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Test } from '@nestjs/testing'
import { describe, expect, it, vi } from 'vitest'
import type { PlatformPrincipal } from '../auth/platform-owner.guard'
import { DatabaseService } from '../database/database.service'
import { PlatformAdministrationService } from './platform-administration.service'
import { PlatformIdentityAdminService } from './platform-identity-admin.service'

const tenantId = '11111111-1111-4111-8111-111111111111'
const userId = '22222222-2222-4222-8222-222222222222'
const invitationId = '33333333-3333-4333-8333-333333333333'
const principal: PlatformPrincipal = { userId: '44444444-4444-4444-8444-444444444444', email: 'kurt@thirdcodesolutions.com', supportSessionId: '55555555-5555-4555-8555-555555555555' }
const candidate = { id: invitationId, tenantId, tenantName: 'Synthetic', email: 'invite@example.test', fullName: 'Synthetic invite', role: 'admin', status: 'sent', authUserId: userId, createdAt: new Date(), sentAt: new Date(), acceptedAt: null, revokedAt: null, failureReason: null }
const invitedUser = { id: userId, tenantId, email: candidate.email, accountStatus: 'invited' }
type InvitationOverrides = Partial<Omit<typeof candidate, 'authUserId'>> & { authUserId?: string | null }

function query(rows: unknown[], error?: unknown) {
  const value = Promise.resolve(rows)
  const chain = {
    from: vi.fn(() => chain), innerJoin: vi.fn(() => chain), where: vi.fn(() => chain), limit: vi.fn(() => chain),
    for: vi.fn(async () => { if (error) throw error; return rows }),
    then: value.then.bind(value),
  }
  return chain
}

async function harness(options: {
  preliminary?: InvitationOverrides
  lockedInvitation?: InvitationOverrides
  user?: Partial<typeof invitedUser>
  protectedOwner?: boolean
  lockCode?: string
  providerError?: boolean
  auditError?: boolean
} = {}) {
  const preliminary = { ...candidate, ...options.preliminary }
  const current = { ...preliminary, ...options.lockedInvitation }
  const queries = [query([{ userId: principal.userId }]), query([{ id: principal.supportSessionId }])]
  if (preliminary.authUserId) queries.push(query([{ ...invitedUser, ...options.user }], options.lockCode ? { cause: { code: options.lockCode } } : undefined))
  queries.push(query([current], !preliminary.authUserId && options.lockCode ? { cause: { code: options.lockCode } } : undefined))
  if (preliminary.authUserId) queries.push(query(options.protectedOwner ? [{ userId }] : []))
  const select = vi.fn()
  for (const item of queries) select.mockReturnValueOnce(item)
  const updateWhere = vi.fn().mockResolvedValue(undefined)
  const updateSet = vi.fn(() => ({ where: updateWhere }))
  const update = vi.fn(() => ({ set: updateSet }))
  const auditValues = options.auditError ? vi.fn().mockRejectedValue(new Error('Synthetic audit failure')) : vi.fn().mockResolvedValue(undefined)
  const tx = { select, update, insert: vi.fn(() => ({ values: auditValues })) }
  const transaction = vi.fn(async (callback: (client: typeof tx) => Promise<void>) => callback(tx))
  const read = vi.fn().mockReturnValueOnce(query([preliminary])).mockReturnValue(query([{ ...current, status: 'revoked', revokedAt: new Date() }]))
  const setSuspended = vi.fn().mockResolvedValue(undefined)
  if (options.providerError) setSuspended.mockRejectedValueOnce(new Error('Synthetic provider failure'))
  const module = await Test.createTestingModule({ providers: [PlatformAdministrationService,
    { provide: ConfigService, useValue: new ConfigService() },
    { provide: DatabaseService, useValue: { client: { select: read, transaction } } },
    { provide: PlatformIdentityAdminService, useValue: { setSuspended } },
  ] }).compile()
  return { service: module.get(PlatformAdministrationService), module, setSuspended, update, updateSet, updateWhere, queries, transaction, auditValues }
}

describe('invitation revocation locked admission', () => {
  it.each(['active', 'disabled', 'suspended'])('rejects a now-%s user before Auth or compensation', async (accountStatus) => {
    const f = await harness({ user: { accountStatus } })
    try {
      await expect(f.service.revokeInvitation(invitationId, principal)).rejects.toBeInstanceOf(ConflictException)
      expect(f.setSuspended).not.toHaveBeenCalled()
      expect(f.update).not.toHaveBeenCalled()
    } finally { await f.module.close() }
  })

  it.each(['accepted', 'revoked', 'failed', 'pending'])('rejects a freshly locked %s bound invitation', async (status) => {
    const f = await harness({ lockedInvitation: { status } })
    try {
      await expect(f.service.revokeInvitation(invitationId, principal)).rejects.toBeInstanceOf(ConflictException)
      expect(f.setSuspended).not.toHaveBeenCalled()
    } finally { await f.module.close() }
  })

  it.each([
    { lockedInvitation: { tenantId: userId } },
    { lockedInvitation: { authUserId: principal.userId } },
    { lockedInvitation: { email: 'different@example.test' } },
    { user: { tenantId: userId } },
  ])('rejects stale or mismatched identity binding %j', async (options) => {
    const f = await harness(options)
    try {
      await expect(f.service.revokeInvitation(invitationId, principal)).rejects.toBeInstanceOf(ConflictException)
      expect(f.setSuspended).not.toHaveBeenCalled()
      expect(f.update).not.toHaveBeenCalled()
    } finally { await f.module.close() }
  })

  it('protects the platform assignment before Auth', async () => {
    const f = await harness({ protectedOwner: true })
    try {
      await expect(f.service.revokeInvitation(invitationId, principal)).rejects.toBeInstanceOf(ForbiddenException)
      expect(f.setSuspended).not.toHaveBeenCalled()
    } finally { await f.module.close() }
  })

  it.each(['55P03', '40P01'])('maps wrapped %s contention without provider effects', async (lockCode) => {
    const f = await harness({ lockCode })
    try {
      await expect(f.service.revokeInvitation(invitationId, principal)).rejects.toBeInstanceOf(ConflictException)
      expect(f.setSuspended).not.toHaveBeenCalled()
    } finally { await f.module.close() }
  })

  it('revokes a sent invitation after user then invitation NOWAIT admission', async () => {
    const f = await harness()
    try {
      expect(await f.service.revokeInvitation(invitationId, principal)).toMatchObject({ status: 'revoked' })
      expect(f.queries[2]?.for).toHaveBeenCalledWith('update', { noWait: true })
      expect(f.queries[3]?.for).toHaveBeenCalledWith('update', { noWait: true })
      expect(f.setSuspended).toHaveBeenCalledExactlyOnceWith(userId, true)
      expect(f.update).toHaveBeenCalledTimes(2)
      expect(f.auditValues).toHaveBeenCalledOnce()
    } finally { await f.module.close() }
  })

  it('revokes a still-pending unbound invitation without Auth', async () => {
    const f = await harness({ preliminary: { status: 'pending', authUserId: null } })
    try {
      expect(await f.service.revokeInvitation(invitationId, principal)).toMatchObject({ status: 'revoked' })
      expect(f.queries[2]?.for).toHaveBeenCalledWith('update', { noWait: true })
      expect(f.setSuspended).not.toHaveBeenCalled()
      expect(f.update).toHaveBeenCalledOnce()
    } finally { await f.module.close() }
  })

  it('rejects provisioning that changed a preliminary pending invitation', async () => {
    const f = await harness({ preliminary: { status: 'pending', authUserId: null }, lockedInvitation: { status: 'sent', authUserId: userId } })
    try {
      await expect(f.service.revokeInvitation(invitationId, principal)).rejects.toBeInstanceOf(ConflictException)
      expect(f.setSuspended).not.toHaveBeenCalled()
    } finally { await f.module.close() }
  })

  it('preserves provider failure rather than reporting revocation success', async () => {
    const f = await harness({ providerError: true })
    try {
      await expect(f.service.revokeInvitation(invitationId, principal)).rejects.toThrow('Synthetic provider failure')
      expect(f.update).not.toHaveBeenCalled()
    } finally { await f.module.close() }
  })

  it('compensates only the admitted target after a successful ban and database failure', async () => {
    const f = await harness({ auditError: true })
    try {
      await expect(f.service.revokeInvitation(invitationId, principal)).rejects.toThrow('Synthetic audit failure')
      expect(f.setSuspended.mock.calls).toEqual([[userId, true], [userId, false]])
    } finally { await f.module.close() }
  })
})
