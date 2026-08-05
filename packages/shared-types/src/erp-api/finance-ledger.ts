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

export const financeLedgerQuerySchema = z
  .object({
    accountId: uuid.optional(),
    customerId: uuid.optional(),
    vendorId: uuid.optional(),
    projectId: uuid.optional(),
    from: isoDate.optional(),
    to: isoDate.optional(),
    page: z.coerce.number().int().min(1).max(100_000).default(1),
    limit: z.coerce.number().int().min(1).max(500).default(500),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.from && value.to && value.from > value.to) {
      context.addIssue({
        code: 'custom',
        path: ['to'],
        message: 'To date must be on or after the From date',
      })
    }
  })

export type FinanceLedgerQuery = z.infer<typeof financeLedgerQuerySchema>

export const financeLedgerAccountOptionSchema = z
  .object({
    id: uuid,
    code: z.string().trim().min(1).max(30),
    name: z.string().trim().min(1).max(160),
  })
  .strict()

export const financeLedgerPartyOptionSchema = z
  .object({
    id: uuid,
    name: z.string().trim().min(1).max(255),
  })
  .strict()

const cents = z
  .number()
  .int()
  .min(0)
  .max(Number.MAX_SAFE_INTEGER)

export const financeLedgerRowSchema = z
  .object({
    id: uuid,
    entryId: uuid,
    entryNumber: z.string().trim().max(40).nullable(),
    postingDate: isoDate,
    entryDescription: z.string().trim().max(2_000),
    accountCode: z.string().trim().min(1).max(30),
    accountName: z.string().trim().min(1).max(160),
    projectId: uuid.nullable(),
    projectName: z.string().trim().max(255).nullable(),
    customerId: uuid.nullable(),
    customerName: z.string().trim().max(255).nullable(),
    vendorId: uuid.nullable(),
    vendorName: z.string().trim().max(255).nullable(),
    lineDescription: z.string().trim().max(2_000).nullable(),
    debitCents: cents,
    creditCents: cents,
  })
  .strict()

export type FinanceLedgerRow = z.infer<typeof financeLedgerRowSchema>

export const financeLedgerResultSchema = z
  .object({
    rows: z.array(financeLedgerRowSchema).max(500),
    total: z.number().int().nonnegative(),
    totalDebitCents: cents,
    totalCreditCents: cents,
    page: z.number().int().min(1),
    limit: z.number().int().min(1).max(500),
    totalPages: z.number().int().min(1),
    ledgerAccounts: z.array(financeLedgerAccountOptionSchema).max(1_000),
    businessAccounts: z.array(financeLedgerPartyOptionSchema).max(1_000),
    vendors: z.array(financeLedgerPartyOptionSchema).max(1_000),
  })
  .strict()

export type FinanceLedgerResult = z.infer<typeof financeLedgerResultSchema>
