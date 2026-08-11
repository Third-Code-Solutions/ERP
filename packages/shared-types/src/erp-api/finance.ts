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

const cashAllocationTypeSchema = z.enum([
  'customer_current_due',
  'customer_retention',
  'supplier_bill',
])

export const cashTransactionDraftAllocationSchema = z
  .object({
    allocationType: cashAllocationTypeSchema,
    targetId: z.string().uuid(),
    description: z.string().trim().max(500).nullable().optional(),
    amountCents: z
      .number()
      .int()
      .min(1)
      .max(Number.MAX_SAFE_INTEGER),
  })
  .strict()

export const cashTransactionDraftBodySchema = z
  .object({
    transactionId: z.string().uuid().optional(),
    cashAccountId: z.string().uuid(),
    direction: z.enum(['receipt', 'disbursement']),
    counterpartyId: z.string().uuid(),
    referenceNumber: z.string().trim().min(1).max(100),
    transactionDate: isoDateSchema,
    notes: z.string().trim().max(2_000).nullable().optional(),
    allocations: z
      .array(cashTransactionDraftAllocationSchema)
      .min(1)
      .max(100),
  })
  .strict()
  .superRefine((value, context) => {
    const expected =
      value.direction === 'receipt'
        ? ['customer_current_due', 'customer_retention']
        : ['supplier_bill']
    if (
      value.allocations.some(
        (allocation) => !expected.includes(allocation.allocationType)
      )
    ) {
      context.addIssue({
        code: 'custom',
        path: ['allocations'],
        message: 'Allocations do not match the cash direction.',
      })
    }

    const total = value.allocations.reduce(
      (sum, allocation) => sum + allocation.amountCents,
      0
    )
    if (!Number.isSafeInteger(total) || total <= 0) {
      context.addIssue({
        code: 'custom',
        path: ['allocations'],
        message: 'Enter a valid positive allocation total.',
      })
    }
  })

export const cashTransactionDraftCommandSchema =
  cashTransactionDraftBodySchema

export const cashTransactionDraftResultSchema = z
  .object({
    cashTransactionId: z.string().uuid(),
    tenantId: z.string().uuid(),
    status: z.literal('draft'),
  })
  .strict()

export type CashTransactionDraftAllocation = z.infer<
  typeof cashTransactionDraftAllocationSchema
>
export type CashTransactionDraftBody = z.infer<
  typeof cashTransactionDraftBodySchema
>
export type CashTransactionDraftCommand = z.infer<
  typeof cashTransactionDraftCommandSchema
>
export type CashTransactionDraftResult = z.infer<
  typeof cashTransactionDraftResultSchema
>

export const cashTransactionDraftDeleteBodySchema = z.object({}).strict()

export const cashTransactionDraftDeleteCommandSchema = z
  .object({
    cashTransactionId: z.string().uuid(),
  })
  .strict()

export const cashTransactionDraftDeleteResultSchema = z
  .object({
    cashTransactionId: z.string().uuid(),
    tenantId: z.string().uuid(),
    status: z.literal('deleted'),
  })
  .strict()

export type CashTransactionDraftDeleteBody = z.infer<
  typeof cashTransactionDraftDeleteBodySchema
>
export type CashTransactionDraftDeleteCommand = z.infer<
  typeof cashTransactionDraftDeleteCommandSchema
>
export type CashTransactionDraftDeleteResult = z.infer<
  typeof cashTransactionDraftDeleteResultSchema
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

/**
 * Browser input for a customer-invoice draft. The project and tenant remain
 * URL/server-owned; all money and invoice numbering are calculated in Core.
 */
export const customerInvoiceDraftCreateBodySchema = z
  .object({
    billingPercentBps: z.number().int().min(1).max(10_000),
    bomId: z.string().uuid().nullable().default(null),
    dueDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Due date requires YYYY-MM-DD')
      .nullable()
      .default(null),
    notes: z.string().trim().max(2_000).nullable().default(null),
  })
  .strict()

export const customerInvoiceDraftCreateCommandSchema = z
  .object({
    projectId: z.string().uuid(),
    billingPercentBps: z.number().int().min(1).max(10_000),
    bomId: z.string().uuid().nullable().default(null),
    dueDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Due date requires YYYY-MM-DD')
      .nullable()
      .default(null),
    notes: z.string().trim().max(2_000).nullable().default(null),
  })
  .strict()

export const customerInvoiceDraftCreateResultSchema = z
  .object({
    invoiceId: z.string().uuid(),
    tenantId: z.string().uuid(),
    projectId: z.string().uuid(),
    status: z.literal('draft'),
    invoiceNumber: z.string().trim().min(1).max(50),
    billingPercentBps: z.number().int().min(1).max(10_000),
    retentionBps: z.number().int().min(0).max(10_000),
    subtotalCents: z.number().int().nonnegative(),
    retentionCents: z.number().int().nonnegative(),
    vatCents: z.number().int().nonnegative(),
    withholdingTaxCents: z.number().int().nonnegative(),
    netAmountCents: z.number().int().nonnegative(),
    dueDate: z.string().datetime({ offset: true }).nullable(),
    notes: z.string().nullable(),
  })
  .strict()

export type CustomerInvoiceDraftCreateBody = z.infer<
  typeof customerInvoiceDraftCreateBodySchema
>
export type CustomerInvoiceDraftCreateCommand = z.infer<
  typeof customerInvoiceDraftCreateCommandSchema
>
export type CustomerInvoiceDraftCreateResult = z.infer<
  typeof customerInvoiceDraftCreateResultSchema
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

export const bankStatementAutoMatchBodySchema = z.object({}).strict()

export const bankStatementAutoMatchCommandSchema = z
  .object({
    statementId: z.string().uuid(),
  })
  .strict()

export const bankStatementAutoMatchResultSchema = z
  .object({
    statementId: z.string().uuid(),
    tenantId: z.string().uuid(),
    status: z.literal('draft'),
    matchedCount: z.number().int().nonnegative(),
    remainingCount: z.number().int().nonnegative(),
  })
  .strict()

export type BankStatementAutoMatchBody = z.infer<
  typeof bankStatementAutoMatchBodySchema
>
export type BankStatementAutoMatchCommand = z.infer<
  typeof bankStatementAutoMatchCommandSchema
>
export type BankStatementAutoMatchResult = z.infer<
  typeof bankStatementAutoMatchResultSchema
>

export const bankStatementLineMatchBodySchema = z
  .object({
    cashTransactionId: z.string().uuid(),
  })
  .strict()

export const bankStatementLineUnmatchBodySchema = z.object({}).strict()

export const bankStatementLineMatchCommandSchema = z
  .object({
    statementId: z.string().uuid(),
    lineId: z.string().uuid(),
    cashTransactionId: z.string().uuid(),
  })
  .strict()

export const bankStatementLineUnmatchCommandSchema = z
  .object({
    statementId: z.string().uuid(),
    lineId: z.string().uuid(),
  })
  .strict()

const bankStatementLineMatchedResultSchema = z
  .object({
    statementId: z.string().uuid(),
    lineId: z.string().uuid(),
    tenantId: z.string().uuid(),
    status: z.literal('matched'),
    matchedCashTransactionId: z.string().uuid(),
  })
  .strict()

const bankStatementLineUnmatchedResultSchema = z
  .object({
    statementId: z.string().uuid(),
    lineId: z.string().uuid(),
    tenantId: z.string().uuid(),
    status: z.literal('unmatched'),
    matchedCashTransactionId: z.null(),
  })
  .strict()

export const bankStatementLineMatchResultSchema = z.discriminatedUnion(
  'status',
  [bankStatementLineMatchedResultSchema, bankStatementLineUnmatchedResultSchema]
)

export type BankStatementLineMatchBody = z.infer<
  typeof bankStatementLineMatchBodySchema
>
export type BankStatementLineUnmatchBody = z.infer<
  typeof bankStatementLineUnmatchBodySchema
>
export type BankStatementLineMatchCommand = z.infer<
  typeof bankStatementLineMatchCommandSchema
>
export type BankStatementLineUnmatchCommand = z.infer<
  typeof bankStatementLineUnmatchCommandSchema
>
export type BankStatementLineMatchResult = z.infer<
  typeof bankStatementLineMatchResultSchema
>

export const bankStatementReconcileBodySchema = z.object({}).strict()

export const bankStatementReconcileCommandSchema = z
  .object({
    statementId: z.string().uuid(),
  })
  .strict()

export const bankStatementReconcileResultSchema = z
  .object({
    statementId: z.string().uuid(),
    tenantId: z.string().uuid(),
    status: z.literal('reconciled'),
  })
  .strict()

export type BankStatementReconcileBody = z.infer<
  typeof bankStatementReconcileBodySchema
>
export type BankStatementReconcileCommand = z.infer<
  typeof bankStatementReconcileCommandSchema
>
export type BankStatementReconcileResult = z.infer<
  typeof bankStatementReconcileResultSchema
>
