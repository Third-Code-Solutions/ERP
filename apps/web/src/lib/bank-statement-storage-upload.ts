import {
  bankStatementImportUploadSignBodySchema,
  bankStatementImportUploadSignResultSchema,
  type BankStatementImportUploadSignBody,
  type BankStatementImportUploadSignResult,
} from '@third-code-erp/shared-types'

export type BankStatementUploadFile = Pick<
  File,
  'name' | 'type' | 'size'
>

export interface BankStatementUploadTransport {
  sign: (
    body: BankStatementImportUploadSignBody
  ) => Promise<unknown>
  upload: (
    signed: BankStatementImportUploadSignResult,
    file: BankStatementUploadFile
  ) => Promise<void>
}

export class BankStatementSourceUploadError extends Error {
  constructor(
    message: string,
    readonly storagePath: string
  ) {
    super(message)
    this.name = 'BankStatementSourceUploadError'
  }
}

/**
 * Validate metadata, obtain a tenant-scoped signed URL, and upload one CSV.
 * Transport injection keeps this browser workflow deterministic in tests.
 */
export async function uploadBankStatementSource(
  file: BankStatementUploadFile,
  transport: BankStatementUploadTransport
): Promise<BankStatementImportUploadSignResult> {
  const body = bankStatementImportUploadSignBodySchema.parse({
    fileName: file.name,
    mimeType: file.type || 'text/csv',
    sizeBytes: file.size,
  })
  const signed = bankStatementImportUploadSignResultSchema.parse(
    await transport.sign(body)
  )
  try {
    await transport.upload(signed, file)
  } catch (error) {
    throw new BankStatementSourceUploadError(
      error instanceof Error ? error.message : 'Bank statement upload failed',
      signed.storagePath
    )
  }
  return signed
}
