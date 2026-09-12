import 'reflect-metadata'
import { request as httpRequest } from 'node:http'
import { Readable, Writable } from 'node:stream'
import { ForbiddenException, UnauthorizedException, type INestApplication, type ExecutionContext } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CapabilityGuard } from '../auth/capability.guard'
import { ERP_ROLES, type AuthenticatedRequest, type ErpPrincipal } from '../auth/current-principal.decorator'
import { InspectionPhotoController } from './inspection-photo.controller'
import { InspectionPhotoService } from './inspection-photo.service'
import { buildInspectionPhotoUploadCommand, MAX_INSPECTION_PHOTO_BYTES } from './inspection-photo-upload'
import { INSPECTION_PHOTO_INGRESS_MS } from './inspection-photo-upload.interceptor'

const actor = '11111111-1111-4111-8111-111111111111'
const tenant = '22222222-2222-4222-8222-222222222222'
const opportunity = '33333333-3333-4333-8333-333333333333'
const route = `/v1/opportunities/${opportunity}/inspection-photos/upload`
const headers = { Authorization: 'Bearer synthetic', 'x-expected-actor-id': actor, 'x-expected-tenant-id': tenant }

describe('direct inspection multipart HTTP boundary (synthetic identity)', () => {
  let app: INestApplication
  afterEach(async () => { vi.restoreAllMocks(); await app?.close() })
  async function harness(role: ErpPrincipal['role'] = 'commercial') {
    const service = { authorizeUpload: vi.fn().mockResolvedValue(undefined), upload: vi.fn(async (id, file, principal) => buildInspectionPhotoUploadCommand(principal.tenantId, id, file)) }
    const module = await Test.createTestingModule({ controllers: [InspectionPhotoController], providers: [{ provide: InspectionPhotoService, useValue: service }] }).compile()
    app = module.createNestApplication()
    app.useGlobalGuards({ canActivate(context: ExecutionContext) {
      const req = context.switchToHttp().getRequest<AuthenticatedRequest>()
      if (!req.headers.authorization) throw new UnauthorizedException()
      req.principal = { userId: actor, tenantId: tenant, role, email: 'synthetic@example.test' }
      return true
    } }, new CapabilityGuard(new Reflector()))
    await app.init()
    return service
  }
  function image(size = 4): Buffer { const bytes = Buffer.alloc(size); bytes.set([255, 216, 255]); return bytes }
  it.each(ERP_ROLES)('enforces the capability before multipart parsing for %s', async role => {
    const service = await harness(role)
    const allowed = ['owner', 'admin', 'commercial'].includes(role)
    await request(app.getHttpServer()).post(route).set(headers).attach('file', image(), 'photo.jpg').expect(allowed ? 201 : 403)
    expect(service.authorizeUpload).toHaveBeenCalledTimes(allowed ? 1 : 0)
    expect(service.upload).toHaveBeenCalledTimes(allowed ? 1 : 0)
  })
  it('accepts a physical 15 MiB file and derives metadata despite hostile declared MIME', async () => {
    const service = await harness()
    const response = await request(app.getHttpServer()).post(route).set(headers).attach('file', image(MAX_INSPECTION_PHOTO_BYTES), { filename: 'photo.jpg', contentType: 'text/plain' }).expect(201)
    expect(response.body).toMatchObject({ sizeBytes: MAX_INSPECTION_PHOTO_BYTES, mimeType: 'image/jpeg', fileName: 'photo.jpg' })
    expect(service.upload).toHaveBeenCalledTimes(1)
  })
  it('rejects physically oversized files before registration', async () => {
    const service = await harness()
    await request(app.getHttpServer()).post(route).set(headers).attach('file', image(MAX_INSPECTION_PHOTO_BYTES + 1), 'photo.jpg').expect(413)
    expect(service.upload).not.toHaveBeenCalled()
  })
  it('rejects authentication, owner and current scope before parsing malformed multipart', async () => {
    const service = await harness()
    await request(app.getHttpServer()).post(route).set('Content-Type', 'multipart/form-data').send('broken').expect(401)
    await request(app.getHttpServer()).post(route).set({ ...headers, 'x-expected-actor-id': opportunity }).set('Content-Type', 'multipart/form-data').send('broken').expect(403)
    await request(app.getHttpServer()).post(route).set({ ...headers, 'x-expected-tenant-id': opportunity }).set('Content-Type', 'multipart/form-data').send('broken').expect(403)
    expect(service.authorizeUpload).not.toHaveBeenCalled()
    service.authorizeUpload.mockRejectedValueOnce(new ForbiddenException())
    await request(app.getHttpServer()).post(route).set(headers).set('Content-Type', 'multipart/form-data').send('broken').expect(403)
    expect(service.upload).not.toHaveBeenCalled()
  })
  it('rejects extra fields, multiple files, wrong file names and missing files', async () => {
    const service = await harness()
    await request(app.getHttpServer()).post(route).set(headers).field('caption', 'not accepted').attach('file', image(), 'photo.jpg').expect(400)
    await request(app.getHttpServer()).post(route).set(headers).attach('file', image(), 'photo.jpg').attach('file', image(), 'other.jpg').expect(400)
    await request(app.getHttpServer()).post(route).set(headers).attach('payload', image(), 'photo.jpg').expect(400)
    await request(app.getHttpServer()).post(route).set(headers).send({}).expect(400)
    expect(service.upload).toHaveBeenCalledTimes(1) // Missing file reaches strict command validation, never Storage.
  })
  it('bounds concurrent retained buffers and releases capacity after completion', async () => {
    const service = await harness()
    let release: (() => void) | undefined
    const held = new Promise<void>(resolve => { release = resolve })
    service.upload.mockImplementation(async (id, file, principal) => { await held; return buildInspectionPhotoUploadCommand(principal.tenantId, id, file) })
    const requests = Array.from({ length: 4 }, () => request(app.getHttpServer()).post(route).set(headers).attach('file', image(), 'photo.jpg').then(response => response.status))
    try {
      await vi.waitFor(() => expect(service.upload).toHaveBeenCalledTimes(4))
      await request(app.getHttpServer()).post(route).set(headers).attach('file', image(), 'photo.jpg').expect(503)
    } finally { release?.() }
    expect(await Promise.all(requests)).toEqual([201, 201, 201, 201])
    await request(app.getHttpServer()).post(route).set(headers).attach('file', image(), 'photo.jpg').expect(201)
  })
  it.each(['deadline', 'disconnect'] as const)('settles real partial-file parsers on repeated %s and admits retries', async failure => {
    const service = await harness()
    await app.listen(0, '127.0.0.1')
    const target = new URL(route, await app.getUrl())
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const timers = vi.spyOn(globalThis, 'setTimeout')
      const pipes = vi.spyOn(Readable.prototype, 'pipe')
      let connection: ReturnType<typeof httpRequest> | undefined
      const status = new Promise<string | number | undefined>((resolve) => {
      connection = httpRequest(target, { method: 'POST', headers: { ...headers, 'content-type': 'multipart/form-data; boundary=synthetic' } }, response => {
        response.resume(); response.on('end', () => resolve(response.statusCode))
      })
      connection.on('error', error => resolve(error.message))
      connection.on('close', () => resolve('closed'))
      connection.write('--synthetic\r\nContent-Disposition: form-data; name="file"; filename="photo.jpg"\r\nContent-Type: image/jpeg\r\n\r\n')
      connection.write(image(1024 * 1024))
    })
    try {
      await vi.waitFor(() => expect(pipes.mock.calls.some(([destination]) => destination.constructor.name === 'Multipart')).toBe(true))
      const parser = pipes.mock.calls.map(([destination]) => destination).find(destination => destination.constructor.name === 'Multipart')
      if (!(parser instanceof Writable)) throw new Error('Expected actual Busboy parser')
      // Accelerate the actual installed deadline callback, not multipart parsing.
      const timer = timers.mock.calls.find(call => call[1] === INSPECTION_PHOTO_INGRESS_MS)
      if (!timer || typeof timer[0] !== 'function') throw new Error('Missing ingress deadline')
      if (failure === 'deadline') timer[0]()
      else connection?.destroy()
      expect(typeof await status).toBe('string')
      await vi.waitFor(() => expect(parser.closed).toBe(true))
      expect(parser.destroyed).toBe(true)
      expect(service.upload).not.toHaveBeenCalled()
    } finally { connection?.destroy(); timers.mockRestore(); pipes.mockRestore() }
    }
    await request(app.getHttpServer()).post(route).set(headers).attach('file', image(), 'photo.jpg').expect(201)
  })
})
