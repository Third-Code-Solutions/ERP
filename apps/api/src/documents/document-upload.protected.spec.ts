import 'reflect-metadata'
import { Reflector } from '@nestjs/core'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'
import { CapabilityGuard } from '../auth/capability.guard'
import { SupabaseJwtGuard } from '../auth/supabase-jwt.guard'
import type { SupabaseIdentityService } from '../auth/supabase-identity.service'
import type { DatabaseService } from '../database/database.service'
import { DocumentUploadController } from './document-upload.controller'
import { DocumentUploadService } from './document-upload.service'

const id = '11111111-1111-4111-8111-111111111111'
describe('Core upload authenticated transport boundary', () => {
  it('denies missing bearer, viewer and suspended tenant before consuming raw bytes', async () => {
    const member = { tenantId: id, role: 'viewer', email: 'synthetic@test.invalid', accountStatus: 'active', tenantStatus: 'active' }
    const database = { client: { select: () => ({ from: () => ({ innerJoin: () => ({ where: () => ({ limit: async () => [member] }) }) }) }) } } as unknown as DatabaseService
    const identity = { verifyAccessToken: vi.fn().mockResolvedValue({ userId: id }) } as unknown as SupabaseIdentityService
    const upload = vi.fn().mockResolvedValue({ uploaded: true })
    const reserve = vi.fn().mockResolvedValue({ reservationId: id })
    const module = await Test.createTestingModule({ controllers: [DocumentUploadController], providers: [{ provide: DocumentUploadService, useValue: { upload, reserve } }] }).compile()
    const app = module.createNestApplication()
    const reflector = new Reflector()
    app.useGlobalGuards(new SupabaseJwtGuard(identity, reflector, database), new CapabilityGuard(reflector))
    app.enableCors({ origin: ['https://abi.example.invalid'] })
    await app.init()
    try {
      const path = `/v1/document-uploads/${id}/content`
      await request(app.getHttpServer()).put(path).set('content-type', 'application/octet-stream').send(Buffer.from('test')).expect(401)
      await request(app.getHttpServer()).put(path).set('authorization', 'Bearer synthetic').set('content-type', 'application/octet-stream').send(Buffer.from('test')).expect(403)
      member.role = 'pm'
      member.tenantStatus = 'suspended'
      await request(app.getHttpServer()).put(path).set('authorization', 'Bearer synthetic').set('content-type', 'application/octet-stream').send(Buffer.from('test')).expect(403)
      expect(upload).not.toHaveBeenCalled()
      member.tenantStatus = 'active'
      await request(app.getHttpServer()).put(path).set('authorization', 'Bearer synthetic').set('content-type', 'application/octet-stream').send(Buffer.from('test')).expect(200)
      expect(upload).toHaveBeenCalledWith(id, expect.objectContaining({ userId: id, tenantId: id, role: 'pm' }), expect.anything())
      const allowed = await request(app.getHttpServer()).options(path).set('origin', 'https://abi.example.invalid').set('access-control-request-method', 'PUT')
      expect(allowed.headers['access-control-allow-origin']).toBe('https://abi.example.invalid')
      const denied = await request(app.getHttpServer()).options(path).set('origin', 'https://foreign.example.invalid').set('access-control-request-method', 'PUT')
      expect(denied.headers['access-control-allow-origin']).toBeUndefined()
    } finally { await app.close() }
  })
})
