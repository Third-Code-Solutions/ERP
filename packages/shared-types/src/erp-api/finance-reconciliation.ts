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

const financeReconciliationDetailStatementSchema = z
  .object({
    id: uuid,
    referenceNumber: z.string().trim().min(1).max(120),
    sourceFileName: z.string().trim().min(1).max(255),
    sourceSha256: z.string().regex(/^[0-9a-f]{64}$/),
    status: z.enum(['draft', 'reconciled', 'voided']),
    statementStart: isoDate,
    statementEnd: isoDate,
    currency: z.string().regex(/^[A-Z]{3}$/),
    openingBalanceCents: signedCents,
    closingBalanceCents: signedCents,
    cashAccountId: uuid,
    cashAccountName: z.string().trim().min(1).max(160),
    cashAccountKind: z.enum(['bank', 'e_wallet']),
    reconciledAt: z.string().datetime({ offset: true }).nullable(),
    voidedAt: z.string().datetime({ offset: true }).nullable(),
    voidReason: z.string().trim().min(3).max(2_000).nullable(),
  })
  .strict()

const financeReconciliationDetailLineSchema = z
  .object({
    id: uuid,
    lineNumber: z.number().int().min(1),
    transactionDate: isoDate,
    referenceNumber: z.string().trim().max(120).nullable(),
    description: z.string().trim().min(1).max(2_000),
    amountCents: signedCents,
    matchedCashTransactionId: uuid.nullable(),
    matchedAt: z.string().datetime({ offset: true }).nullable(),
    matchedInternalNumber: z.string().trim().max(40).nullable(),
    matchedReferenceNumber: z.string().trim().max(100).nullable(),
    matchedTransactionDate: isoDate.nullable(),
  })
  .strict()

const financeReconciliationDetailCandidateSchema = z
  .object({
    id: uuid,
    internalNumber: z.string().trim().max(40).nullable(),
    referenceNumber: z.string().trim().min(1).max(100),
    transactionDate: isoDate,
    direction: z.enum(['receipt', 'disbursement']),
    amountCents: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
  })
  .strict()

export const financeReconciliationDetailResultSchema = z
  .object({
    tenantId: uuid,
    statement: financeReconciliationDetailStatementSchema,
    lines: z.array(financeReconciliationDetailLineSchema).max(500),
    candidates: z.array(financeReconciliationDetailCandidateSchema).max(500),
  })
  .strict()

export type FinanceReconciliationDetailStatement = z.infer<
  typeof financeReconciliationDetailStatementSchema
>
export type FinanceReconciliationDetailLine = z.infer<
  typeof financeReconciliationDetailLineSchema
>
export type FinanceReconciliationDetailCandidate = z.infer<
  typeof financeReconciliationDetailCandidateSchema
>
export type FinanceReconciliationDetailResult = z.infer<
  typeof financeReconciliationDetailResultSchema
>
