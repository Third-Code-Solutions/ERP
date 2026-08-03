'use server'

import { revalidatePath } from 'next/cache'
import { requireCapability, requireUserProfile } from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import { invoices } from '@third-code-erp/database/schema'
import { and, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import {
  financeCustomerInvoiceIssueWritesUseCoreApi,
  financeCustomerInvoiceReverseWritesUseCoreApi,
  issueCustomerInvoiceThroughCoreApi,
  reverseCustomerInvoiceThroughCoreApi,
} from '../../../lib/erp-core-client'

export interface InvoiceActionResult {
  ok: boolean
  error?: string
  journalId?: string
  journalNumber?: string
}

const issueInputSchema = z.object({
  invoiceId: z.string().uuid(),
  postingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

function safeInvoiceError(error: unknown): string {
  if (error instanceof z.ZodError) {
    return 'Choose a valid posting date.'
  }

  const message = error instanceof Error ? error.message : ''
  const known = [
    'Reverse allocated customer receipts first',
    'Only an unposted draft invoice can be issued',
    'Customer invoice requires a Business Account',
    'Customer invoice Business Account is invalid',
    'Customer invoice amounts do not reconcile',
    'Active Accounts Receivable control account is required',
    'Active Revenue control account is required',
    'Active Retention Receivable control account is required',
    'Active Withholding Tax Receivable control account is required',
    'Active Output VAT control account is required',
    'Posting date is not in an open fiscal period',
    'Only an unposted draft invoice can be cancelled',
    'Invoice reversal reason is required',
    'Only a posted open invoice can be reversed',
    'Customer invoice already has a reversal',
    'Customer invoice reversal conflicts with its current state',
    'Customer invoice was not found',
    'Customer invoice was not reversed',
    'ERP Core API is unavailable. No customer invoice reversal was committed.',
  ]

  return (
    known.find((candidate) => message.includes(candidate)) ??
    'Invoice action failed. No partial financial posting was saved.'
  )
}

async function requireTenantInvoice(invoiceId: string, tenantId: string) {
  const [invoice] = await db
    .select({ id: invoices.id })
    .from(invoices)
    .where(
      and(eq(invoices.id, invoiceId), eq(invoices.tenant_id, tenantId))
    )
    .limit(1)
  return invoice
}

function revalidateInvoice(invoiceId: string) {
  revalidatePath('/invoices')
  revalidatePath(`/invoices/${invoiceId}`)
  revalidatePath('/finance')
  revalidatePath('/finance/receivables')
  revalidatePath('/finance/ledger')
}

export async function issueCustomerInvoice(input: {
  invoiceId: string
  postingDate: string
}, idempotencyKey?: string): Promise<InvoiceActionResult> {
  try {
    const profile = await requireUserProfile()
    requireCapability(profile, 'finance.issue_invoice')
    const parsed = issueInputSchema.parse(input)

    const invoice = await requireTenantInvoice(
      parsed.invoiceId,
      profile.tenantId
    )
    if (!invoice) return { ok: false, error: 'Invoice not found' }

    if (financeCustomerInvoiceIssueWritesUseCoreApi(profile.tenantId)) {
      if (!idempotencyKey?.trim()) {
        return {
          ok: false,
          error: 'Retry token is required for customer invoice issuance.',
        }
      }
      const coreResult = await issueCustomerInvoiceThroughCoreApi(
        parsed.invoiceId,
        { postingDate: parsed.postingDate },
        idempotencyKey.trim()
      )
      if (!coreResult.ok || !coreResult.data) {
        return {
          ok: false,
          error:
            coreResult.error ??
            'Customer invoice was not issued. No financial posting was committed.',
        }
      }
      revalidateInvoice(parsed.invoiceId)
      return {
        ok: true,
        journalId: coreResult.data.journalEntryId,
        journalNumber: coreResult.data.journalEntryNumber,
      }
    }

    const rows = await db.execute<{
      journal_entry_id: string
      journal_entry_number: string
    }>(sql`
      select journal_entry_id, journal_entry_number
      from public.issue_customer_invoice(
        ${parsed.invoiceId}::uuid,
        ${profile.user.id}::uuid,
        ${parsed.postingDate}::date
      )
    `)
    const result = rows[0]
    if (!result) throw new Error('Invoice issuance returned no journal')

    revalidateInvoice(parsed.invoiceId)
    return {
      ok: true,
      journalId: result.journal_entry_id,
      journalNumber: result.journal_entry_number,
    }
  } catch (error) {
    return { ok: false, error: safeInvoiceError(error) }
  }
}

export async function cancelDraftInvoice(
  invoiceId: string
): Promise<InvoiceActionResult> {
  try {
    const profile = await requireUserProfile()
    requireCapability(profile, 'finance.issue_invoice')
    const parsedId = z.string().uuid().parse(invoiceId)
    const invoice = await requireTenantInvoice(parsedId, profile.tenantId)
    if (!invoice) return { ok: false, error: 'Invoice not found' }

    await db.execute(sql`
      select public.cancel_customer_invoice(
        ${parsedId}::uuid,
        ${profile.user.id}::uuid
      )
    `)

    revalidateInvoice(parsedId)
    return { ok: true }
  } catch (error) {
    return { ok: false, error: safeInvoiceError(error) }
  }
}

export async function reverseCustomerInvoice(input: {
  invoiceId: string
  postingDate: string
  reason: string
},
  idempotencyKey?: string
): Promise<InvoiceActionResult> {
  try {
    const profile = await requireUserProfile()
    requireCapability(profile, 'finance.issue_invoice')
    const parsed = z
      .object({
        invoiceId: z.string().uuid(),
        postingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        reason: z.string().trim().min(3).max(500),
      })
      .parse(input)
    const invoice = await requireTenantInvoice(
      parsed.invoiceId,
      profile.tenantId
    )
    if (!invoice) return { ok: false, error: 'Invoice not found' }

    if (financeCustomerInvoiceReverseWritesUseCoreApi(profile.tenantId)) {
      if (!idempotencyKey?.trim()) {
        return {
          ok: false,
          error: 'Retry token is required for customer invoice reversal.',
        }
      }
      const coreResult = await reverseCustomerInvoiceThroughCoreApi(
        parsed.invoiceId,
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
            'Customer invoice was not reversed. No financial posting was committed.',
        }
      }
      revalidateInvoice(parsed.invoiceId)
      return {
        ok: true,
        journalId: coreResult.data.reversalJournalEntryId,
        journalNumber: coreResult.data.reversalJournalEntryNumber,
      }
    }

    const rows = await db.execute<{
      reversal_entry_id: string
      reversal_entry_number: string
    }>(sql`
      select reversal_entry_id, reversal_entry_number
      from public.reverse_customer_invoice(
        ${parsed.invoiceId}::uuid,
        ${profile.user.id}::uuid,
        ${parsed.reason}::text,
        ${parsed.postingDate}::date
      )
    `)
    const result = rows[0]
    if (!result) throw new Error('Invoice reversal returned no journal')

    revalidateInvoice(parsed.invoiceId)
    return {
      ok: true,
      journalId: result.reversal_entry_id,
      journalNumber: result.reversal_entry_number,
    }
  } catch (error) {
    return { ok: false, error: safeInvoiceError(error) }
  }
}
