import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { requireUserProfile } from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import { boms, invoices, projects } from '@third-code-erp/database/schema'
import { and, desc, eq } from 'drizzle-orm'
import { CreateInvoiceForm } from '@/components/billing/create-invoice-form'

export const metadata: Metadata = { title: 'Billing' }

const TABS = [
  { label: 'Overview', href: '' },
  { label: 'Scope', href: '/scope' },
  { label: 'BOM', href: '/bom' },
  { label: 'Documents', href: '/documents' },
  { label: 'Billing', href: '/billing' },
  { label: 'Comments', href: '/comments' },
  { label: 'Audit', href: '/audit' },
]

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  issued: 'Issued',
  partial_payment: 'Partial',
  paid: 'Paid',
  overdue: 'Overdue',
}

const STATUS_COLORS: Record<string, string> = {
  draft: '#9ca3af',
  issued: '#3b82f6',
  partial_payment: '#f59e0b',
  paid: '#10b981',
  overdue: '#ef4444',
}

function formatPHP(cents: number): string {
  return `₱${(cents / 100).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatBps(bps: number): string {
  return `${(bps / 100).toFixed(1)}%`
}

export default async function ProjectBillingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const profile = await requireUserProfile()

  const [project] = await db
    .select({ id: projects.id, name: projects.name })
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.tenant_id, profile.tenantId)))

  if (!project) return notFound()

  const [latestBom] = await db
    .select({ tcv_cents: boms.tcv_cents, status: boms.status })
    .from(boms)
    .where(and(eq(boms.project_id, id), eq(boms.tenant_id, profile.tenantId)))
    .orderBy(desc(boms.version))
    .limit(1)

  const projectInvoices = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.project_id, id), eq(invoices.tenant_id, profile.tenantId)))
    .orderBy(desc(invoices.created_at))

  const baseHref = `/projects/${id}`

  const totalBilled = projectInvoices.reduce((s, i) => s + i.subtotal_cents, 0)
  const totalCollected = projectInvoices
    .filter((i) => i.status === 'paid')
    .reduce((s, i) => s + i.net_amount_cents, 0)
  const totalRetention = projectInvoices.reduce((s, i) => s + i.retention_cents, 0)
  const contractValue = latestBom?.tcv_cents ?? 0

  return (
    <div>
      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
        <Link href="/projects" style={{ color: 'var(--color-neutral-400)', fontSize: '0.875rem', textDecoration: 'none' }}>
          Projects
        </Link>
        <span style={{ color: 'var(--color-neutral-300)' }}>/</span>
        <Link href={baseHref} style={{ color: 'var(--color-neutral-400)', fontSize: '0.875rem', textDecoration: 'none' }}>
          {project.name}
        </Link>
        <span style={{ color: 'var(--color-neutral-300)' }}>/</span>
        <span style={{ fontSize: '0.875rem', color: 'var(--color-neutral-600)' }}>Billing</span>
      </div>

      {/* Tab nav */}
      <div style={{ display: 'flex', gap: '2px', marginBottom: '24px', borderBottom: '1px solid var(--color-border)', marginTop: '16px' }}>
        {TABS.map(({ label, href }) => {
          const fullHref = baseHref + href
          const isActive = href === '/billing'
          return (
            <Link
              key={label}
              href={fullHref}
              style={{
                padding: '8px 16px',
                fontSize: '0.875rem',
                fontWeight: isActive ? 600 : 400,
                color: isActive ? 'var(--color-navy-700)' : 'var(--color-neutral-500)',
                textDecoration: 'none',
                borderBottom: isActive ? '2px solid var(--color-navy-700)' : '2px solid transparent',
                marginBottom: '-1px',
              }}
            >
              {label}
            </Link>
          )
        })}
      </div>

      {/* Summary KPIs */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '16px',
          marginBottom: '24px',
        }}
      >
        {[
          { label: 'Contract Value (BOM)', value: contractValue > 0 ? formatPHP(contractValue) : '—', note: latestBom ? `BOM ${latestBom.status}` : 'No BOM yet' },
          { label: 'Total Billed', value: formatPHP(totalBilled), note: `${projectInvoices.length} invoice${projectInvoices.length !== 1 ? 's' : ''}` },
          { label: 'Collected', value: formatPHP(totalCollected), note: 'Paid invoices net' },
          { label: 'Retention Held', value: formatPHP(totalRetention), note: 'Standard 10%' },
        ].map(({ label, value, note }) => (
          <div
            key={label}
            style={{
              background: 'white',
              border: '1px solid var(--color-border)',
              borderRadius: '8px',
              padding: '16px 20px',
            }}
          >
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-neutral-400)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '4px' }}>
              {label}
            </div>
            <div style={{ fontSize: '1.375rem', fontWeight: 700, color: 'var(--color-neutral-900)', fontFamily: 'JetBrains Mono, monospace', marginBottom: '2px' }}>
              {value}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--color-neutral-400)' }}>{note}</div>
          </div>
        ))}
      </div>

      {/* Invoices table */}
      <div
        style={{
          background: 'white',
          border: '1px solid var(--color-border)',
          borderRadius: '8px',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--color-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <h2 style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-neutral-800)', margin: 0 }}>
            Invoices
          </h2>
          <CreateInvoiceForm projectId={id} tcvCents={contractValue} />
        </div>

        {projectInvoices.length === 0 ? (
          <div style={{ padding: '40px 24px', textAlign: 'center' }}>
            <p style={{ fontSize: '0.875rem', color: 'var(--color-neutral-500)', margin: 0 }}>
              No invoices yet.{' '}
              {!latestBom ? (
                <>Build and approve a{' '}
                  <Link href={`/projects/${id}/bom`} style={{ color: 'var(--color-navy-700)' }}>BOM</Link>
                  {' '}first.</>
              ) : (
                'Invoices will appear here once billing milestones are created.'
              )}
            </p>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ background: 'var(--color-neutral-50)', borderBottom: '1px solid var(--color-border)' }}>
                {['Invoice #', 'Status', 'Billing %', 'Subtotal', 'Retention', 'VAT', 'Net Amount', 'Due Date', ''].map((h) => (
                  <th
                    key={h}
                    style={{
                      padding: '10px 16px',
                      textAlign: ['Subtotal', 'Retention', 'VAT', 'Net Amount', 'Billing %'].includes(h) ? 'right' : 'left',
                      fontWeight: 600,
                      color: 'var(--color-neutral-600)',
                      fontSize: '0.8125rem',
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {projectInvoices.map((inv, idx) => (
                <tr
                  key={inv.id}
                  style={{ borderBottom: idx < projectInvoices.length - 1 ? '1px solid var(--color-border)' : 'none' }}
                >
                  <td style={{ padding: '12px 16px', fontWeight: 600, fontFamily: 'JetBrains Mono, monospace', fontSize: '0.8125rem' }}>
                    <Link href={`/invoices/${inv.id}`} style={{ color: 'var(--color-navy-700)', textDecoration: 'none' }}>
                      {inv.invoice_number}
                    </Link>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <span
                      style={{
                        display: 'inline-block',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        color: STATUS_COLORS[inv.status] ?? '#9ca3af',
                        background: `${STATUS_COLORS[inv.status] ?? '#9ca3af'}18`,
                      }}
                    >
                      {STATUS_LABELS[inv.status] ?? inv.status}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', color: 'var(--color-neutral-700)' }}>
                    {formatBps(inv.billing_percent_bps)}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', color: 'var(--color-neutral-700)' }}>
                    {formatPHP(inv.subtotal_cents)}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', color: 'var(--color-warning)' }}>
                    ({formatPHP(inv.retention_cents)})
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', color: 'var(--color-neutral-600)' }}>
                    {formatPHP(inv.vat_cents)}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, color: 'var(--color-neutral-900)' }}>
                    {formatPHP(inv.net_amount_cents)}
                  </td>
                  <td style={{ padding: '12px 16px', color: 'var(--color-neutral-500)', fontSize: '0.8125rem' }}>
                    {inv.due_date
                      ? new Date(inv.due_date).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })
                      : '—'}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <Link
                      href={`/invoices/${inv.id}/print`}
                      target="_blank"
                      style={{ fontSize: '0.75rem', color: 'var(--color-neutral-400)', textDecoration: 'none' }}
                    >
                      Print
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
