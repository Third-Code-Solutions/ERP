'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { requireCapability, requireUserProfile } from '@third-code-erp/auth'
import { db, validateJournalLines } from '@third-code-erp/database'
import {
  cashAccounts,
  fiscalPeriods,
  journalEntries,
  journalLines,
  ledgerAccounts,
  projects,
} from '@third-code-erp/database/schema'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { z } from 'zod'
import {
  financeJournalPostWritesUseCoreApi,
  postJournalEntryThroughCoreApi,
} from '@/lib/erp-core-client'

export interface FinanceActionResult {
  ok: boolean
  error?: string
  id?: string
  number?: string
}

const ledgerAccountSchema = z.object({
  code: z.string().trim().min(1).max(30),
  name: z.string().trim().min(2).max(160),
  accountType: z.enum([
    'asset',
    'liability',
    'equity',
    'income',
    'expense',
  ]),
})

const fiscalPeriodSchema = z
  .object({
    name: z.string().trim().min(2).max(100),
    startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    endsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  })
  .refine((value) => value.startsOn <= value.endsOn, {
    message: 'End date must be on or after start date',
  })

const cashAccountSchema = z.object({
  ledgerAccountId: z.string().uuid(),
  name: z.string().trim().min(2).max(160),
  accountKind: z.enum(['cash', 'bank', 'e_wallet']),
  bankName: z.string().trim().max(160).nullable().optional(),
  identifierLast4: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9]{4}$/)
    .nullable()
    .optional(),
})

const journalDraftSchema = z.object({
  postingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  description: z.string().trim().min(3).max(2_000),
  lines: z
    .array(
      z.object({
        ledgerAccountId: z.string().uuid(),
        projectId: z.string().uuid().nullable().optional(),
        description: z.string().trim().max(500).nullable().optional(),
        debitCents: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
        creditCents: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
      })
    )
    .min(2)
    .max(100),
})

const systemAccountSchema = z.object({
  systemKey: z.enum([
    'accounts_receivable',
    'retention_receivable',
    'withholding_tax_receivable',
    'revenue',
    'output_vat_payable',
    'accounts_payable',
    'input_vat_receivable',
    'withholding_tax_payable',
    'inventory',
    'goods_received_not_invoiced',
  ]),
  ledgerAccountId: z.string().uuid(),
})

const SYSTEM_ACCOUNT_TYPES: Record<
  z.infer<typeof systemAccountSchema>['systemKey'],
  z.infer<typeof ledgerAccountSchema>['accountType']
> = {
  accounts_receivable: 'asset',
  retention_receivable: 'asset',
  withholding_tax_receivable: 'asset',
  revenue: 'income',
  output_vat_payable: 'liability',
  accounts_payable: 'liability',
  input_vat_receivable: 'asset',
  withholding_tax_payable: 'liability',
  inventory: 'asset',
  goods_received_not_invoiced: 'liability',
}

function normalBalanceFor(
  accountType: z.infer<typeof ledgerAccountSchema>['accountType']
): 'debit' | 'credit' {
  return accountType === 'asset' || accountType === 'expense'
    ? 'debit'
    : 'credit'
}

function safeError(error: unknown): string {
  if (error instanceof z.ZodError) {
    return error.issues[0]?.message ?? 'Check the finance form fields'
  }

  const message = error instanceof Error ? error.message : ''
  const known = [
    'Fiscal periods cannot overlap',
    'Posting date is not in an open fiscal period',
    'A posted journal requires at least two lines',
    'Journal debits and credits must balance above zero',
    'Inactive ledger accounts cannot receive postings',
    'Only draft journal entries can be posted',
    'Only posted journal entries can be reversed',
    'Journal entry already has a reversal',
    'Reversal entries cannot be reversed',
    'A reversal reason is required',
    'Fiscal period is already closed',
    'Use the customer invoice reversal workflow',
    'Use the supplier bill reversal workflow',
    'Use the cash transaction reversal workflow',
  ]
  return (
    known.find((candidate) => message.includes(candidate)) ??
    'Finance action failed. No partial posting was saved.'
  )
}

export async function createLedgerAccount(
  formData: FormData
): Promise<FinanceActionResult> {
  try {
    const profile = await requireUserProfile()
    requireCapability(profile, 'finance.manage')
    const input = ledgerAccountSchema.parse({
      code: formData.get('code'),
      name: formData.get('name'),
      accountType: formData.get('accountType'),
    })

    const [created] = await db
      .insert(ledgerAccounts)
      .values({
        tenant_id: profile.tenantId,
        code: input.code.toUpperCase(),
        name: input.name,
        account_type: input.accountType,
        normal_balance: normalBalanceFor(input.accountType),
        created_by: profile.user.id,
      })
      .returning({ id: ledgerAccounts.id })

    revalidatePath('/finance')
    return { ok: true, id: created?.id }
  } catch (error) {
    return { ok: false, error: safeError(error) }
  }
}

export async function createCashAccount(
  formData: FormData
): Promise<FinanceActionResult> {
  try {
    const profile = await requireUserProfile()
    requireCapability(profile, 'finance.manage_cash')
    const input = cashAccountSchema.parse({
      ledgerAccountId: formData.get('ledgerAccountId'),
      name: formData.get('name'),
      accountKind: formData.get('accountKind'),
      bankName: String(formData.get('bankName') ?? '') || null,
      identifierLast4:
        String(formData.get('identifierLast4') ?? '') || null,
    })

    const [ledger] = await db
      .select({ id: ledgerAccounts.id })
      .from(ledgerAccounts)
      .where(
        and(
          eq(ledgerAccounts.id, input.ledgerAccountId),
          eq(ledgerAccounts.tenant_id, profile.tenantId),
          eq(ledgerAccounts.account_type, 'asset'),
          eq(ledgerAccounts.is_active, true)
        )
      )
      .limit(1)
    if (!ledger) {
      return {
        ok: false,
        error: 'Choose an active asset ledger account.',
      }
    }

    const [created] = await db
      .insert(cashAccounts)
      .values({
        tenant_id: profile.tenantId,
        ledger_account_id: ledger.id,
        name: input.name,
        account_kind: input.accountKind,
        bank_name: input.bankName || null,
        account_identifier_last4: input.identifierLast4 || null,
        created_by: profile.user.id,
      })
      .returning({ id: cashAccounts.id })

    revalidatePath('/finance')
    revalidatePath('/finance/cash')
    return { ok: true, id: created?.id }
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (
      message.includes('ux_cash_accounts_tenant_ledger') ||
      message.includes('ux_cash_accounts_tenant_name')
    ) {
      return {
        ok: false,
        error: 'That Cash Account name or ledger mapping already exists.',
      }
    }
    return { ok: false, error: safeError(error) }
  }
}

export async function assignReceivablesSystemAccount(input: {
  systemKey: z.infer<typeof systemAccountSchema>['systemKey']
  ledgerAccountId: string
}): Promise<FinanceActionResult> {
  try {
    const profile = await requireUserProfile()
    requireCapability(profile, 'finance.manage')
    const parsed = systemAccountSchema.parse(input)

    const [target] = await db
      .select({
        id: ledgerAccounts.id,
        accountType: ledgerAccounts.account_type,
        active: ledgerAccounts.is_active,
        systemKey: ledgerAccounts.system_key,
      })
      .from(ledgerAccounts)
      .where(
        and(
          eq(ledgerAccounts.id, parsed.ledgerAccountId),
          eq(ledgerAccounts.tenant_id, profile.tenantId)
        )
      )
      .limit(1)

    if (!target || !target.active) {
      return { ok: false, error: 'Choose an active ledger account.' }
    }
    if (target.accountType !== SYSTEM_ACCOUNT_TYPES[parsed.systemKey]) {
      return {
        ok: false,
        error: `This mapping requires an active ${SYSTEM_ACCOUNT_TYPES[parsed.systemKey]} account.`,
      }
    }
    if (target.systemKey && target.systemKey !== parsed.systemKey) {
      return {
        ok: false,
        error: 'That ledger account is already mapped to another system role.',
      }
    }

    await db.transaction(async (tx) => {
      await tx
        .update(ledgerAccounts)
        .set({ system_key: null, updated_at: new Date() })
        .where(
          and(
            eq(ledgerAccounts.tenant_id, profile.tenantId),
            eq(ledgerAccounts.system_key, parsed.systemKey)
          )
        )
      await tx
        .update(ledgerAccounts)
        .set({
          system_key: parsed.systemKey,
          updated_at: new Date(),
        })
        .where(
          and(
            eq(ledgerAccounts.id, target.id),
            eq(ledgerAccounts.tenant_id, profile.tenantId)
          )
        )
    })

    revalidatePath('/finance')
    return { ok: true, id: target.id }
  } catch (error) {
    return { ok: false, error: safeError(error) }
  }
}

export async function assignPayablesSystemAccount(input: {
  systemKey:
    | 'accounts_payable'
    | 'input_vat_receivable'
    | 'withholding_tax_payable'
  ledgerAccountId: string
}): Promise<FinanceActionResult> {
  return assignReceivablesSystemAccount(input)
}

export async function assignInventorySystemAccount(input: {
  systemKey: 'inventory' | 'goods_received_not_invoiced'
  ledgerAccountId: string
}): Promise<FinanceActionResult> {
  return assignReceivablesSystemAccount(input)
}

export async function createFiscalPeriod(
  formData: FormData
): Promise<FinanceActionResult> {
  try {
    const profile = await requireUserProfile()
    requireCapability(profile, 'finance.manage')
    const input = fiscalPeriodSchema.parse({
      name: formData.get('name'),
      startsOn: formData.get('startsOn'),
      endsOn: formData.get('endsOn'),
    })

    const [created] = await db
      .insert(fiscalPeriods)
      .values({
        tenant_id: profile.tenantId,
        name: input.name,
        starts_on: input.startsOn,
        ends_on: input.endsOn,
        created_by: profile.user.id,
      })
      .returning({ id: fiscalPeriods.id })

    revalidatePath('/finance')
    return { ok: true, id: created?.id }
  } catch (error) {
    return { ok: false, error: safeError(error) }
  }
}

export async function closeFiscalPeriod(
  periodId: string
): Promise<FinanceActionResult> {
  try {
    const profile = await requireUserProfile()
    requireCapability(profile, 'finance.manage')
    z.string().uuid().parse(periodId)

    const [period] = await db
      .select({ id: fiscalPeriods.id })
      .from(fiscalPeriods)
      .where(
        and(
          eq(fiscalPeriods.id, periodId),
          eq(fiscalPeriods.tenant_id, profile.tenantId)
        )
      )
      .limit(1)
    if (!period) return { ok: false, error: 'Fiscal period not found' }

    await db.execute(sql`
      select public.close_fiscal_period(
        ${periodId}::uuid,
        ${profile.user.id}::uuid
      )
    `)
    revalidatePath('/finance')
    return { ok: true, id: periodId }
  } catch (error) {
    return { ok: false, error: safeError(error) }
  }
}

export interface JournalDraftInput {
  postingDate: string
  description: string
  lines: Array<{
    ledgerAccountId: string
    projectId?: string | null
    description?: string | null
    debitCents: number
    creditCents: number
  }>
}

export async function createJournalDraft(
  rawInput: JournalDraftInput
): Promise<FinanceActionResult> {
  try {
    const profile = await requireUserProfile()
    requireCapability(profile, 'finance.manage')
    const input = journalDraftSchema.parse(rawInput)
    const validation = validateJournalLines(input.lines)
    if (!validation.ok) {
      return {
        ok: false,
        error:
          validation.code === 'unbalanced'
            ? 'Debits and credits must balance.'
            : 'Every journal line needs one positive debit or credit.',
      }
    }

    const accountIds = [
      ...new Set(input.lines.map((line) => line.ledgerAccountId)),
    ]
    const validAccounts = await db
      .select({ id: ledgerAccounts.id })
      .from(ledgerAccounts)
      .where(
        and(
          eq(ledgerAccounts.tenant_id, profile.tenantId),
          eq(ledgerAccounts.is_active, true),
          inArray(ledgerAccounts.id, accountIds)
        )
      )
    if (validAccounts.length !== accountIds.length) {
      return { ok: false, error: 'One or more ledger accounts are unavailable.' }
    }

    const projectIds = [
      ...new Set(
        input.lines
          .map((line) => line.projectId)
          .filter((id): id is string => Boolean(id))
      ),
    ]
    if (projectIds.length > 0) {
      const validProjects = await db
        .select({ id: projects.id })
        .from(projects)
        .where(
          and(
            eq(projects.tenant_id, profile.tenantId),
            inArray(projects.id, projectIds)
          )
        )
      if (validProjects.length !== projectIds.length) {
        return { ok: false, error: 'One or more projects are unavailable.' }
      }
    }

    const entryId = await db.transaction(async (tx) => {
      const [entry] = await tx
        .insert(journalEntries)
        .values({
          tenant_id: profile.tenantId,
          posting_date: input.postingDate,
          description: input.description,
          source_type: 'manual',
          created_by: profile.user.id,
        })
        .returning({ id: journalEntries.id })

      if (!entry) throw new Error('Journal draft could not be created')

      await tx.insert(journalLines).values(
        input.lines.map((line, index) => ({
          tenant_id: profile.tenantId,
          journal_entry_id: entry.id,
          ledger_account_id: line.ledgerAccountId,
          project_id: line.projectId || null,
          line_number: index + 1,
          description: line.description || null,
          debit_cents: line.debitCents,
          credit_cents: line.creditCents,
        }))
      )

      return entry.id
    })

    revalidatePath('/finance')
    return { ok: true, id: entryId }
  } catch (error) {
    return { ok: false, error: safeError(error) }
  }
}

export async function postJournalEntry(
  entryId: string,
  idempotencyKey?: string
): Promise<FinanceActionResult> {
  try {
    const profile = await requireUserProfile()
    requireCapability(profile, 'finance.post')
    z.string().uuid().parse(entryId)

    const [entry] = await db
      .select({ id: journalEntries.id })
      .from(journalEntries)
      .where(
        and(
          eq(journalEntries.id, entryId),
          eq(journalEntries.tenant_id, profile.tenantId)
        )
      )
      .limit(1)
    if (!entry) return { ok: false, error: 'Journal entry not found' }

    if (financeJournalPostWritesUseCoreApi(profile.tenantId)) {
      const coreResult = await postJournalEntryThroughCoreApi(
        entryId,
        idempotencyKey?.trim() || randomUUID()
      )
      if (!coreResult.ok || !coreResult.data) {
        return {
          ok: false,
          error:
            coreResult.error ??
            'Journal entry was not posted. No financial posting was committed.',
        }
      }
      revalidatePath('/finance')
      revalidatePath(`/finance/journals/${entryId}`)
      revalidatePath('/finance/ledger')
      return {
        ok: true,
        id: coreResult.data.journalEntryId,
        number: coreResult.data.postedNumber,
      }
    }

    const rows = await db.execute<{ posted_number: string }>(sql`
      select posted_number
      from public.post_journal_entry(
        ${entryId}::uuid,
        ${profile.user.id}::uuid
      )
    `)

    revalidatePath('/finance')
    revalidatePath(`/finance/journals/${entryId}`)
    revalidatePath('/finance/ledger')
    return { ok: true, id: entryId, number: rows[0]?.posted_number }
  } catch (error) {
    return { ok: false, error: safeError(error) }
  }
}

export async function reverseJournalEntry(input: {
  entryId: string
  reason: string
  postingDate: string
}): Promise<FinanceActionResult> {
  try {
    const profile = await requireUserProfile()
    requireCapability(profile, 'finance.post')
    const parsed = z
      .object({
        entryId: z.string().uuid(),
        reason: z.string().trim().min(3).max(500),
        postingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
      .parse(input)

    const [entry] = await db
      .select({ id: journalEntries.id })
      .from(journalEntries)
      .where(
        and(
          eq(journalEntries.id, parsed.entryId),
          eq(journalEntries.tenant_id, profile.tenantId)
        )
      )
      .limit(1)
    if (!entry) return { ok: false, error: 'Journal entry not found' }

    const rows = await db.execute<{
      reversal_entry_id: string
      reversal_number: string
    }>(sql`
      select reversal_entry_id, reversal_number
      from public.reverse_journal_entry(
        ${parsed.entryId}::uuid,
        ${profile.user.id}::uuid,
        ${parsed.reason}::text,
        ${parsed.postingDate}::date
      )
    `)
    const reversal = rows[0]
    if (!reversal) throw new Error('Reversal was not created')

    revalidatePath('/finance')
    revalidatePath(`/finance/journals/${parsed.entryId}`)
    revalidatePath('/finance/ledger')
    return {
      ok: true,
      id: reversal.reversal_entry_id,
      number: reversal.reversal_number,
    }
  } catch (error) {
    return { ok: false, error: safeError(error) }
  }
}
