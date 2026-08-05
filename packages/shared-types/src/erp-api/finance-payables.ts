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

const supplierBillStatus = z.enum(['draft', 'posted', 'reversed'])

const cents = z
  .number()
  .int()
  .min(0)
  .max(Number.MAX_SAFE_INTEGER)

export const financePayablesQuerySchema = z
  .object({
    vendorId: uuid.optional(),
    projectId: uuid.optional(),
    status: supplierBillStatus.optional(),
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

export type FinancePayablesQuery = z.infer<typeof financePayablesQuerySchema>

export const financePayablesRowSchema = z
  .object({
    id: uuid,
    vendorBillNumber: z.string().trim().min(1).max(80),
    internalNumber: z.string().trim().min(1).max(40).nullable(),
    status: supplierBillStatus,
    billDate: isoDate,
    dueDate: isoDate.nullable(),
    subtotalCents: cents,
    inputVatCents: cents,
    withholdingTaxCents: cents,
    totalPayableCents: cents,
    paidCents: cents,
    openCents: cents,
    postedAt: z.string().datetime({ offset: true }).nullable(),
    postingJournalEntryId: uuid.nullable(),
    vendorId: uuid,
    vendorName: z.string().trim().min(1).max(255),
    purchaseOrderId: uuid,
    purchaseOrderNumber: z.string().trim().min(1).max(50),
    projectId: uuid,
    projectName: z.string().trim().min(1).max(255),
  })
  .strict()

export type FinancePayablesRow = z.infer<typeof financePayablesRowSchema>

export const financePayablesResultSchema = z
  .object({
    tenantId: uuid,
    asOfDate: isoDate,
    rows: z.array(financePayablesRowSchema).max(500),
    total: z.number().int().nonnegative(),
    totalPayableCents: cents,
    totalPaidCents: cents,
    totalOpenCents: cents,
    overdueOpenCents: cents,
    overdueCount: z.number().int().nonnegative(),
    draftCount: z.number().int().nonnegative(),
    postedOpenCount: z.number().int().nonnegative(),
    agingCurrentCents: cents,
    aging1To30Cents: cents,
    aging31To60Cents: cents,
    aging61To90Cents: cents,
    aging90PlusCents: cents,
    page: z.number().int().min(1),
    limit: z.number().int().min(1).max(500),
    totalPages: z.number().int().min(1),
  })
  .strict()

export type FinancePayablesResult = z.infer<typeof financePayablesResultSchema>
