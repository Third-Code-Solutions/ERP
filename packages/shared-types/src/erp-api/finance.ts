import { z } from 'zod'

export const journalPostCommandSchema = z
  .object({
    journalEntryId: z.string().uuid(),
  })
  .strict()

export const journalPostResultSchema = z
  .object({
    journalEntryId: z.string().uuid(),
    tenantId: z.string().uuid(),
    postedNumber: z.string().regex(/^JE-\d{4}-\d{6}$/),
  })
  .strict()

export type JournalPostCommand = z.infer<typeof journalPostCommandSchema>
export type JournalPostResult = z.infer<typeof journalPostResultSchema>

const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Posting date requires YYYY-MM-DD')
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
  }, 'Posting date must be a real calendar date')

export const journalReverseBodySchema = z
  .object({
    reason: z.string().trim().min(3).max(500),
    postingDate: isoDateSchema,
  })
  .strict()

export const journalReverseCommandSchema = z
  .object({
    journalEntryId: z.string().uuid(),
    reason: z.string().trim().min(3).max(500),
    postingDate: isoDateSchema,
  })
  .strict()

export const journalReverseResultSchema = z
  .object({
    journalEntryId: z.string().uuid(),
    tenantId: z.string().uuid(),
    reversalJournalEntryId: z.string().uuid(),
    reversalNumber: z.string().regex(/^JE-\d{4}-\d{6}$/),
  })
  .strict()

export type JournalReverseCommand = z.infer<typeof journalReverseCommandSchema>
export type JournalReverseBody = z.infer<typeof journalReverseBodySchema>
export type JournalReverseResult = z.infer<typeof journalReverseResultSchema>

export const supplierBillPostCommandSchema = z
  .object({
    postingDate: isoDateSchema,
  })
  .strict()

export const supplierBillPostResultSchema = z
  .object({
    supplierBillId: z.string().uuid(),
    tenantId: z.string().uuid(),
    status: z.literal('posted'),
    supplierBillNumber: z.string().regex(/^SB-\d{4}-\d{6}$/),
    journalEntryId: z.string().uuid(),
    journalEntryNumber: z.string().regex(/^JE-\d{4}-\d{6}$/),
  })
  .strict()

export type SupplierBillPostCommand = z.infer<
  typeof supplierBillPostCommandSchema
>
export type SupplierBillPostResult = z.infer<
  typeof supplierBillPostResultSchema
>

export const supplierBillReverseBodySchema = z
  .object({
    reason: z.string().trim().min(3).max(500),
    postingDate: isoDateSchema,
  })
  .strict()

export const supplierBillReverseCommandSchema = z
  .object({
    supplierBillId: z.string().uuid(),
    reason: z.string().trim().min(3).max(500),
    postingDate: isoDateSchema,
  })
  .strict()

export const supplierBillReverseResultSchema = z
  .object({
    supplierBillId: z.string().uuid(),
    tenantId: z.string().uuid(),
    status: z.literal('reversed'),
    reversalJournalEntryId: z.string().uuid(),
    reversalJournalEntryNumber: z.string().regex(/^JE-\d{4}-\d{6}$/),
  })
  .strict()

export type SupplierBillReverseBody = z.infer<
  typeof supplierBillReverseBodySchema
>
export type SupplierBillReverseCommand = z.infer<
  typeof supplierBillReverseCommandSchema
>
export type SupplierBillReverseResult = z.infer<
  typeof supplierBillReverseResultSchema
>

export const cashTransactionPostCommandSchema = z
  .object({
    cashTransactionId: z.string().uuid(),
    postingDate: isoDateSchema,
  })
  .strict()

export const cashTransactionPostBodySchema = z
  .object({
    postingDate: isoDateSchema,
  })
  .strict()

export const cashTransactionPostResultSchema = z
  .object({
    cashTransactionId: z.string().uuid(),
    tenantId: z.string().uuid(),
    status: z.literal('posted'),
    cashTransactionNumber: z.string().regex(/^CT-\d{4}-\d{6}$/),
    journalEntryId: z.string().uuid(),
    journalEntryNumber: z.string().regex(/^JE-\d{4}-\d{6}$/),
  })
  .strict()

export type CashTransactionPostCommand = z.infer<
  typeof cashTransactionPostCommandSchema
>
export type CashTransactionPostBody = z.infer<
  typeof cashTransactionPostBodySchema
>
export type CashTransactionPostResult = z.infer<
  typeof cashTransactionPostResultSchema
>

export const cashTransactionReverseBodySchema = z
  .object({
    reason: z.string().trim().min(3).max(500),
    postingDate: isoDateSchema,
  })
  .strict()

export const cashTransactionReverseCommandSchema = z
  .object({
    cashTransactionId: z.string().uuid(),
    reason: z.string().trim().min(3).max(500),
    postingDate: isoDateSchema,
  })
  .strict()

export const cashTransactionReverseResultSchema = z
  .object({
    cashTransactionId: z.string().uuid(),
    tenantId: z.string().uuid(),
    status: z.literal('reversed'),
    reversalJournalEntryId: z.string().uuid(),
    reversalJournalEntryNumber: z.string().regex(/^JE-\d{4}-\d{6}$/),
  })
  .strict()

export type CashTransactionReverseBody = z.infer<
  typeof cashTransactionReverseBodySchema
>
export type CashTransactionReverseCommand = z.infer<
  typeof cashTransactionReverseCommandSchema
>
export type CashTransactionReverseResult = z.infer<
  typeof cashTransactionReverseResultSchema
>

export const customerInvoiceIssueCommandSchema = z
  .object({
    postingDate: isoDateSchema,
  })
  .strict()

export const customerInvoiceIssueResultSchema = z
  .object({
    invoiceId: z.string().uuid(),
    tenantId: z.string().uuid(),
    status: z.literal('issued'),
    invoiceNumber: z.string().trim().min(1).max(50),
    journalEntryId: z.string().uuid(),
    journalEntryNumber: z.string().regex(/^JE-\d{4}-\d{6}$/),
  })
  .strict()

export type CustomerInvoiceIssueCommand = z.infer<
  typeof customerInvoiceIssueCommandSchema
>
export type CustomerInvoiceIssueResult = z.infer<
  typeof customerInvoiceIssueResultSchema
>

export const customerInvoiceReverseBodySchema = z
  .object({
    reason: z.string().trim().min(3).max(500),
    postingDate: isoDateSchema,
  })
  .strict()

export const customerInvoiceReverseCommandSchema = z
  .object({
    invoiceId: z.string().uuid(),
    reason: z.string().trim().min(3).max(500),
    postingDate: isoDateSchema,
  })
  .strict()

export const customerInvoiceReverseResultSchema = z
  .object({
    invoiceId: z.string().uuid(),
    tenantId: z.string().uuid(),
    status: z.literal('cancelled'),
    reversalJournalEntryId: z.string().uuid(),
    reversalJournalEntryNumber: z.string().regex(/^JE-\d{4}-\d{6}$/),
  })
  .strict()

export type CustomerInvoiceReverseBody = z.infer<
  typeof customerInvoiceReverseBodySchema
>
export type CustomerInvoiceReverseCommand = z.infer<
  typeof customerInvoiceReverseCommandSchema
>
export type CustomerInvoiceReverseResult = z.infer<
  typeof customerInvoiceReverseResultSchema
>

export const customerInvoiceCancelBodySchema = z.object({}).strict()

export const customerInvoiceCancelCommandSchema = z
  .object({
    invoiceId: z.string().uuid(),
  })
  .strict()

export const customerInvoiceCancelResultSchema = z
  .object({
    invoiceId: z.string().uuid(),
    tenantId: z.string().uuid(),
    status: z.literal('cancelled'),
  })
  .strict()

export type CustomerInvoiceCancelBody = z.infer<
  typeof customerInvoiceCancelBodySchema
>
export type CustomerInvoiceCancelCommand = z.infer<
  typeof customerInvoiceCancelCommandSchema
>
export type CustomerInvoiceCancelResult = z.infer<
  typeof customerInvoiceCancelResultSchema
>
