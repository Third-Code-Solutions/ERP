import 'reflect-metadata'

import { randomUUID } from 'node:crypto'
import { ConfigService } from '@nestjs/config'
import {
  auditLog,
  db,
  fiscalPeriods,
  journalEntries,
  journalLines,
  journalReverseRequests,
  ledgerAccounts,
  tenants,
  users,
  type Database,
} from '@third-code-erp/database'
import { and, eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import type { ErpPrincipal } from '../src/auth/current-principal.decorator'
import { AuditService } from '../src/audit/audit.service'
import {
  DatabaseService,
  type DatabaseTransaction,
} from '../src/database/database.service'
import { JournalPostService } from '../src/finance/journal-post.service'
import { JournalReverseService } from '../src/finance/journal-reverse.service'

const integrationEnabled =
  Boolean(process.env.DATABASE_URL) &&
  process.env.ERP_API_INTEGRATION_EXPECTED === '1'
const suite = integrationEnabled ? describe : describe.skip
const ROLLBACK = Symbol('rollback')

function transactionBoundDatabase(
  transaction: DatabaseTransaction
): DatabaseService {
  const client = new Proxy({} as Database, {
    get(_target, property) {
      if (property === 'transaction') {
        return async (
          callback: (scopedTransaction: DatabaseTransaction) => unknown
        ) => callback(transaction)
      }
      const value = Reflect.get(transaction as unknown as object, property)
      return typeof value === 'function'
        ? value.bind(transaction)
        : value
    },
  })
  return { client } as DatabaseService
}

suite('Journal reversal database integration', () => {
  it('commits one reversal, replays it, and keeps tenant RBAC/audit evidence', async () => {
    try {
      await db.transaction(async (transaction) => {
        const tenantId = randomUUID()
        const financeId = randomUUID()
        const viewerId = randomUUID()
        const periodId = randomUUID()
        const debitAccountId = randomUUID()
        const creditAccountId = randomUUID()
        const journalEntryId = randomUUID()
        const suffix = randomUUID().slice(0, 12)

        await transaction.insert(tenants).values({
          id: tenantId,
          name: 'Journal reverse integration',
          slug: `journal-reverse-${suffix}`,
        })
        await transaction.insert(users).values([
          {
            id: financeId,
            tenant_id: tenantId,
            email: `finance-${suffix}@integration.test`,
            full_name: 'Finance Integration',
            role: 'finance',
          },
          {
            id: viewerId,
            tenant_id: tenantId,
            email: `viewer-${suffix}@integration.test`,
            full_name: 'Viewer Integration',
            role: 'viewer',
          },
        ])
        await transaction.insert(fiscalPeriods).values({
          id: periodId,
          tenant_id: tenantId,
          name: 'FY2026',
          starts_on: '2026-01-01',
          ends_on: '2026-12-31',
          status: 'open',
          created_by: financeId,
        })
        await transaction.insert(ledgerAccounts).values([
          {
            id: debitAccountId,
            tenant_id: tenantId,
            code: '1100',
            name: 'Cash',
            account_type: 'asset',
            normal_balance: 'debit',
            created_by: financeId,
          },
          {
            id: creditAccountId,
            tenant_id: tenantId,
            code: '4000',
            name: 'Revenue',
            account_type: 'income',
            normal_balance: 'credit',
            created_by: financeId,
          },
        ])
        await transaction.insert(journalEntries).values({
          id: journalEntryId,
          tenant_id: tenantId,
          posting_date: '2026-08-01',
          description: 'Integration journal',
          source_type: 'manual',
          created_by: financeId,
        })
        await transaction.insert(journalLines).values([
          {
            tenant_id: tenantId,
            journal_entry_id: journalEntryId,
            ledger_account_id: debitAccountId,
            line_number: 1,
            debit_cents: 10_000,
            credit_cents: 0,
          },
          {
            tenant_id: tenantId,
            journal_entry_id: journalEntryId,
            ledger_account_id: creditAccountId,
            line_number: 2,
            debit_cents: 0,
            credit_cents: 10_000,
          },
        ])

        const bound = transactionBoundDatabase(transaction)
        const audit = new AuditService()
        const principal: ErpPrincipal = {
          userId: financeId,
          tenantId,
          role: 'finance',
          email: `finance-${suffix}@integration.test`,
        }
        const postService = new JournalPostService(
          new ConfigService({
            ERP_FINANCE_JOURNAL_POST_WRITES_ENABLED: true,
            ERP_FINANCE_JOURNAL_POST_WRITES_TENANT_IDS: [tenantId],
          }),
          bound,
          audit
        )
        await postService.post(
          journalEntryId,
          principal,
          'journal-reverse-post-1'
        )

        const reverseService = new JournalReverseService(
          new ConfigService({
            ERP_FINANCE_JOURNAL_REVERSE_WRITES_ENABLED: true,
            ERP_FINANCE_JOURNAL_REVERSE_WRITES_TENANT_IDS: [tenantId],
          }),
          bound,
          audit
        )
        const command = {
          reason: 'Correct duplicate accrual',
          postingDate: '2026-08-02',
        }
        const first = await reverseService.reverse(
          journalEntryId,
          command,
          principal,
          'journal-reverse-integration-1'
        )
        const replay = await reverseService.reverse(
          journalEntryId,
          command,
          principal,
          'journal-reverse-integration-1'
        )

        expect(first).toEqual(replay)
        expect(first).toMatchObject({
          journalEntryId,
          tenantId,
          reversalNumber: 'JE-2026-000002',
        })

        const [reversal] = await transaction
          .select({
            status: journalEntries.status,
            reversesEntryId: journalEntries.reverses_entry_id,
            entryNumber: journalEntries.entry_number,
          })
          .from(journalEntries)
          .where(
            and(
              eq(journalEntries.tenant_id, tenantId),
              eq(journalEntries.id, first.reversalJournalEntryId)
            )
          )
        const [request] = await transaction
          .select({
            state: journalReverseRequests.state,
            result: journalReverseRequests.result,
          })
          .from(journalReverseRequests)
          .where(
            and(
              eq(journalReverseRequests.tenant_id, tenantId),
              eq(
                journalReverseRequests.idempotency_key,
                'journal-reverse-integration-1'
              )
            )
          )
        const auditRows = await transaction
          .select({ action: auditLog.action })
          .from(auditLog)
          .where(
            and(
              eq(auditLog.tenant_id, tenantId),
              eq(auditLog.entity_type, 'journal_entry'),
              eq(auditLog.entity_id, journalEntryId)
            )
          )

        expect(reversal).toEqual({
          status: 'posted',
          reversesEntryId: journalEntryId,
          entryNumber: 'JE-2026-000002',
        })
        expect(request?.state).toBe('succeeded')
        expect(request?.result).toEqual(first)
        expect(
          auditRows.some((row) => row.action === 'status_change')
        ).toBe(true)

        await expect(
          reverseService.reverse(
            journalEntryId,
            command,
            {
              ...principal,
              userId: viewerId,
              role: 'viewer',
              email: `viewer-${suffix}@integration.test`,
            },
            'journal-reverse-viewer-1'
          )
        ).rejects.toThrow()
        throw ROLLBACK
      })
    } catch (error) {
      if (error !== ROLLBACK) throw error
    }
  })
})
