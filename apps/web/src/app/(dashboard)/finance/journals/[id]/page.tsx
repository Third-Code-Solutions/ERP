import { requireUuidRouteParams } from '@/lib/uuid-route-params'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { can, requireCapability, requireUserProfile } from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import {
  journalEntries,
  journalLines,
  ledgerAccounts,
  projects,
} from '@third-code-erp/database/schema'
import { and, eq } from 'drizzle-orm'
import { JournalActions } from './journal-actions'

export const metadata: Metadata = { title: 'Journal review' }

function formatPHP(cents: number): string {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
  }).format(cents / 100)
}
function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en-PH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00Z`))
}

export default async function JournalPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const profile = await requireUserProfile()
  requireCapability(profile, 'finance.read')
  const canManage = can(profile.role, 'finance.manage')
  const { id } = await requireUuidRouteParams(params)

  const [entry] = await db
    .select()
    .from(journalEntries)
    .where(
      and(
        eq(journalEntries.id, id),
        eq(journalEntries.tenant_id, profile.tenantId)
      )
    )
    .limit(1)
  if (!entry) notFound()

  const [lines, reversal] = await Promise.all([
    db
      .select({
        id: journalLines.id,
        line_number: journalLines.line_number,
        description: journalLines.description,
        debit_cents: journalLines.debit_cents,
        credit_cents: journalLines.credit_cents,
        account_code: ledgerAccounts.code,
        account_name: ledgerAccounts.name,
        project_id: projects.id,
        project_name: projects.name,
      })
      .from(journalLines)
      .innerJoin(
        ledgerAccounts,
        and(
          eq(ledgerAccounts.id, journalLines.ledger_account_id),
          eq(ledgerAccounts.tenant_id, journalLines.tenant_id)
        )
      )
      .leftJoin(
        projects,
        and(
          eq(projects.id, journalLines.project_id),
          eq(projects.tenant_id, journalLines.tenant_id)
        )
      )
      .where(
        and(
          eq(journalLines.journal_entry_id, entry.id),
          eq(journalLines.tenant_id, profile.tenantId)
        )
      )
      .orderBy(journalLines.line_number),
    db
      .select({
        id: journalEntries.id,
        entry_number: journalEntries.entry_number,
      })
      .from(journalEntries)
      .where(
        and(
          eq(journalEntries.tenant_id, profile.tenantId),
          eq(journalEntries.reverses_entry_id, entry.id)
        )
      )
      .limit(1),
  ])

  const totalDebit = lines.reduce((sum, line) => sum + line.debit_cents, 0)
  const totalCredit = lines.reduce((sum, line) => sum + line.credit_cents, 0)
  const defaultDate = new Date().toISOString().slice(0, 10)

  return (
    <div>
      <div className="page-header finance-page-header">
        <div>
          <p className="finance-eyebrow">
            <Link href="/finance">Finance</Link> · Journal
          </p>
          <h1 className="page-title">{entry.entry_number ?? 'Draft journal'}</h1>
          <p className="page-subtitle">{entry.description}</p>
        </div>
        <span className={`finance-status finance-status-${entry.status}`}>
          {entry.status}
        </span>
      </div>

      <div className="journal-facts">
        <div>
          <span>Posting date</span>
          <strong>{formatDate(entry.posting_date)}</strong>
        </div>
        <div>
          <span>Source</span>
          <strong>{entry.source_type}</strong>
        </div>
        <div>
          <span>Currency</span>
          <strong>{entry.currency}</strong>
        </div>
        <div>
          <span>Posted at</span>
          <strong>
            {entry.posted_at
              ? new Intl.DateTimeFormat('en-PH', {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                }).format(entry.posted_at)
              : 'Not posted'}
          </strong>
        </div>
      </div>

      {entry.reverses_entry_id && (
        <div className="finance-callout">
          Reverses{' '}
          <Link href={`/finance/journals/${entry.reverses_entry_id}`}>
            the original journal
          </Link>
          .
        </div>
      )}
      {reversal[0] && (
        <div className="finance-callout">
          Reversed by{' '}
          <Link href={`/finance/journals/${reversal[0].id}`}>
            {reversal[0].entry_number}
          </Link>
          .
        </div>
      )}

      <div className="finance-table-shell">
        <table className="data-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Ledger account</th>
              <th>Project</th>
              <th>Line note</th>
              <th className="numeric">Debit</th>
              <th className="numeric">Credit</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.id}>
                <td className="muted">{line.line_number}</td>
                <td>
                  <code>{line.account_code}</code> · {line.account_name}
                </td>
                <td>
                  {line.project_id ? (
                    <Link href={`/projects/${line.project_id}`}>
                      {line.project_name}
                    </Link>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
                <td className="muted">{line.description || '—'}</td>
                <td className="numeric">
                  {line.debit_cents ? formatPHP(line.debit_cents) : '—'}
                </td>
                <td className="numeric">
                  {line.credit_cents ? formatPHP(line.credit_cents) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th colSpan={4}>Totals</th>
              <th className="numeric">{formatPHP(totalDebit)}</th>
              <th className="numeric">{formatPHP(totalCredit)}</th>
            </tr>
          </tfoot>
        </table>
      </div>

      {canManage && (
        <JournalActions
          entryId={entry.id}
          status={entry.status}
          sourceType={entry.source_type}
          hasReversal={Boolean(reversal[0])}
          defaultDate={defaultDate}
        />
      )}
    </div>
  )
}
