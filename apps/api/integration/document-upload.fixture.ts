import { vi } from 'vitest'
import type { Request } from 'express'
import type { DocumentUploadReserve } from '@third-code-erp/shared-types'
import type { ErpPrincipal } from '../src/auth/current-principal.decorator'
import { AuditService } from '../src/audit/audit.service'
import type { DatabaseService } from '../src/database/database.service'
import { DocumentUploadService } from '../src/documents/document-upload.service'
import { DocumentUploadStorage } from '../src/documents/document-upload.storage'

/** Real reservation/transaction authority; only external bytes are synthetic. */
export function documentUploadFixture(database: DatabaseService, size: number) {
  const storage = {
    size: vi.fn().mockResolvedValue(size), put: vi.fn().mockResolvedValue(true), remove: vi.fn().mockResolvedValue(undefined),
    stage: vi.fn(async (_request: Request, _size: number, consume: (file: string, hash: string) => Promise<unknown>) => consume('synthetic-file', 'a'.repeat(64))),
  }
  const uploads = new DocumentUploadService(database, new AuditService(), storage as unknown as DocumentUploadStorage)
  return { uploads, prepare: async (command: DocumentUploadReserve, principal: ErpPrincipal, key: string) => {
    const reservation = await uploads.reserve(command, principal, key)
    await uploads.upload(reservation.reservationId, principal, {} as Request)
    return reservation.storagePath
  } }
}
