import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getUser } from '@buildops/auth'
import { db } from '@buildops/database'
import { boms, invoices, opportunities, projects, purchaseOrders, users } from '@buildops/database/schema'
import { and, desc, eq, inArray, sum } from 'drizzle-orm'
import { OpportunityPanel } from '@/components/opportunities/opportunity-panel'
import { ProjectChat } from '@/components/ai/project-chat'
import { CortexEntityPanel } from '@/components/cortex/cortex-entity-panel'
import { EditProjectForm } from '@/components/projects/edit-project-form'
import {
  IconLayers,
  IconBom,
  IconDocuments,
  IconReceipt,
  IconChevronRight,
} from '@/components/ui/icons'

export const metadata: Metadata = { title: 'Project' }

function formatPHP(cents: number): string {
  return `₱${(cents / 100).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

const TYPE_LABELS: Record<string, string> = {
  mep: 'MEP',
  fit_out: 'Fit-out',
  interior: 'Interior',
  mixed: 'Mixed',
}

const STATUS_LABELS: Record<string, string> = {
  lead: 'Lead',
  active: 'Active',
  on_hold: 'On Hold',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

const STATUS_COLORS: Record<string, string> = {
  lead: 'var(--color-neutral-400)',
  active: 'var(--color-success)',
  on_hold: 'var(--color-warning)',
  completed: 'var(--color-info)',
  cancelled: 'var(--color-danger)',
}

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getUser()
  if (!user) return null

  const [userRow] = await db.select({ tenant_id: users.tenant_id }).from(users).where(eq(users.id, user.id))
  if (!userRow?.tenant_id) return notFound()

  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.tenant_id, userRow.tenant_id)))

  if (!project) return notFound()

  const opps = await db
    .select({
      id: opportunities.id,
      stage: opportunities.stage,
      tcv_cents: opportunities.tcv_cents,
      gp_cents: opportunities.gp_cents,
      probability: opportunities.probability,
      weighted_tcv_cents: opportunities.weighted_tcv_cents,
      closing_date: opportunities.closing_date,
      area_sqm: opportunities.area_sqm,
      opportunity_type: opportunities.opportunity_type,
    })
    .from(opportunities)
    .where(and(eq(opportunities.project_id, id), eq(opportunities.tenant_id, userRow.tenant_id)))

  const [latestBom] = await db
    .select({ total_cost_cents: boms.total_cost_cents, tcv_cents: boms.tcv_cents, gp_cents: boms.gp_cents, status: boms.status })
    .from(boms)
    .where(and(eq(boms.project_id, id), eq(boms.tenant_id, userRow.tenant_id), inArray(boms.status, ['approved', 'locked'])))
    .orderBy(desc(boms.version))
    .limit(1)

  const [poCommitted] = await db
    .select({ total: sum(purchaseOrders.total_cents) })
    .from(purchaseOrders)
    .where(
      and(
        eq(purchaseOrders.project_id, id),
        eq(purchaseOrders.tenant_id, userRow.tenant_id),
        inArray(purchaseOrders.status, ['submitted', 'confirmed', 'partial_delivery', 'delivered'])
      )
    )

  const [invoiceBilled] = await db
    .select({ total: sum(invoices.net_amount_cents) })
    .from(invoices)
    .where(
      and(
        eq(invoices.project_id, id),
        eq(invoices.tenant_id, userRow.tenant_id),
        inArray(invoices.status, ['issued', 'partial_payment', 'paid'])
      )
    )

  const bomBudget = latestBom?.total_cost_cents ?? 0
  const poSpend = Number(poCommitted?.total ?? 0)
  const billed = Number(invoiceBilled?.total ?? 0)
  const budgetVariance = bomBudget > 0 ? bomBudget - poSpend : null

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
          <Link href="/projects" style={{ color: 'var(--color-neutral-400)', fontSize: '0.875rem', textDecoration: 'none' }}>
            Projects
          </Link>
          <span style={{ color: 'var(--color-neutral-300)' }}>/</span>
          <span style={{ fontSize: '0.875rem', color: 'var(--color-neutral-600)' }}>{project.name}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: '0 0 4px 0', color: 'var(--color-neutral-900)' }}>
              {project.name}
            </h1>
            <div style={{ display: 'flex', gap: '16px', fontSize: '0.875rem', color: 'var(--color-neutral-500)' }}>
              <span>{project.client}</span>
              {project.location && <span>{project.location}</span>}
              {project.project_type && <span>{TYPE_LABELS[project.project_type] ?? project.project_type}</span>}
              {project.total_sqm && <span>{project.total_sqm.toLocaleString()} sqm</span>}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span
              style={{
                padding: '4px 12px',
                borderRadius: '4px',
                fontSize: '0.8125rem',
                fontWeight: 600,
                color: STATUS_COLORS[project.status] ?? 'inherit',
                background: 'var(--color-neutral-50)',
                border: '1px solid var(--color-border)',
              }}
            >
              {STATUS_LABELS[project.status] ?? project.status}
            </span>
            <EditProjectForm project={project} />
          </div>
        </div>
      </div>

      {/* Tab navigation is provided by /projects/[id]/layout.tsx */}

      {/* Overview content */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '24px' }}>
        <div>
          {/* Notes */}
          {project.notes && (
            <div
              style={{
                background: 'white',
                border: '1px solid var(--color-border)',
                borderRadius: '8px',
                padding: '20px',
                marginBottom: '16px',
              }}
            >
              <h3 style={{ fontSize: '0.875rem', fontWeight: 600, margin: '0 0 12px 0', color: 'var(--color-neutral-700)' }}>
                Notes
              </h3>
              <p style={{ fontSize: '0.875rem', color: 'var(--color-neutral-600)', margin: 0, lineHeight: 1.6 }}>
                {project.notes}
              </p>
            </div>
          )}

          {/* Quick links to tabs */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: 12,
              marginBottom: 24,
            }}
          >
            {[
              {
                label: 'Scope',
                hint: 'Rooms, areas, takeoff',
                href: `/projects/${id}/scope`,
                Icon: IconLayers,
              },
              {
                label: 'Bill of Materials',
                hint: 'Line items & costs',
                href: `/projects/${id}/bom`,
                Icon: IconBom,
              },
              {
                label: 'Documents',
                hint: 'DWG, DXF, PDFs, images',
                href: `/projects/${id}/documents`,
                Icon: IconDocuments,
              },
              {
                label: 'Billing',
                hint: 'Invoices & retention',
                href: `/projects/${id}/billing`,
                Icon: IconReceipt,
              },
            ].map(({ label, hint, href: tabHref, Icon }) => (
              <Link
                key={label}
                href={tabHref}
                className="quick-link-card"
              >
                <span className="quick-link-icon" aria-hidden>
                  <Icon size={18} />
                </span>
                <div className="quick-link-body">
                  <span className="quick-link-label">{label}</span>
                  <span className="quick-link-hint">{hint}</span>
                </div>
                <span className="quick-link-chev" aria-hidden>
                  <IconChevronRight size={14} />
                </span>
              </Link>
            ))}
          </div>

          {/* Financial health */}
          {(latestBom || poSpend > 0 || billed > 0) && (
            <div
              style={{
                background: 'white',
                border: '1px solid var(--color-border)',
                borderRadius: '8px',
                padding: '20px',
                marginBottom: '16px',
              }}
            >
              <h3 style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-neutral-500)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 16px' }}>
                Financial Health
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
                {[
                  {
                    label: 'BOM Budget',
                    value: bomBudget > 0 ? formatPHP(bomBudget) : '—',
                    note: latestBom ? `BOM ${latestBom.status}` : 'No approved BOM',
                    color: 'var(--color-neutral-900)',
                  },
                  {
                    label: 'PO Committed',
                    value: poSpend > 0 ? formatPHP(poSpend) : '—',
                    note: 'Submitted + confirmed POs',
                    color: 'var(--color-neutral-900)',
                  },
                  {
                    label: 'Budget Variance',
                    value: budgetVariance !== null ? formatPHP(Math.abs(budgetVariance)) : '—',
                    note: budgetVariance === null ? 'No BOM yet' : budgetVariance >= 0 ? 'Under budget' : 'Over budget',
                    color: budgetVariance === null ? 'var(--color-neutral-400)' : budgetVariance >= 0 ? '#10b981' : '#ef4444',
                  },
                  {
                    label: 'Billed to Client',
                    value: billed > 0 ? formatPHP(billed) : '—',
                    note: 'Issued + paid invoices',
                    color: 'var(--color-neutral-900)',
                  },
                ].map(({ label, value, note, color }) => (
                  <div key={label}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-neutral-400)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '4px' }}>
                      {label}
                    </div>
                    <div style={{ fontSize: '1.125rem', fontWeight: 700, color, fontFamily: 'JetBrains Mono, monospace', marginBottom: '2px' }}>
                      {value}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--color-neutral-400)' }}>{note}</div>
                  </div>
                ))}
              </div>
              {budgetVariance !== null && budgetVariance < 0 && (
                <div
                  style={{
                    marginTop: '14px',
                    padding: '10px 14px',
                    background: '#fef2f2',
                    border: '1px solid #fecaca',
                    borderRadius: '6px',
                    fontSize: '0.8125rem',
                    color: '#7f1d1d',
                  }}
                >
                  PO spend exceeds BOM budget by {formatPHP(Math.abs(budgetVariance))}. Review procurement or revise the BOM.
                </div>
              )}
            </div>
          )}

          {/* Pipeline opportunities */}
          <OpportunityPanel projectId={id} opportunities={opps} />
        </div>

        {/* Right metadata rail */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', height: 'fit-content' }}>
        <div
          style={{
            background: 'white',
            border: '1px solid var(--color-border)',
            borderRadius: '8px',
            padding: '20px',
          }}
        >
          <h3 style={{ fontSize: '0.875rem', fontWeight: 600, margin: '0 0 16px 0', color: 'var(--color-neutral-700)' }}>
            Project Details
          </h3>
          <dl style={{ margin: 0 }}>
            {[
              { label: 'Status', value: STATUS_LABELS[project.status] ?? project.status },
              { label: 'Type', value: project.project_type ? (TYPE_LABELS[project.project_type] ?? project.project_type) : '—' },
              { label: 'Client', value: project.client },
              { label: 'Location', value: project.location ?? '—' },
              { label: 'Area', value: project.total_sqm ? `${project.total_sqm.toLocaleString()} sqm` : '—' },
              {
                label: 'Created',
                value: new Date(project.created_at).toLocaleDateString('en-PH', {
                  year: 'numeric', month: 'long', day: 'numeric',
                }),
              },
            ].map(({ label, value }) => (
              <div key={label} style={{ marginBottom: '12px' }}>
                <dt style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-neutral-400)', marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  {label}
                </dt>
                <dd style={{ fontSize: '0.875rem', color: 'var(--color-neutral-800)', margin: 0 }}>
                  {value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
          <CortexEntityPanel refTable="projects" refId={id} />
        </div>
      </div>
      <ProjectChat projectId={id} />
    </div>
  )
}
