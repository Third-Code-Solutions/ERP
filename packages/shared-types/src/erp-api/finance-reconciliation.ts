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

const nonNegativeCount = z
  .number()
  .int()
  .min(0)
  .max(Number.MAX_SAFE_INTEGER)

const signedCents = z
  .number()
  .int()
  .min(Number.MIN_SAFE_INTEGER)
  .max(Number.MAX_SAFE_INTEGER)

export const financeReconciliationQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(500).default(500),
  })
  .strict()

export type FinanceReconciliationQuery = z.infer<
  typeof financeReconciliationQuerySchema
>

export const financeReconciliationRowSchema = z
  .object({
    id: uuid,
    referenceNumber: z.string().trim().min(1).max(120),
    sourceFileName: z.string().trim().min(1).max(255),
    status: z.enum(['draft', 'reconciled', 'voided']),
    statementStart: isoDate,
    statementEnd: isoDate,
    currency: z.string().regex(/^[A-Z]{3}$/),
    closingBalanceCents: signedCents,
    cashAccountId: uuid,
    cashAccountName: z.string().trim().min(1).max(160),
    lineCount: nonNegativeCount,
    matchedCount: nonNegativeCount,
  })
  .strict()

export type FinanceReconciliationRow = z.infer<
  typeof financeReconciliationRowSchema
>

export const financeReconciliationResultSchema = z
  .object({
    tenantId: uuid,
    rows: z.array(financeReconciliationRowSchema).max(500),
    total: nonNegativeCount,
    truncated: z.boolean(),
    draftCount: nonNegativeCount,
    reconciledCount: nonNegativeCount,
    openExceptions: nonNegativeCount,
    channels: nonNegativeCount,
  })
  .strict()

export type FinanceReconciliationResult = z.infer<
  typeof financeReconciliationResultSchema
>
