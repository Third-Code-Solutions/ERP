import { z } from 'zod'

const uuid = z.string().uuid()

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date requires YYYY-MM-DD')
  .refine((value) => {
    const [yearText, monthText, dayText] = value.split('-')
    const year = Number(yearText)
    const month = Number(monthText)
    const day = Number(dayText)
    if (year < 1 || month < 1 || month > 12 || day < 1) return false
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
    const daysInMonth = [
      31,
      leap ? 29 : 28,
      31,
      30,
      31,
      30,
      31,
      31,
      30,
      31,
      30,
      31,
    ]
    return day <= daysInMonth[month - 1]!
  }, 'Date must be a real calendar date')

const signedCents = z
  .number()
  .int()
  .min(Number.MIN_SAFE_INTEGER)
  .max(Number.MAX_SAFE_INTEGER)

const sourceBase64 = z
  .string()
  .min(1)
  .max(2_700_000)
  .regex(/^[A-Za-z0-9+/]+={0,2}$/, 'Source file encoding is invalid.')
  .refine((value) => value.length % 4 === 0, {
    message: 'Source file encoding is invalid.',
  })

export const bankStatementImportBodySchema = z
  .object({
    cashAccountId: uuid,
    referenceNumber: z.string().trim().min(1).max(120),
    sourceFileName: z.string().trim().min(1).max(255),
    statementStart: isoDate,
    statementEnd: isoDate,
    openingBalanceCents: signedCents,
    closingBalanceCents: signedCents,
    sourceBase64,
  })
  .strict()
  .refine((value) => value.statementStart <= value.statementEnd, {
    message: 'Statement end must be on or after its start.',
    path: ['statementEnd'],
  })

export const bankStatementImportCommandSchema = bankStatementImportBodySchema

export const bankStatementImportResultSchema = z
  .object({
    statementId: uuid,
    tenantId: uuid,
    status: z.literal('draft'),
    lineCount: z.number().int().min(1).max(5_000),
    sourceSha256: z.string().regex(/^[0-9a-f]{64}$/),
  })
  .strict()

export type BankStatementImportBody = z.infer<
  typeof bankStatementImportBodySchema
>
export type BankStatementImportCommand = z.infer<
  typeof bankStatementImportCommandSchema
>
export type BankStatementImportResult = z.infer<
  typeof bankStatementImportResultSchema
>
