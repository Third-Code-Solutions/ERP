import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { can, requireUserProfile } from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import { boms, invoices, opportunities, purchaseOrders } from '@third-code-erp/database/schema'
import { and, desc, eq, inArray, sum } from 'drizzle-orm'
import { OpportunityPanel } from '@/components/opportunities/opportunity-panel'
import { ProjectChat } from '@/components/ai/project-chat'
import { CortexEntityPanel } from '@/components/cortex/cortex-entity-panel'
import { COMMITTED_PO_STATUSES } from '@/lib/po-status'
import { EditProjectForm } from '@/components/projects/edit-project-form'
import { DeleteProjectButton } from '@/components/projects/delete-project-button'
import { ProjectCommandCenter } from '@/components/projects/project-command-center'
import { getProject, getProjectCommandCenter } from '@/lib/project-queries'
import styles from './project-page.module.css'
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
  mixed: 'Structural and Civil',
  structural_civil: 'Structural and Civil',
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
  const profile = await requireUserProfile()
  const tenantId = profile.tenantId
  const canUpdateProject = can(profile.role, 'project.update')
  const canDeleteProject = can(profile.role, 'project.delete')

  const project = await getProject(tenantId, id)

  if (!project) return notFound()

  const commandCenter = await getProjectCommandCenter(tenantId, id)

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
    .where(and(eq(opportunities.project_id, id), eq(opportunities.tenant_id, tenantId)))

  const [latestBom] = await db
    .select({ total_cost_cents: boms.total_cost_cents, tcv_cents: boms.tcv_cents, gp_cents: boms.gp_cents, status: boms.status })
    .from(boms)
    .where(and(eq(boms.project_id, id), eq(boms.tenant_id, tenantId), inArray(boms.status, ['approved', 'locked'])))
    .orderBy(desc(boms.version))
    .limit(1)

  const [poCommitted] = await db
    .select({ total: sum(purchaseOrders.total_cents) })
    .from(purchaseOrders)
    .where(
      and(
        eq(purchaseOrders.project_id, id),
        eq(purchaseOrders.tenant_id, tenantId),
        inArray(purchaseOrders.status, [...COMMITTED_PO_STATUSES])
      )
    )

  const [invoiceBilled] = await db
    .select({ total: sum(invoices.net_amount_cents) })
    .from(invoices)
    .where(
      and(
        eq(invoices.project_id, id),
        eq(invoices.tenant_id, tenantId),
        inArray(invoices.status, ['issued', 'partial_payment', 'paid'])
      )
    )

  const bomBudget = latestBom?.total_cost_cents ?? 0
  const poSpend = Number(poCommitted?.total ?? 0)
  const billed = Number(invoiceBilled?.total ?? 0)
  const budgetVariance = bomBudget > 0 ? bomBudget - poSpend : null

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.projectHeader}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
          <Link href="/projects" style={{ color: 'var(--color-neutral-400)', fontSize: '0.875rem', textDecoration: 'none' }}>
            Projects
          </Link>
          <span style={{ color: 'var(--color-neutral-300)' }}>/</span>
          <span style={{ fontSize: '0.875rem', color: 'var(--color-neutral-600)' }}>{project.name}</span>
        </div>
        <div className={styles.projectHeaderRow}>
          <div className={styles.projectHeaderMain}>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: '0 0 4px 0', color: 'var(--color-neutral-900)' }}>
              {project.name}
            </h1>
            <div className={styles.projectFacts}>
              <span>{project.client}</span>
              {project.location && <span>{project.location}</span>}
              {project.project_type && <span>{TYPE_LABELS[project.project_type] ?? project.project_type}</span>}
              {project.total_sqm && <span>{project.total_sqm.toLocaleString()} sqm</span>}
            </div>
          </div>
          <div className={styles.projectActions}>
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
            {canUpdateProject ? <EditProjectForm project={project} /> : null}
            {canDeleteProject ? (
              <DeleteProjectButton projectId={project.id} projectName={project.name} />
            ) : null}
          </div>
        </div>
      </div>

      <ProjectCommandCenter projectId={id} data={commandCenter} />

      {/* Tab navigation is provided by /projects/[id]/layout.tsx */}

      {/* Overview content */}
      <div className={styles.overviewGrid}>
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
          <div className={styles.quickLinks}>
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
              <div className={styles.financialGrid}>
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
        <aside className={styles.contextRail} aria-label="Project context">
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
          <CortexEntityPanel refTable="projects" refId={id} density="compact" />
        </aside>
      </div>
      <ProjectChat projectId={id} />
    </div>
  )
}
