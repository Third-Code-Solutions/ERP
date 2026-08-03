'use server'

import { revalidatePath } from 'next/cache'
import { requireCapability, requireUserProfile } from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import {
  financeCashWorkflowWritesUseCoreApi,
  postCashTransactionThroughCoreApi,
  reverseCashTransactionThroughCoreApi,
} from '../../../../lib/erp-core-client'
import {
  cashAccounts,
  cashAllocations,
  cashTransactions,
  invoices,
  supplierBills,
} from '@third-code-erp/database/schema'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { z } from 'zod'

export interface CashActionResult {
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
  .min(1)
  .max(Number.MAX_SAFE_INTEGER)

const allocationSchema = z.object({
  allocationType: z.enum([
    'customer_current_due',
    'customer_retention',
    'supplier_bill',
  ]),
  targetId: z.string().uuid(),
  description: z.string().trim().max(500).nullable().optional(),
  amountCents: moneySchema,
})

const cashDraftSchema = z
  .object({
    transactionId: z.string().uuid().optional(),
    cashAccountId: z.string().uuid(),
    direction: z.enum(['receipt', 'disbursement']),
    counterpartyId: z.string().uuid(),
    referenceNumber: z.string().trim().min(1).max(100),
    transactionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    notes: z.string().trim().max(2_000).nullable().optional(),
    allocations: z.array(allocationSchema).min(1).max(100),
  })
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

const postingSchema = z.object({
  transactionId: z.string().uuid(),
  postingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

const reversalSchema = postingSchema.extend({
  reason: z.string().trim().min(3).max(500),
})

function safeCashError(error: unknown): string {
  if (error instanceof z.ZodError) {
    return error.issues[0]?.message ?? 'Check the cash transaction fields.'
  }

  const message = error instanceof Error ? error.message : ''
  const known = [
    'Cash allocations must equal transaction amount',
    'Receipt allocations must match open customer invoices',
    'Receipt allocation exceeds open invoice component',
    'Disbursement allocations must match open Supplier Bills',
    'Disbursement allocation exceeds open Supplier Bill',
    'Active matching Cash Account is required',
    'Active Accounts Receivable control account is required',
    'Active Retention Receivable control account is required',
    'Active Accounts Payable control account is required',
    'Posting date cannot precede cash transaction date',
    'Posting date is not in an open fiscal period',
    'Only an unposted draft cash transaction can be posted',
    'Only a posted cash transaction can be reversed',
    'Cash transaction already has a reversal',
    'Cash transaction reversal reason is required',
  ]

  if (
    message.includes('ux_cash_transactions_reference') ||
    message.includes('duplicate key value')
  ) {
    return 'That reference already exists for this Cash Account and direction.'
  }

  return (
    known.find((candidate) => message.includes(candidate)) ??
    'Cash action failed. No partial financial posting was saved.'
  )
}

function revalidateCash(transactionId?: string) {
  revalidatePath('/finance')
  revalidatePath('/finance/cash')
  revalidatePath('/finance/payables')
  revalidatePath('/finance/receivables')
  revalidatePath('/finance/ledger')
  revalidatePath('/invoices')
  if (transactionId) revalidatePath(`/finance/cash/${transactionId}`)
}

export async function saveCashDraft(
  input: z.input<typeof cashDraftSchema>
): Promise<CashActionResult> {
  try {
    const profile = await requireUserProfile()
    requireCapability(profile, 'finance.manage_cash')
    const parsed = cashDraftSchema.parse(input)
    const amountCents = parsed.allocations.reduce(
      (sum, allocation) => sum + allocation.amountCents,
      0
    )

    const transactionId = await db.transaction(async (tx) => {
      const [cashAccount] = await tx
        .select({
          id: cashAccounts.id,
          currency: cashAccounts.currency,
        })
        .from(cashAccounts)
        .where(
          and(
            eq(cashAccounts.id, parsed.cashAccountId),
            eq(cashAccounts.tenant_id, profile.tenantId),
            eq(cashAccounts.is_active, true)
          )
        )
        .limit(1)
      if (!cashAccount) throw new Error('Active matching Cash Account is required')

      const targetIds = [
        ...new Set(parsed.allocations.map((allocation) => allocation.targetId)),
      ]
      if (parsed.direction === 'receipt') {
        const targets = await tx
          .select({ id: invoices.id })
          .from(invoices)
          .where(
            and(
              eq(invoices.tenant_id, profile.tenantId),
              eq(invoices.account_id, parsed.counterpartyId),
              inArray(invoices.status, [
                'issued',
                'overdue',
                'partial_payment',
              ]),
              inArray(invoices.id, targetIds)
            )
          )
        if (targets.length !== targetIds.length) {
          throw new Error('Receipt allocations must match open customer invoices')
        }
      } else {
        const targets = await tx
          .select({ id: supplierBills.id })
          .from(supplierBills)
          .where(
            and(
              eq(supplierBills.tenant_id, profile.tenantId),
              eq(supplierBills.vendor_id, parsed.counterpartyId),
              eq(supplierBills.status, 'posted'),
              inArray(supplierBills.id, targetIds)
            )
          )
        if (targets.length !== targetIds.length) {
          throw new Error(
            'Disbursement allocations must match open Supplier Bills'
          )
        }
      }

      let savedId: string
      if (parsed.transactionId) {
        const [draft] = await tx
          .select({ id: cashTransactions.id })
          .from(cashTransactions)
          .where(
            and(
              eq(cashTransactions.id, parsed.transactionId),
              eq(cashTransactions.tenant_id, profile.tenantId),
              eq(cashTransactions.status, 'draft')
            )
          )
          .limit(1)
        if (!draft) throw new Error('Editable cash draft not found')

        await tx
          .delete(cashAllocations)
          .where(
            and(
              eq(cashAllocations.cash_transaction_id, draft.id),
              eq(cashAllocations.tenant_id, profile.tenantId)
            )
          )
        const [updated] = await tx
          .update(cashTransactions)
          .set({
            cash_account_id: cashAccount.id,
            direction: parsed.direction,
            business_account_id:
              parsed.direction === 'receipt' ? parsed.counterpartyId : null,
            vendor_id:
              parsed.direction === 'disbursement'
                ? parsed.counterpartyId
                : null,
            reference_number: parsed.referenceNumber,
            transaction_date: parsed.transactionDate,
            currency: cashAccount.currency,
            amount_cents: amountCents,
            notes: parsed.notes || null,
            updated_at: new Date(),
          })
          .where(
            and(
              eq(cashTransactions.id, draft.id),
              eq(cashTransactions.tenant_id, profile.tenantId),
              eq(cashTransactions.status, 'draft')
            )
          )
          .returning({ id: cashTransactions.id })
        if (!updated) throw new Error('Cash draft was not updated')
        savedId = updated.id
      } else {
        const [created] = await tx
          .insert(cashTransactions)
          .values({
            tenant_id: profile.tenantId,
            cash_account_id: cashAccount.id,
            direction: parsed.direction,
            business_account_id:
              parsed.direction === 'receipt' ? parsed.counterpartyId : null,
            vendor_id:
              parsed.direction === 'disbursement'
                ? parsed.counterpartyId
                : null,
            reference_number: parsed.referenceNumber,
            transaction_date: parsed.transactionDate,
            currency: cashAccount.currency,
            amount_cents: amountCents,
            notes: parsed.notes || null,
            created_by: profile.user.id,
          })
          .returning({ id: cashTransactions.id })
        if (!created) throw new Error('Cash draft was not created')
        savedId = created.id
      }

      await tx.insert(cashAllocations).values(
        parsed.allocations.map((allocation, index) => ({
          tenant_id: profile.tenantId,
          cash_transaction_id: savedId,
          allocation_type: allocation.allocationType,
          invoice_id:
            allocation.allocationType === 'supplier_bill'
              ? null
              : allocation.targetId,
          supplier_bill_id:
            allocation.allocationType === 'supplier_bill'
              ? allocation.targetId
              : null,
          line_number: index + 1,
          description: allocation.description || null,
          amount_cents: allocation.amountCents,
        }))
      )

      return savedId
    })

    revalidateCash(transactionId)
    return { ok: true, id: transactionId }
  } catch (error) {
    return { ok: false, error: safeCashError(error) }
  }
}

export async function deleteCashDraft(
  transactionId: string
): Promise<CashActionResult> {
  try {
    const profile = await requireUserProfile()
    requireCapability(profile, 'finance.manage_cash')
    const parsedId = z.string().uuid().parse(transactionId)
    const [deleted] = await db
      .delete(cashTransactions)
      .where(
        and(
          eq(cashTransactions.id, parsedId),
          eq(cashTransactions.tenant_id, profile.tenantId),
          eq(cashTransactions.status, 'draft')
        )
      )
      .returning({ id: cashTransactions.id })
    if (!deleted) return { ok: false, error: 'Cash draft not found' }
    revalidateCash()
    return { ok: true }
  } catch (error) {
    return { ok: false, error: safeCashError(error) }
  }
}

export async function postCashTransaction(
  input: z.input<typeof postingSchema>,
  idempotencyKey?: string
): Promise<CashActionResult> {
  try {
    const profile = await requireUserProfile()
    requireCapability(profile, 'finance.manage_cash')
    const parsed = postingSchema.parse(input)

    if (financeCashWorkflowWritesUseCoreApi(profile.tenantId)) {
      if (!idempotencyKey?.trim()) {
        return {
          ok: false,
          error: 'Retry token is required for the cash posting command.',
        }
      }
      const coreResult = await postCashTransactionThroughCoreApi(
        parsed.transactionId,
        { postingDate: parsed.postingDate },
        idempotencyKey.trim()
      )
      if (!coreResult.ok || !coreResult.data) {
        return {
          ok: false,
          error:
            coreResult.error ??
            'Cash transaction was not posted. No financial posting was committed.',
        }
      }
      revalidateCash(parsed.transactionId)
      return {
        ok: true,
        id: coreResult.data.cashTransactionId,
        number: coreResult.data.cashTransactionNumber,
        journalId: coreResult.data.journalEntryId,
        journalNumber: coreResult.data.journalEntryNumber,
      }
    }

    const rows = await db.execute<{
      journal_entry_id: string
      journal_entry_number: string
      cash_transaction_number: string
    }>(sql`
      select journal_entry_id, journal_entry_number, cash_transaction_number
      from public.post_cash_transaction(
        ${parsed.transactionId}::uuid,
        ${profile.user.id}::uuid,
        ${parsed.postingDate}::date
      )
    `)
    const result = rows[0]
    if (!result) throw new Error('Cash posting returned no journal')

    revalidateCash(parsed.transactionId)
    return {
      ok: true,
      id: parsed.transactionId,
      number: result.cash_transaction_number,
      journalId: result.journal_entry_id,
      journalNumber: result.journal_entry_number,
    }
  } catch (error) {
    return { ok: false, error: safeCashError(error) }
  }
}

export async function reverseCashTransaction(
  input: z.input<typeof reversalSchema>,
  idempotencyKey?: string
): Promise<CashActionResult> {
  try {
    const profile = await requireUserProfile()
    requireCapability(profile, 'finance.manage_cash')
    const parsed = reversalSchema.parse(input)

    if (financeCashWorkflowWritesUseCoreApi(profile.tenantId)) {
      if (!idempotencyKey?.trim()) {
        return {
          ok: false,
          error: 'Retry token is required for the cash reversal command.',
        }
      }
      const coreResult = await reverseCashTransactionThroughCoreApi(
        parsed.transactionId,
        {
          reason: parsed.reason,
          postingDate: parsed.postingDate,
        },
        idempotencyKey.trim()
      )
      if (!coreResult.ok || !coreResult.data) {
        return {
          ok: false,
          error:
            coreResult.error ??
            'Cash transaction was not reversed. No reversal was committed.',
        }
      }
      revalidateCash(parsed.transactionId)
      return {
        ok: true,
        id: coreResult.data.cashTransactionId,
        journalId: coreResult.data.reversalJournalEntryId,
        journalNumber: coreResult.data.reversalJournalEntryNumber,
      }
    }

    const rows = await db.execute<{
      reversal_entry_id: string
      reversal_entry_number: string
    }>(sql`
      select reversal_entry_id, reversal_entry_number
      from public.reverse_cash_transaction(
        ${parsed.transactionId}::uuid,
        ${profile.user.id}::uuid,
        ${parsed.reason}::text,
        ${parsed.postingDate}::date
      )
    `)
    const result = rows[0]
    if (!result) throw new Error('Cash reversal returned no journal')

    revalidateCash(parsed.transactionId)
    return {
      ok: true,
      id: parsed.transactionId,
      journalId: result.reversal_entry_id,
      journalNumber: result.reversal_entry_number,
    }
  } catch (error) {
    return { ok: false, error: safeCashError(error) }
  }
}
