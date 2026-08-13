import 'reflect-metadata'

import { describe, expect, it, vi } from 'vitest'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import { FinanceReconciliationStorageController } from './finance-reconciliation-storage.controller'
import {
  FinanceReconciliationStorageCleanupPipe,
  FinanceReconciliationStorageSignPipe,
} from './finance-reconciliation-workflow.pipe'

const PRINCIPAL: ErpPrincipal = {
  userId: '11111111-1111-4111-8111-111111111111',
  tenantId: '22222222-2222-4222-8222-222222222222',
  role: 'finance',
  email: 'finance@example.test',
}

describe('finance reconciliation Storage controller contract', () => {
  it('validates sign and cleanup bodies before forwarding principal', async () => {
    const storage = {
      createSignedUpload: vi.fn().mockResolvedValue({
        signedUrl: 'https://storage.example.test/upload',
        token: 'token',
        storagePath:
          '22222222-2222-4222-8222-222222222222/bank-statements/source.csv',
        originalFileName: 'source.csv',
      }),
      cleanup: vi.fn().mockResolvedValue({ ok: true }),
    }
    const controller = new FinanceReconciliationStorageController(storage as never)
    const signBody = new FinanceReconciliationStorageSignPipe().transform({
      fileName: 'source.csv',
      mimeType: 'text/csv',
      sizeBytes: 90,
    })
    const cleanupBody = new FinanceReconciliationStorageCleanupPipe().transform({
      storagePath:
        '22222222-2222-4222-8222-222222222222/bank-statements/source.csv',
    })

    await expect(controller.sign(signBody, PRINCIPAL)).resolves.toMatchObject({
      token: 'token',
    })
    await expect(controller.cleanup(cleanupBody, PRINCIPAL)).resolves.toEqual({
      ok: true,
    })
    expect(storage.createSignedUpload).toHaveBeenCalledWith(signBody, PRINCIPAL)
    expect(storage.cleanup).toHaveBeenCalledWith(cleanupBody, PRINCIPAL)
    expect(() =>
      new FinanceReconciliationStorageSignPipe().transform({ fileName: 'x.pdf' })
    ).toThrow('Invalid bank statement upload request')
  })
})
