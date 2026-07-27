import type { Metadata } from 'next'
import Link from 'next/link'
import { requireCapability, requireUserProfile } from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import { ledgerAccounts, projects } from '@third-code-erp/database/schema'
import { and, eq } from 'drizzle-orm'
import { JournalForm } from './journal-form'

export const metadata: Metadata = { title: 'New journal' }

export default async function NewJournalPage() {
  const profile = await requireUserProfile()
  requireCapability(profile, 'finance.manage')

  const [accounts, projectRows] = await Promise.all([
    db
      .select({
        id: ledgerAccounts.id,
        code: ledgerAccounts.code,
        name: ledgerAccounts.name,
      })
      .from(ledgerAccounts)
      .where(
        and(
          eq(ledgerAccounts.tenant_id, profile.tenantId),
          eq(ledgerAccounts.is_active, true)
        )
      )
      .orderBy(ledgerAccounts.code),
    db
      .select({ id: projects.id, name: projects.name })
      .from(projects)
      .where(eq(projects.tenant_id, profile.tenantId))
      .orderBy(projects.name),
  ])

  const today = new Date().toISOString().slice(0, 10)

  return (
    <div>
      <div className="page-header finance-page-header">
        <div>
          <p className="finance-eyebrow">
            <Link href="/finance">Finance</Link> · Journal
          </p>
          <h1 className="page-title">Prepare journal</h1>
          <p className="page-subtitle">
            Explain the event, balance the lines, then review before posting.
          </p>
        </div>
      </div>

      {accounts.length < 2 ? (
        <div className="finance-callout">
          Add at least two active ledger accounts in{' '}
          <Link href="/finance">Finance setup</Link> before creating a journal.
        </div>
      ) : (
        <JournalForm
          defaultDate={today}
          accounts={accounts.map((account) => ({
            id: account.id,
            label: `${account.code} · ${account.name}`,
          }))}
          projects={projectRows.map((project) => ({
            id: project.id,
            label: project.name,
          }))}
        />
      )}
    </div>
  )
}
