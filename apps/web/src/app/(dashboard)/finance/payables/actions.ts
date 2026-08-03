'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { requireCapability, requireUserProfile } from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import {
  ledgerAccounts,
  purchaseOrders,
  supplierBillLines,
  supplierBills,
} from '@third-code-erp/database/schema'
import { and, eq, inArray, ne, sql } from 'drizzle-orm'
import { z } from 'zod'
import {
  financeSupplierBillPostWritesUseCoreApi,
  postSupplierBillThroughCoreApi,
} from '@/lib/erp-core-client'

export interface SupplierBillActionResult {
  ok: boolean
  error?: string
  id?: string
  number?: string
  journalId?: string
  journalNumber?: string
}

const moneySchema = z
  .number()
  .int()
  .min(0)
  .max(Number.MAX_SAFE_INTEGER)

const supplierBillDraftSchema = z
  .object({
    billId: z.string().uuid().optional(),
    purchaseOrderId: z.string().uuid(),
    vendorBillNumber: z.string().trim().min(1).max(80),
    billDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    dueDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .optional(),
    currency: z.literal('PHP').default('PHP'),
    subtotalCents: moneySchema.min(1),
    inputVatCents: moneySchema,
    withholdingTaxCents: moneySchema,
    notes: z.string().trim().max(2_000).nullable().optional(),
    lines: z
      .array(
        z.object({
          poLineItemId: z.string().uuid(),
          stockReceiptLineId: z.string().uuid().nullable().optional(),
          quantityMicros: moneySchema.min(1).nullable().optional(),
          ledgerAccountId: z.string().uuid(),
          description: z.string().trim().min(1).max(500),
          amountCents: moneySchema.min(1),
        })
      )
      .min(1)
      .max(100),
  })
  .superRefine((value, context) => {
    if (value.dueDate && value.dueDate < value.billDate) {
      context.addIssue({
        code: 'custom',
        path: ['dueDate'],
        message: 'Due date must be on or after the supplier bill date.',
      })
    }

    const allocated = value.lines.reduce(
      (total, line) => total + line.amountCents,
      0
    )
    for (const [index, line] of value.lines.entries()) {
      const hasReceipt = !!line.stockReceiptLineId
      const hasQuantity = line.quantityMicros != null
      if (hasReceipt !== hasQuantity) {
        context.addIssue({
          code: 'custom',
          path: ['lines', index],
          message:
            'Receipt-matched lines require both Stock Receipt and quantity evidence.',
        })
      }
    }
    if (!Number.isSafeInteger(allocated) || allocated !== value.subtotalCents) {
      context.addIssue({
        code: 'custom',
        path: ['lines'],
        message: 'Allocation lines must equal the supplier bill subtotal.',
      })
    }

    const payable =
      value.subtotalCents +
      value.inputVatCents -
      value.withholdingTaxCents
    if (!Number.isSafeInteger(payable) || payable <= 0) {
      context.addIssue({
        code: 'custom',
        path: ['withholdingTaxCents'],
        message: 'Taxes must leave a positive amount payable.',
      })
    }
  })

const postingSchema = z.object({
  billId: z.string().uuid(),
  postingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

const reversalSchema = postingSchema.extend({
  reason: z.string().trim().min(3).max(500),
})

const BILLABLE_PO_STATUSES = [
  'confirmed',
  'issued',
  'partial_delivery',
  'partial_delivered',
  'delivered',
  'fully_delivered',
] as const

function safeSupplierBillError(error: unknown): string {
  if (error instanceof z.ZodError) {
    return error.issues[0]?.message ?? 'Check the supplier bill fields.'
  }

  const message = error instanceof Error ? error.message : ''
  const known = [
    'Reverse allocated Vendor disbursements first',
    'Purchase Order must be approved and issued before billing',
    'Supplier bill Vendor or project does not match Purchase Order',
    'Supplier bill allocations must equal subtotal',
    'Supplier bill allocations must match the bill project',
    'Supplier bill allocations must match the bill project and Purchase Order lines',
    'Supplier bill allocations require active asset or expense accounts',
    'Supplier bill allocations do not satisfy three-way account control',
    'Supplier bill line requires Purchase Order line evidence',
    'Supplier bill line must match its Purchase Order',
    'Supplier Bill line requires Purchase Order Cost Code evidence',
    'Supplier Bill Cost Code must match Purchase Order line',
    'Inventory bill line requires posted Stock Receipt evidence',
    'Inventory bill line requires active posted Stock Receipt evidence',
    'Supplier bill receipt line must match its Purchase Order line',
    'Supplier bill quantity exceeds Stock Receipt quantity',
    'Supplier bill amount exceeds Stock Receipt rounding tolerance',
    'Inventory receipt matches require active GRNI account',
    'Non-inventory bill line cannot use Stock Receipt evidence',
    'Non-inventory bill line requires active asset or expense account',
    'Supplier bill exceeds unmatched Stock Receipt evidence',
    'Supplier bill exceeds unbilled Purchase Order line',
    'Supplier bill exceeds unbilled Purchase Order subtotal',
    'Active Accounts Payable control account is required',
    'Active Input VAT control account is required',
    'Active Withholding Tax Payable control account is required',
    'Posting date cannot precede supplier bill date',
    'Posting date is not in an open fiscal period',
    'Only an unposted draft supplier bill can be posted',
    'Supplier bill reversal reason is required',
    'Only a posted supplier bill can be reversed',
    'Supplier bill already has a reversal',
    'Reversal date cannot precede supplier bill date',
  ]

  if (
    message.includes('ux_supplier_bills_vendor_number') ||
    message.includes('duplicate key value')
  ) {
    return 'That Vendor bill number already exists for this Vendor.'
  }

  return (
    known.find((candidate) => message.includes(candidate)) ??
    'Supplier bill action failed. No partial financial posting was saved.'
  )
}

function revalidateSupplierBill(billId?: string, purchaseOrderId?: string) {
  revalidatePath('/finance')
  revalidatePath('/finance/payables')
  revalidatePath('/finance/ledger')
  if (billId) revalidatePath(`/finance/payables/${billId}`)
  if (purchaseOrderId) {
    revalidatePath(`/purchase-orders/${purchaseOrderId}`)
  }
}

export async function saveSupplierBillDraft(
  input: z.input<typeof supplierBillDraftSchema>
): Promise<SupplierBillActionResult> {
  try {
    const profile = await requireUserProfile()
    requireCapability(profile, 'finance.post_supplier_bill')
    const parsed = supplierBillDraftSchema.parse(input)
    const totalPayableCents =
      parsed.subtotalCents +
      parsed.inputVatCents -
      parsed.withholdingTaxCents

    const billId = await db.transaction(async (tx) => {
      const [purchaseOrder] = await tx
        .select({
          id: purchaseOrders.id,
          tenantId: purchaseOrders.tenant_id,
          projectId: purchaseOrders.project_id,
          vendorId: purchaseOrders.vendor_id,
          status: purchaseOrders.status,
          subtotalCents: purchaseOrders.subtotal_cents,
        })
        .from(purchaseOrders)
        .where(
          and(
            eq(purchaseOrders.id, parsed.purchaseOrderId),
            eq(purchaseOrders.tenant_id, profile.tenantId)
          )
        )
        .limit(1)

      if (!purchaseOrder) throw new Error('Purchase Order not found')
      if (
        !BILLABLE_PO_STATUSES.includes(
          purchaseOrder.status as (typeof BILLABLE_PO_STATUSES)[number]
        )
      ) {
        throw new Error(
          'Purchase Order must be approved and issued before billing'
        )
      }
      if (!purchaseOrder.vendorId) {
        throw new Error(
          'Supplier bill Vendor or project does not match Purchase Order'
        )
      }

      const uniqueAccountIds = [
        ...new Set(parsed.lines.map((line) => line.ledgerAccountId)),
      ]
      const validAccounts = await tx
        .select({
          id: ledgerAccounts.id,
          accountType: ledgerAccounts.account_type,
          systemKey: ledgerAccounts.system_key,
        })
        .from(ledgerAccounts)
        .where(
          and(
            eq(ledgerAccounts.tenant_id, profile.tenantId),
            eq(ledgerAccounts.is_active, true),
            inArray(ledgerAccounts.id, uniqueAccountIds)
          )
        )
      if (validAccounts.length !== uniqueAccountIds.length) {
        throw new Error(
          'Supplier bill allocations require active asset or expense accounts'
        )
      }
      const accountById = new Map(
        validAccounts.map((account) => [account.id, account])
      )
      for (const line of parsed.lines) {
        const account = accountById.get(line.ledgerAccountId)
        if (
          line.stockReceiptLineId &&
          (account?.systemKey !== 'goods_received_not_invoiced' ||
            account.accountType !== 'liability')
        ) {
          throw new Error(
            'Inventory receipt matches require active GRNI account'
          )
        }
        if (
          !line.stockReceiptLineId &&
          account?.accountType !== 'asset' &&
          account?.accountType !== 'expense'
        ) {
          throw new Error(
            'Non-inventory bill line requires active asset or expense account'
          )
        }
      }

      const [billed] = await tx
        .select({
          subtotal: sql<number>`coalesce(sum(${supplierBills.subtotal_cents}), 0)`,
        })
        .from(supplierBills)
        .where(
          and(
            eq(supplierBills.tenant_id, profile.tenantId),
            eq(
              supplierBills.purchase_order_id,
              purchaseOrder.id
            ),
            eq(supplierBills.status, 'posted'),
            parsed.billId
              ? ne(supplierBills.id, parsed.billId)
              : sql`true`
          )
        )

      if (
        Number(billed?.subtotal ?? 0) + parsed.subtotalCents >
        purchaseOrder.subtotalCents
      ) {
        throw new Error(
          'Supplier bill exceeds unbilled Purchase Order subtotal'
        )
      }

      let savedId: string
      if (parsed.billId) {
        const [draft] = await tx
          .select({
            id: supplierBills.id,
            purchaseOrderId: supplierBills.purchase_order_id,
          })
          .from(supplierBills)
          .where(
            and(
              eq(supplierBills.id, parsed.billId),
              eq(supplierBills.tenant_id, profile.tenantId),
              eq(supplierBills.status, 'draft')
            )
          )
          .limit(1)
        if (!draft) throw new Error('Editable supplier bill draft not found')

        await tx
          .delete(supplierBillLines)
          .where(
            and(
              eq(supplierBillLines.supplier_bill_id, draft.id),
              eq(supplierBillLines.tenant_id, profile.tenantId)
            )
          )
        const [updated] = await tx
          .update(supplierBills)
          .set({
            purchase_order_id: purchaseOrder.id,
            project_id: purchaseOrder.projectId,
            vendor_id: purchaseOrder.vendorId,
            vendor_bill_number: parsed.vendorBillNumber,
            bill_date: parsed.billDate,
            due_date: parsed.dueDate || null,
            currency: parsed.currency,
            subtotal_cents: parsed.subtotalCents,
            input_vat_cents: parsed.inputVatCents,
            withholding_tax_cents: parsed.withholdingTaxCents,
            total_payable_cents: totalPayableCents,
            notes: parsed.notes || null,
            updated_at: new Date(),
          })
          .where(
            and(
              eq(supplierBills.id, draft.id),
              eq(supplierBills.tenant_id, profile.tenantId),
              eq(supplierBills.status, 'draft')
            )
          )
          .returning({ id: supplierBills.id })
        if (!updated) throw new Error('Supplier bill draft was not updated')
        savedId = updated.id
      } else {
        const [created] = await tx
          .insert(supplierBills)
          .values({
            tenant_id: profile.tenantId,
            purchase_order_id: purchaseOrder.id,
            project_id: purchaseOrder.projectId,
            vendor_id: purchaseOrder.vendorId,
            vendor_bill_number: parsed.vendorBillNumber,
            bill_date: parsed.billDate,
            due_date: parsed.dueDate || null,
            currency: parsed.currency,
            subtotal_cents: parsed.subtotalCents,
            input_vat_cents: parsed.inputVatCents,
            withholding_tax_cents: parsed.withholdingTaxCents,
            total_payable_cents: totalPayableCents,
            notes: parsed.notes || null,
            created_by: profile.user.id,
          })
          .returning({ id: supplierBills.id })
        if (!created) throw new Error('Supplier bill draft was not created')
        savedId = created.id
      }

      await tx.insert(supplierBillLines).values(
        parsed.lines.map((line, index) => ({
          tenant_id: profile.tenantId,
          supplier_bill_id: savedId,
          ledger_account_id: line.ledgerAccountId,
          project_id: purchaseOrder.projectId,
          po_line_item_id: line.poLineItemId,
          stock_receipt_line_id: line.stockReceiptLineId ?? null,
          quantity_micros: line.quantityMicros ?? null,
          line_number: index + 1,
          description: line.description,
          amount_cents: line.amountCents,
        }))
      )

      return savedId
    })

    revalidateSupplierBill(billId, parsed.purchaseOrderId)
    return { ok: true, id: billId }
  } catch (error) {
    return { ok: false, error: safeSupplierBillError(error) }
  }
}

export async function deleteSupplierBillDraft(
  billId: string
): Promise<SupplierBillActionResult> {
  try {
    const profile = await requireUserProfile()
    requireCapability(profile, 'finance.post_supplier_bill')
    const parsedId = z.string().uuid().parse(billId)
    const [deleted] = await db
      .delete(supplierBills)
      .where(
        and(
          eq(supplierBills.id, parsedId),
          eq(supplierBills.tenant_id, profile.tenantId),
          eq(supplierBills.status, 'draft')
        )
      )
      .returning({
        id: supplierBills.id,
        purchaseOrderId: supplierBills.purchase_order_id,
      })
    if (!deleted) return { ok: false, error: 'Supplier bill draft not found' }

    revalidateSupplierBill(undefined, deleted.purchaseOrderId)
    return { ok: true }
  } catch (error) {
    return { ok: false, error: safeSupplierBillError(error) }
  }
}

export async function postSupplierBill(
  input: z.input<typeof postingSchema>,
  idempotencyKey?: string
): Promise<SupplierBillActionResult> {
  try {
    const profile = await requireUserProfile()
    requireCapability(profile, 'finance.post_supplier_bill')
    const parsed = postingSchema.parse(input)
    const [bill] = await db
      .select({
        id: supplierBills.id,
        purchaseOrderId: supplierBills.purchase_order_id,
      })
      .from(supplierBills)
      .where(
        and(
          eq(supplierBills.id, parsed.billId),
          eq(supplierBills.tenant_id, profile.tenantId)
        )
      )
      .limit(1)
    if (!bill) return { ok: false, error: 'Supplier bill not found' }

    if (financeSupplierBillPostWritesUseCoreApi(profile.tenantId)) {
      const coreResult = await postSupplierBillThroughCoreApi(
        bill.id,
        { postingDate: parsed.postingDate },
        idempotencyKey?.trim() || randomUUID()
      )
      if (!coreResult.ok || !coreResult.data) {
        return {
          ok: false,
          error:
            coreResult.error ??
            'Supplier bill was not posted. No financial posting was committed.',
        }
      }

      revalidateSupplierBill(bill.id, bill.purchaseOrderId)
      return {
        ok: true,
        id: coreResult.data.supplierBillId,
        number: coreResult.data.supplierBillNumber,
        journalId: coreResult.data.journalEntryId,
        journalNumber: coreResult.data.journalEntryNumber,
      }
    }

    const rows = await db.execute<{
      journal_entry_id: string
      journal_entry_number: string
      supplier_bill_number: string
    }>(sql`
      select journal_entry_id, journal_entry_number, supplier_bill_number
      from public.post_supplier_bill(
        ${bill.id}::uuid,
        ${profile.user.id}::uuid,
        ${parsed.postingDate}::date
      )
    `)
    const result = rows[0]
    if (!result) throw new Error('Supplier bill posting returned no journal')

    revalidateSupplierBill(bill.id, bill.purchaseOrderId)
    return {
      ok: true,
      id: bill.id,
      number: result.supplier_bill_number,
      journalId: result.journal_entry_id,
      journalNumber: result.journal_entry_number,
    }
  } catch (error) {
    return { ok: false, error: safeSupplierBillError(error) }
  }
}

export async function reverseSupplierBill(
  input: z.input<typeof reversalSchema>
): Promise<SupplierBillActionResult> {
  try {
    const profile = await requireUserProfile()
    requireCapability(profile, 'finance.post_supplier_bill')
    const parsed = reversalSchema.parse(input)
    const [bill] = await db
      .select({
        id: supplierBills.id,
        purchaseOrderId: supplierBills.purchase_order_id,
      })
      .from(supplierBills)
      .where(
        and(
          eq(supplierBills.id, parsed.billId),
          eq(supplierBills.tenant_id, profile.tenantId)
        )
      )
      .limit(1)
    if (!bill) return { ok: false, error: 'Supplier bill not found' }

    const rows = await db.execute<{
      reversal_entry_id: string
      reversal_entry_number: string
    }>(sql`
      select reversal_entry_id, reversal_entry_number
      from public.reverse_supplier_bill(
        ${bill.id}::uuid,
        ${profile.user.id}::uuid,
        ${parsed.reason}::text,
        ${parsed.postingDate}::date
      )
    `)
    const result = rows[0]
    if (!result) throw new Error('Supplier bill reversal returned no journal')

    revalidateSupplierBill(bill.id, bill.purchaseOrderId)
    return {
      ok: true,
      id: bill.id,
      journalId: result.reversal_entry_id,
      journalNumber: result.reversal_entry_number,
    }
  } catch (error) {
    return { ok: false, error: safeSupplierBillError(error) }
  }
}
