import type { Metadata } from 'next'
import Link from 'next/link'
import { requireCapability, requireUserProfile } from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import {
  cashAccounts,
  ledgerAccounts,
} from '@third-code-erp/database/schema'
import { and, asc, eq, inArray } from 'drizzle-orm'
import { BankStatementImportForm } from '../statement-import-form'
import { financeReconciliationStorageUploadsUseCoreApi } from '@/lib/erp-core-client'

export const metadata: Metadata = { title: 'Import bank statement' }

export default async function NewBankStatementPage() {
  const profile = await requireUserProfile()
  requireCapability(profile, 'finance.manage_cash')

  const accountRows = await db
    .select({
      id: cashAccounts.id,
      name: cashAccounts.name,
      kind: cashAccounts.account_kind,
      currency: cashAccounts.currency,
      code: ledgerAccounts.code,
    })
    .from(cashAccounts)
    .innerJoin(
      ledgerAccounts,
      and(
        eq(ledgerAccounts.id, cashAccounts.ledger_account_id),
        eq(ledgerAccounts.tenant_id, cashAccounts.tenant_id)
      )
    )
    .where(
      and(
        eq(cashAccounts.tenant_id, profile.tenantId),
        eq(cashAccounts.is_active, true),
        inArray(cashAccounts.account_kind, ['bank', 'e_wallet']),
        eq(ledgerAccounts.is_active, true)
      )
    )
    .orderBy(asc(cashAccounts.name))

  const today = new Date().toISOString().slice(0, 10)
  const monthStart = `${today.slice(0, 8)}01`

  return (
    <div>
      <div className="finance-breadcrumb">
        <Link href="/finance/reconciliation">Bank reconciliation</Link>
        <span>/</span>
        <span>Import statement</span>
      </div>
      <div className="page-header finance-page-header">
        <div>
          <p className="finance-eyebrow">Controlled source evidence</p>
          <h1 className="page-title">Import bank statement</h1>
          <p className="page-subtitle">
            Upload a signed-amount CSV. ABI OPS validates every line and
            fingerprints the exact source before saving one atomic draft.
          </p>
        </div>
      </div>

      {accountRows.length === 0 ? (
        <section className="finance-section">
          <div className="card-empty">
            <p>
              Set up an active bank or e-wallet Cash Account before importing a
              statement.
            </p>
            <Link href="/finance">Open Finance controls</Link>
          </div>
        </section>
      ) : (
        <BankStatementImportForm
          cashAccounts={accountRows.map((account) => ({
            id: account.id,
            label: `${account.name} / ${account.code} / ${account.currency}`,
          }))}
          defaultStart={monthStart}
          defaultEnd={today}
          storageUploadsEnabled={financeReconciliationStorageUploadsUseCoreApi(
            profile.tenantId
          )}
        />
      )}
    </div>
  )
}
