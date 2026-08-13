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

const invoiceStatus = z.enum(['issued', 'partial_payment', 'overdue'])

const cents = z
  .number()
  .int()
  .min(0)
  .max(Number.MAX_SAFE_INTEGER)

export const financeReceivablesQuerySchema = z
  .object({
    accountId: uuid.optional(),
    projectId: uuid.optional(),
    status: invoiceStatus.optional(),
    dueFrom: isoDate.optional(),
    dueTo: isoDate.optional(),
    page: z.coerce.number().int().min(1).max(100_000).default(1),
    limit: z.coerce.number().int().min(1).max(500).default(500),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.dueFrom && value.dueTo && value.dueFrom > value.dueTo) {
      context.addIssue({
        code: 'custom',
        path: ['dueTo'],
        message: 'Due-to date must be on or after the Due-from date',
      })
    }
  })

export type FinanceReceivablesQuery = z.infer<
  typeof financeReceivablesQuerySchema
>

export const financeReceivablesRowSchema = z
  .object({
    id: uuid,
    invoiceNumber: z.string().trim().min(1).max(50),
    status: invoiceStatus,
    netAmountCents: cents,
    retentionCents: cents,
    withholdingTaxCents: cents,
    currentAllocatedCents: cents,
    retentionAllocatedCents: cents,
    currentOpenCents: cents,
    retentionOpenCents: cents,
    dueDate: z.string().datetime({ offset: true }).nullable(),
    issuedAt: z.string().datetime({ offset: true }).nullable(),
    issuanceJournalEntryId: uuid,
    projectId: uuid,
    projectName: z.string().trim().min(1).max(255),
    accountId: uuid,
    accountName: z.string().trim().min(1).max(255),
  })
  .strict()

export type FinanceReceivablesRow = z.infer<
  typeof financeReceivablesRowSchema
>

export const financeReceivablesResultSchema = z
  .object({
    tenantId: uuid,
    asOfDate: isoDate,
    rows: z.array(financeReceivablesRowSchema).max(500),
    total: z.number().int().nonnegative(),
    totalDueCents: cents,
    totalRetentionCents: cents,
    totalWithheldCents: cents,
    overdueTotalCents: cents,
    overdueCount: z.number().int().nonnegative(),
    page: z.number().int().min(1),
    limit: z.number().int().min(1).max(500),
    totalPages: z.number().int().min(1),
  })
  .strict()

export type FinanceReceivablesResult = z.infer<
  typeof financeReceivablesResultSchema
>
