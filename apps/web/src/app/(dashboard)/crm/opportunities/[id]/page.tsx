import Link from 'next/link'
import { notFound } from 'next/navigation'
import { and, eq, desc } from 'drizzle-orm'
import { requireUserProfile } from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import {
  opportunities,
  accounts,
  projects,
  pprfSubmissions,
  siteInspections,
  designFiles,
  changeRequests,
} from '@third-code-erp/database/schema'
import { formatCentsCompact } from '@third-code-erp/shared-types'

interface PageProps {
  params: Promise<{ id: string }>
}

const STAGE_BADGE: Record<string, string> = {
  opportunity_creation: 'stage-badge stage-opportunity_creation',
  scoping: 'stage-badge stage-scoping',
  bom_submission: 'stage-badge stage-bom_submission',
  resubmission: 'stage-badge stage-resubmission',
  negotiation: 'stage-badge stage-negotiation',
  closed_won: 'stage-badge stage-closed_won',
  closed_lost: 'stage-badge stage-closed_lost',
}

export default async function OpportunityDetailPage({ params }: PageProps) {
  const { id } = await params
  const profile = await requireUserProfile()

  const [opp] = await db
    .select({
      id: opportunities.id,
      stage: opportunities.stage,
      tcv_cents: opportunities.tcv_cents,
      gp_cents: opportunities.gp_cents,
      probability: opportunities.probability,
      weighted_tcv_cents: opportunities.weighted_tcv_cents,
      area_sqm: opportunities.area_sqm,
      opportunity_type: opportunities.opportunity_type,
      closing_date: opportunities.closing_date,
      account_id: opportunities.account_id,
      project_id: opportunities.project_id,
      account_name: accounts.name,
      project_name: projects.name,
    })
    .from(opportunities)
    .leftJoin(accounts, eq(opportunities.account_id, accounts.id))
    .leftJoin(projects, eq(opportunities.project_id, projects.id))
    .where(and(eq(opportunities.id, id), eq(opportunities.tenant_id, profile.tenantId)))
    .limit(1)

  if (!opp) notFound()

  const isWon = opp.stage === 'closed_won'

  // Surface a few summary stats so the landing is meaningful even on
  // brand-new opps: PPRF count, inspection status, design count, CR count.
  const [pprfRows, inspectionRows, designRows, crRows] = await Promise.all([
    db
      .select({ version: pprfSubmissions.version })
      .from(pprfSubmissions)
      .where(eq(pprfSubmissions.opportunity_id, id))
      .orderBy(desc(pprfSubmissions.version))
      .limit(1),
    db
      .select({ id: siteInspections.id, status: siteInspections.status })
      .from(siteInspections)
      .where(eq(siteInspections.opportunity_id, id))
      .orderBy(desc(siteInspections.created_at))
      .limit(1),
    db
      .select({ id: designFiles.id, is_client_approved: designFiles.is_client_approved })
      .from(designFiles)
      .where(eq(designFiles.opportunity_id, id)),
    db
      .select({ id: changeRequests.id, resolved_at: changeRequests.resolved_at })
      .from(changeRequests)
      .where(eq(changeRequests.opportunity_id, id)),
  ])

  const latestPprfVersion = pprfRows[0]?.version ?? null
  const latestInspection = inspectionRows[0] ?? null
  const designCount = designRows.length
  const approvedDesignCount = designRows.filter((d) => d.is_client_approved).length
  const openCrCount = crRows.filter((c) => !c.resolved_at).length

  return (
    <div>
      <div className="page-header">
        <p className="page-eyebrow">
          <Link href="/crm/accounts" style={{ color: 'inherit', textDecoration: 'none' }}>CRM</Link>
          {' · '}
          <Link href={opp.account_id ? `/crm/accounts/${opp.account_id}` : '/crm/accounts'} style={{ color: 'inherit', textDecoration: 'none' }}>
            {opp.account_name ?? 'Account'}
          </Link>
          {' · Opportunity'}
        </p>
        <div className="page-toolbar">
          <div>
            <h1 className="page-title">{opp.project_name ?? opp.opportunity_type ?? 'Opportunity'}</h1>
            <p className="page-subtitle">
              <span className={STAGE_BADGE[opp.stage] ?? 'stage-badge'}>
                <span className="stage-badge-dot" /> {opp.stage.replace(/_/g, ' ')}
              </span>
              {opp.probability > 0 && (
                <> · {opp.probability}% probability</>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Opportunity tabs row — Proposal · BOM · Project (gated on Won) */}
      <nav className="opp-tabs" aria-label="Opportunity sections">
        <Link href={`/crm/opportunities/${id}/proposal`} className="opp-tab is-active">
          Proposal
        </Link>
        <Link
          href={opp.project_id ? `/projects/${opp.project_id}/bom` : '#'}
          className={`opp-tab${opp.project_id ? '' : ' is-disabled'}`}
          aria-disabled={!opp.project_id}
        >
          BOM
        </Link>
        <Link
          href={opp.project_id ? `/projects/${opp.project_id}` : '#'}
          className={`opp-tab${isWon && opp.project_id ? '' : ' is-disabled'}`}
          aria-disabled={!isWon || !opp.project_id}
          title={isWon ? 'Project workspace' : 'Available once the deal is Won'}
        >
          Project
        </Link>
      </nav>

      <div className="section-grid-2">
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Commercials</h2>
          </div>
          <div style={{ padding: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 13 }}>
            <Meta label="TCV" value={`₱${formatCentsCompact(opp.tcv_cents)}`} />
            <Meta label="GP" value={`₱${formatCentsCompact(opp.gp_cents)}`} />
            <Meta label="Weighted" value={`₱${formatCentsCompact(opp.weighted_tcv_cents)}`} />
            <Meta label="Area" value={opp.area_sqm ? `${opp.area_sqm} sqm` : '—'} />
            <Meta
              label="Closing date"
              value={
                opp.closing_date
                  ? new Date(opp.closing_date).toLocaleDateString('en-PH', {
                      year: 'numeric', month: 'short', day: 'numeric',
                    })
                  : '—'
              }
            />
            <Meta label="Type" value={opp.opportunity_type ?? '—'} />
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Proposal progress</h2>
          </div>
          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13 }}>
            <Phase
              label="PPRF"
              status={latestPprfVersion ? `Submitted · v${latestPprfVersion}` : 'Not submitted'}
              done={!!latestPprfVersion}
            />
            <Phase
              label="Site inspection"
              status={
                latestInspection
                  ? latestInspection.status === 'submitted'
                    ? 'Submitted'
                    : `Draft (${latestInspection.status})`
                  : 'Not started'
              }
              done={latestInspection?.status === 'submitted'}
            />
            <Phase
              label="Design"
              status={
                designCount === 0
                  ? 'No designs uploaded'
                  : `${designCount} design${designCount === 1 ? '' : 's'} · ${approvedDesignCount} approved`
              }
              done={approvedDesignCount > 0}
            />
            <Phase
              label="Change requests"
              status={openCrCount === 0 ? 'None open' : `${openCrCount} open`}
              done={openCrCount === 0}
              warn={openCrCount > 0}
            />
            <Link
              href={`/crm/opportunities/${id}/proposal`}
              style={{
                marginTop: 6,
                fontSize: 13,
                fontWeight: 500,
                color: 'var(--color-navy-700)',
                textDecoration: 'none',
              }}
            >
              Open proposal workspace →
            </Link>
          </div>
        </div>
      </div>

      <style>{`
        .opp-tabs {
          display: flex;
          gap: 4px;
          border-bottom: 1px solid var(--color-border);
          margin-bottom: 18px;
        }
        .opp-tab {
          padding: 9px 16px;
          font-size: 13px;
          font-weight: 500;
          color: var(--color-neutral-600);
          text-decoration: none;
          border-bottom: 2px solid transparent;
        }
        .opp-tab:hover { color: var(--color-neutral-900); }
        .opp-tab.is-active {
          color: var(--color-navy-700);
          border-bottom-color: var(--color-navy-700);
        }
        .opp-tab.is-disabled {
          color: var(--color-neutral-400);
          pointer-events: none;
        }
      `}</style>
    </div>
  )
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ color: 'var(--color-neutral-500)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</span>
      <span style={{ color: 'var(--color-neutral-900)', fontWeight: 500 }}>{value}</span>
    </div>
  )
}

function Phase({
  label,
  status,
  done,
  warn,
}: {
  label: string
  status: string
  done?: boolean
  warn?: boolean
}) {
  const color = done
    ? 'var(--color-success, #15803d)'
    : warn
      ? 'var(--color-warning, #c2410c)'
      : 'var(--color-neutral-500)'
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
      <span style={{ color: 'var(--color-neutral-900)', fontWeight: 500 }}>
        <span style={{ color, marginRight: 8 }}>{done ? '✓' : warn ? '!' : '·'}</span>
        {label}
      </span>
      <span style={{ color: 'var(--color-neutral-500)', fontSize: 12 }}>{status}</span>
    </div>
  )
}
