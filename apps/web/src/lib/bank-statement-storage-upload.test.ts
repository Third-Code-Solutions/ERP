import { describe, expect, it, vi } from 'vitest'
import { uploadBankStatementSource } from './bank-statement-storage-upload'

const signed = {
  signedUrl: 'https://storage.example.test/upload',
  token: 'signed-token',
  storagePath:
    '22222222-2222-4222-8222-222222222222/bank-statements/statement.csv',
  originalFileName: 'statement.csv',
}

const file = {
  name: 'statement.csv',
  type: 'text/csv',
  size: 128,
}

describe('bank statement storage upload handoff', () => {
  it('validates source metadata and uploads the signed tenant path', async () => {
    const sign = vi.fn().mockResolvedValue(signed)
    const upload = vi.fn().mockResolvedValue(undefined)

    await expect(
      uploadBankStatementSource(file, { sign, upload })
    ).resolves.toEqual(signed)
    expect(sign).toHaveBeenCalledWith({
      fileName: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
    })
    expect(upload).toHaveBeenCalledWith(signed, file)
  })

  it('rejects non-CSV or oversize files before signing', async () => {
    const sign = vi.fn()
    const upload = vi.fn()

    await expect(
      uploadBankStatementSource(
        { ...file, name: 'statement.pdf' },
        { sign, upload }
      )
    ).rejects.toThrow('Bank statement source must be a CSV file.')
    await expect(
      uploadBankStatementSource(
        { ...file, size: 2_000_001 },
        { sign, upload }
      )
    ).rejects.toThrow('Number must be less than or equal to 2000000')
    expect(sign).not.toHaveBeenCalled()
  })

  it('retains storage path when upload fails so caller can clean it up', async () => {
    const error = new Error('storage unavailable')
    await expect(
      uploadBankStatementSource(file, {
        sign: vi.fn().mockResolvedValue(signed),
        upload: vi.fn().mockRejectedValue(error),
      })
    ).rejects.toMatchObject({
      message: 'storage unavailable',
      storagePath: signed.storagePath,
    })
  })
})
