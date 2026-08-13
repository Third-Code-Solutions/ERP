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

const direction = z.enum(['receipt', 'disbursement'])
const status = z.enum(['draft', 'posted', 'reversed'])
const cents = z
  .number()
  .int()
  .min(0)
  .max(Number.MAX_SAFE_INTEGER)

export const financeCashQuerySchema = z
  .object({
    cashAccountId: uuid.optional(),
    direction: direction.optional(),
    status: status.optional(),
    fromDate: isoDate.optional(),
    toDate: isoDate.optional(),
    page: z.coerce.number().int().min(1).max(100_000).default(1),
    limit: z.coerce.number().int().min(1).max(500).default(500),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.fromDate && value.toDate && value.fromDate > value.toDate) {
      context.addIssue({
        code: 'custom',
        path: ['toDate'],
        message: 'To-date must be on or after the From-date',
      })
    }
  })

export type FinanceCashQuery = z.infer<typeof financeCashQuerySchema>

export const financeCashRowSchema = z
  .object({
    id: uuid,
    internalNumber: z.string().trim().min(1).max(40).nullable(),
    referenceNumber: z.string().trim().min(1).max(100),
    direction,
    status,
    transactionDate: isoDate,
    currency: z.string().regex(/^[A-Z]{3}$/),
    amountCents: cents,
    postingJournalEntryId: uuid.nullable(),
    postedAt: z.string().datetime({ offset: true }).nullable(),
    cashAccountId: uuid,
    cashAccountName: z.string().trim().min(1).max(160),
    businessAccountId: uuid.nullable(),
    businessAccountName: z.string().trim().min(1).max(255).nullable(),
    vendorId: uuid.nullable(),
    vendorName: z.string().trim().min(1).max(255).nullable(),
  })
  .strict()

export type FinanceCashRow = z.infer<typeof financeCashRowSchema>

export const financeCashResultSchema = z
  .object({
    tenantId: uuid,
    rows: z.array(financeCashRowSchema).max(500),
    total: z.number().int().nonnegative(),
    postedReceiptCents: cents,
    postedDisbursementCents: cents,
    draftCount: z.number().int().nonnegative(),
    postedCount: z.number().int().nonnegative(),
    reversedCount: z.number().int().nonnegative(),
    page: z.number().int().min(1),
    limit: z.number().int().min(1).max(500),
    totalPages: z.number().int().min(1),
  })
  .strict()

export type FinanceCashResult = z.infer<typeof financeCashResultSchema>
