'use server'

import { createHash } from 'node:crypto'
import { Buffer } from 'node:buffer'
import { revalidatePath } from 'next/cache'
import { requireCapability, requireUserProfile } from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import {
  bankStatementLines,
  bankStatements,
  cashAccounts,
} from '@third-code-erp/database/schema'
import { and, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { parseBankStatementCsv } from './bank-statement-csv'
import {
  autoMatchBankStatementThroughCoreApi,
  createBankStatementThroughCoreApi,
  financeReconciliationAutoMatchWritesUseCoreApi,
  financeReconciliationImportWritesUseCoreApi,
  financeReconciliationStorageUploadsUseCoreApi,
} from '@/lib/erp-core-client'

export interface ReconciliationActionResult {
  ok: boolean
  error?: string
  id?: string
  matchedCount?: number
  remainingCount?: number
}

const signedMoneySchema = z
  .number()
  .int()
  .min(Number.MIN_SAFE_INTEGER)
  .max(Number.MAX_SAFE_INTEGER)

const statementSchema = z
  .object({
    cashAccountId: z.string().uuid(),
    referenceNumber: z.string().trim().min(1).max(120),
    sourceFileName: z.string().trim().min(1).max(255),
    statementStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    statementEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    openingBalanceCents: signedMoneySchema,
    closingBalanceCents: signedMoneySchema,
    sourceBase64: z
      .string()
      .min(1)
      .max(2_700_000)
      .regex(/^[A-Za-z0-9+/]+={0,2}$/)
      .refine((value) => value.length % 4 === 0, {
        message: 'Source file encoding is invalid.',
      })
      .optional(),
    sourceStoragePath: z
      .string()
      .trim()
      .min(1)
      .max(2_000)
      .regex(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/bank-statements\/[^/]+$/i,
        'Source storage path is invalid.'
      )
      .optional(),
  })
  .refine((value) => value.statementStart <= value.statementEnd, {
    message: 'Statement end must be on or after its start.',
  })
  .refine(
    (value) => Boolean(value.sourceBase64) !== Boolean(value.sourceStoragePath),
    { message: 'Provide exactly one inline source or storage source.' }
  )

function safeReconciliationError(error: unknown): string {
  if (error instanceof z.ZodError) {
    return error.issues[0]?.message ?? 'Check the statement fields.'
  }

  const message = error instanceof Error ? error.message : ''
  const known = [
    'CSV requires a header and at least one statement line',
    'CSV header must include date, reference, description, amount',
    'Statement dates must use YYYY-MM-DD',
    'Statement contains an invalid calendar date',
    'Statement amounts must be signed numbers with two decimals',
    'Statement amounts must be safe, non-zero values',
    'A statement can contain at most 5,000 lines',
    'Source file encoding is invalid',
    'Source file must be 2 MB or smaller',
    'Storage-backed bank import requires Core authority',
    'Storage-backed bank import is not enabled for this tenant',
    'Active bank or e-wallet Cash Account is required',
    'Bank statement line must match its tenant and date range',
    'Bank statement match does not agree with posted cash',
    'Only a draft bank statement can be matched',
    'Only a draft bank statement can be reconciled',
    'Bank statement requires at least one line',
    'Bank statement balances do not roll forward',
    'Every bank statement line must be matched',
    'Matched cash evidence changed before reconciliation',
    'Only a reconciled bank statement can be voided',
    'Bank statement void reason is required',
  ]

  if (
    message.includes('ux_bank_statements_reference') ||
    message.includes('ux_bank_statement_lines_fingerprint')
  ) {
    return 'That statement reference or an exact duplicate line already exists.'
  }
  if (message.includes('ux_bank_statement_lines_cash_transaction')) {
    return 'That cash transaction is already matched to another statement line.'
  }
  if (
    /^Line \d+ (requires a concise description|reference is too long)$/.test(
      message
    )
  ) {
    return message
  }

  return (
    known.find((candidate) => message.includes(candidate)) ??
    'Reconciliation action failed. Existing financial evidence was unchanged.'
  )
}

function revalidateReconciliation(statementId?: string) {
  revalidatePath('/finance')
  revalidatePath('/finance/cash')
  revalidatePath('/finance/reconciliation')
  if (statementId) {
    revalidatePath(`/finance/reconciliation/${statementId}`)
  }
}

export async function createBankStatement(
  input: z.input<typeof statementSchema>
): Promise<ReconciliationActionResult> {
  try {
    const profile = await requireUserProfile()
    requireCapability(profile, 'finance.manage_cash')
    const parsed = statementSchema.parse(input)
    if (
      parsed.sourceStoragePath &&
      !financeReconciliationStorageUploadsUseCoreApi(profile.tenantId)
    ) {
      throw new Error('Storage-backed bank import is not enabled for this tenant')
    }
    if (financeReconciliationImportWritesUseCoreApi(profile.tenantId)) {
      const idempotencyKey = `bank-import-${createHash('sha256')
        .update(JSON.stringify(parsed))
        .digest('hex')}`
      const coreResult = await createBankStatementThroughCoreApi(
        parsed,
        idempotencyKey
      )
      if (!coreResult.ok || !coreResult.data) {
        return {
          ok: false,
          error:
            coreResult.error ??
            'ERP Core did not import the bank statement. Existing evidence was unchanged.',
        }
      }
      revalidateReconciliation(coreResult.data.statementId)
      return { ok: true, id: coreResult.data.statementId }
    }
    if (parsed.sourceStoragePath) {
      throw new Error('Storage-backed bank import requires Core authority')
    }
    if (!parsed.sourceBase64) {
      throw new Error('Provide exactly one import source')
    }
    const sourceBytes = Buffer.from(parsed.sourceBase64, 'base64')
    if (sourceBytes.length === 0 || sourceBytes.length > 2_000_000) {
      throw new Error('Source file must be 2 MB or smaller')
    }
    const lines = parseBankStatementCsv(sourceBytes.toString('utf8'))
    const sourceSha256 = createHash('sha256')
      .update(sourceBytes)
      .digest('hex')

    if (
      lines.some(
        (line) =>
          line.transactionDate < parsed.statementStart ||
          line.transactionDate > parsed.statementEnd
      )
    ) {
      throw new Error('Bank statement line must match its tenant and date range')
    }

    const fingerprints = new Set<string>()
    for (const line of lines) {
      const fingerprint = [
        line.transactionDate,
        line.referenceNumber?.toLowerCase() ?? '',
        line.amountCents,
        line.description.trim().toLowerCase(),
      ].join('|')
      if (fingerprints.has(fingerprint)) {
        throw new Error(
          'That statement reference or an exact duplicate line already exists.'
        )
      }
      fingerprints.add(fingerprint)
    }

    const lineTotal = lines.reduce(
      (sum, line) => sum + line.amountCents,
      0
    )
    if (
      !Number.isSafeInteger(lineTotal) ||
      parsed.openingBalanceCents + lineTotal !== parsed.closingBalanceCents
    ) {
      throw new Error('Bank statement balances do not roll forward')
    }

    const [cashAccount] = await db
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
    if (!cashAccount) {
      throw new Error('Active bank or e-wallet Cash Account is required')
    }

    const statementId = await db.transaction(async (tx) => {
      const [statement] = await tx
        .insert(bankStatements)
        .values({
          tenant_id: profile.tenantId,
          cash_account_id: cashAccount.id,
          reference_number: parsed.referenceNumber,
          source_file_name: parsed.sourceFileName,
          source_sha256: sourceSha256,
          statement_start: parsed.statementStart,
          statement_end: parsed.statementEnd,
          currency: cashAccount.currency,
          opening_balance_cents: parsed.openingBalanceCents,
          closing_balance_cents: parsed.closingBalanceCents,
          created_by: profile.user.id,
        })
        .returning({ id: bankStatements.id })
      if (!statement) throw new Error('Bank statement was not created')

      await tx.insert(bankStatementLines).values(
        lines.map((line, index) => ({
          tenant_id: profile.tenantId,
          bank_statement_id: statement.id,
          line_number: index + 1,
          transaction_date: line.transactionDate,
          reference_number: line.referenceNumber,
          description: line.description,
          amount_cents: line.amountCents,
        }))
      )
      return statement.id
    })

    revalidateReconciliation(statementId)
    return { ok: true, id: statementId }
  } catch (error) {
    return { ok: false, error: safeReconciliationError(error) }
  }
}

export async function deleteBankStatementDraft(
  statementId: string
): Promise<ReconciliationActionResult> {
  try {
    const profile = await requireUserProfile()
    requireCapability(profile, 'finance.manage_cash')
    const parsedId = z.string().uuid().parse(statementId)
    const deleted = await db.transaction(async (tx) => {
      const [draft] = await tx
        .select({ id: bankStatements.id })
        .from(bankStatements)
        .where(
          and(
            eq(bankStatements.id, parsedId),
            eq(bankStatements.tenant_id, profile.tenantId),
            eq(bankStatements.status, 'draft')
          )
        )
        .limit(1)
      if (!draft) return null
      await tx
        .delete(bankStatementLines)
        .where(
          and(
            eq(bankStatementLines.bank_statement_id, draft.id),
            eq(bankStatementLines.tenant_id, profile.tenantId)
          )
        )
      const [statement] = await tx
        .delete(bankStatements)
        .where(
          and(
            eq(bankStatements.id, draft.id),
            eq(bankStatements.tenant_id, profile.tenantId),
            eq(bankStatements.status, 'draft')
          )
        )
        .returning({ id: bankStatements.id })
      return statement ?? null
    })
    if (!deleted) return { ok: false, error: 'Bank statement draft not found' }
    revalidateReconciliation()
    return { ok: true }
  } catch (error) {
    return { ok: false, error: safeReconciliationError(error) }
  }
}

export async function autoMatchBankStatement(
  statementId: string,
  idempotencyKey?: string
): Promise<ReconciliationActionResult> {
  try {
    const profile = await requireUserProfile()
    requireCapability(profile, 'finance.manage_cash')
    const parsedId = z.string().uuid().parse(statementId)
    if (financeReconciliationAutoMatchWritesUseCoreApi(profile.tenantId)) {
      const parsedKey = z.string().trim().min(1).max(256).safeParse(idempotencyKey)
      if (!parsedKey.success) {
        return {
          ok: false,
          error:
            'Retry token is required for the bank statement auto-match command.',
        }
      }
      const coreResult = await autoMatchBankStatementThroughCoreApi(
        parsedId,
        parsedKey.data
      )
      if (!coreResult.ok || !coreResult.data) {
        return {
          ok: false,
          error:
            coreResult.error ??
            'ERP Core did not auto-match the bank statement. Existing evidence was unchanged.',
        }
      }
      revalidateReconciliation(coreResult.data.statementId)
      return {
        ok: true,
        id: coreResult.data.statementId,
        matchedCount: coreResult.data.matchedCount,
        remainingCount: coreResult.data.remainingCount,
      }
    }
    const rows = await db.execute<{
      matched_count: number
      remaining_count: number
    }>(sql`
      select matched_count, remaining_count
      from public.auto_match_bank_statement(
        ${parsedId}::uuid,
        ${profile.user.id}::uuid
      )
    `)
    const result = rows[0]
    if (!result) throw new Error('Auto-match returned no result')
    revalidateReconciliation(parsedId)
    return {
      ok: true,
      id: parsedId,
      matchedCount: Number(result.matched_count),
      remainingCount: Number(result.remaining_count),
    }
  } catch (error) {
    return { ok: false, error: safeReconciliationError(error) }
  }
}

export async function matchBankStatementLine(input: {
  lineId: string
  statementId: string
  cashTransactionId: string
}): Promise<ReconciliationActionResult> {
  try {
    const profile = await requireUserProfile()
    requireCapability(profile, 'finance.manage_cash')
    const parsed = z
      .object({
        lineId: z.string().uuid(),
        statementId: z.string().uuid(),
        cashTransactionId: z.string().uuid(),
      })
      .parse(input)
    await db.execute(sql`
      select public.match_bank_statement_line(
        ${parsed.lineId}::uuid,
        ${parsed.cashTransactionId}::uuid,
        ${profile.user.id}::uuid
      )
    `)
    revalidateReconciliation(parsed.statementId)
    return { ok: true, id: parsed.statementId }
  } catch (error) {
    return { ok: false, error: safeReconciliationError(error) }
  }
}

export async function unmatchBankStatementLine(input: {
  lineId: string
  statementId: string
}): Promise<ReconciliationActionResult> {
  try {
    const profile = await requireUserProfile()
    requireCapability(profile, 'finance.manage_cash')
    const parsed = z
      .object({
        lineId: z.string().uuid(),
        statementId: z.string().uuid(),
      })
      .parse(input)
    await db.execute(sql`
      select public.unmatch_bank_statement_line(
        ${parsed.lineId}::uuid,
        ${profile.user.id}::uuid
      )
    `)
    revalidateReconciliation(parsed.statementId)
    return { ok: true, id: parsed.statementId }
  } catch (error) {
    return { ok: false, error: safeReconciliationError(error) }
  }
}

export async function reconcileBankStatement(
  statementId: string
): Promise<ReconciliationActionResult> {
  try {
    const profile = await requireUserProfile()
    requireCapability(profile, 'finance.manage_cash')
    const parsedId = z.string().uuid().parse(statementId)
    await db.execute(sql`
      select public.reconcile_bank_statement(
        ${parsedId}::uuid,
        ${profile.user.id}::uuid
      )
    `)
    revalidateReconciliation(parsedId)
    return { ok: true, id: parsedId }
  } catch (error) {
    return { ok: false, error: safeReconciliationError(error) }
  }
}

export async function voidBankStatement(input: {
  statementId: string
  reason: string
}): Promise<ReconciliationActionResult> {
  try {
    const profile = await requireUserProfile()
    requireCapability(profile, 'finance.manage_cash')
    const parsed = z
      .object({
        statementId: z.string().uuid(),
        reason: z.string().trim().min(3).max(500),
      })
      .parse(input)
    await db.execute(sql`
      select public.void_bank_statement(
        ${parsed.statementId}::uuid,
        ${profile.user.id}::uuid,
        ${parsed.reason}::text
      )
    `)
    revalidateReconciliation(parsed.statementId)
    return { ok: true, id: parsed.statementId }
  } catch (error) {
    return { ok: false, error: safeReconciliationError(error) }
  }
}
