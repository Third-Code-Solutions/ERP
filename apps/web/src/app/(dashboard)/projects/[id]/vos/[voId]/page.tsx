import Link from 'next/link'
import { notFound } from 'next/navigation'
import { and, eq } from 'drizzle-orm'
import { requireUserProfile } from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import { projects, users } from '@third-code-erp/database/schema'
import { VoApprovalActions } from '@/components/vos/vo-approval-actions'
import { getVoById, type VoStatus } from '../actions'

interface PageProps {
  params: Promise<{ id: string; voId: string }>
}

const STATUS_BADGE: Record<VoStatus, { label: string; tone: string }> = {
  draft: { label: 'Draft', tone: 'stage-badge stage-opportunity_creation' },
  pending_commercial_pricing: {
    label: 'Pending commercial pricing',
    tone: 'stage-badge stage-resubmission',
  },
  pending_client_signature: {
    label: 'Pending client signature',
    tone: 'stage-badge stage-negotiation',
  },
  signed: { label: 'Signed', tone: 'stage-badge stage-closed_won' },
  rejected: { label: 'Rejected', tone: 'stage-badge stage-closed_lost' },
}

const CHANGE_TYPE_LABEL: Record<string, string> = {
  client_initiated: 'Client-initiated',
  site_condition: 'Site condition',
  design_error: 'Design error',
}

function formatPhp(cents: number): string {
  const value = (cents / 100).toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return cents < 0 ? `−₱${value.replace('-', '')}` : `₱${value}`
}

export default async function VoDetailPage({ params }: PageProps) {
  const { id, voId } = await params
  const profile = await requireUserProfile()

  const [project] = await db
    .select({ id: projects.id, name: projects.name })
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.tenant_id, profile.tenantId)))
    .limit(1)

  if (!project) notFound()

  const vo = await getVoById(voId, profile.tenantId)
  if (!vo || vo.project_id !== id) notFound()

  const status = vo.status as VoStatus
  const badge = STATUS_BADGE[status]

  let creatorName: string | null = null
  if (vo.created_by) {
    const [creator] = await db
      .select({ full_name: users.full_name, email: users.email })
      .from(users)
      .where(and(eq(users.id, vo.created_by), eq(users.tenant_id, profile.tenantId)))
      .limit(1)
    creatorName = creator?.full_name ?? creator?.email ?? null
  }

  return (
    <div>
      <div className="page-header">
        <p className="page-eyebrow">
          <Link
            href={`/projects/${id}/vos`}
            style={{ color: 'inherit', textDecoration: 'none' }}
          >
            {project.name} · Variation Orders
          </Link>
        </p>
        <div className="page-toolbar">
          <div>
            <h1 className="page-title">{vo.vo_number}</h1>
            <p className="page-subtitle">
              <span className={badge.tone}>
                <span className="stage-badge-dot" /> {badge.label}
              </span>
              {' · '}
              {CHANGE_TYPE_LABEL[vo.change_type] ?? vo.change_type}
            </p>
          </div>
        </div>
      </div>

      <div className="section-grid-2">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">Description</h2>
            </div>
            <div style={{ padding: 16, fontSize: 13.5, whiteSpace: 'pre-wrap' }}>
              {vo.description}
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <h2 className="card-title">Approval workflow</h2>
            </div>
            <div style={{ padding: 16 }}>
              <VoApprovalActions
                voId={vo.id}
                status={status}
                docusealSubmissionId={vo.docuseal_submission_id ?? null}
              />
            </div>
          </div>
        </div>

        <aside style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">Impact</h2>
            </div>
            <div
              style={{
                padding: 16,
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
                fontSize: 13,
              }}
            >
              <Meta label="Cost impact" value={formatPhp(vo.cost_impact_cents)} mono />
              <Meta
                label="Time impact"
                value={`${vo.time_impact_days > 0 ? '+' : ''}${vo.time_impact_days} days`}
                mono
              />
              <Meta
                label="Change type"
                value={CHANGE_TYPE_LABEL[vo.change_type] ?? vo.change_type}
              />
              <Meta label="Status" value={badge.label} />
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <h2 className="card-title">Audit</h2>
            </div>
            <div
              style={{
                padding: 16,
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
                fontSize: 13,
              }}
            >
              <Meta
                label="Created"
                value={new Date(vo.created_at).toLocaleString('en-PH', {
                  timeZone: 'Asia/Manila',
                })}
              />
              {creatorName && <Meta label="Created by" value={creatorName} />}
              {vo.signed_at && (
                <Meta
                  label="Signed"
                  value={new Date(vo.signed_at).toLocaleString('en-PH', {
                    timeZone: 'Asia/Manila',
                  })}
                />
              )}
              {vo.docuseal_submission_id && (
                <Meta label="DocuSeal submission" value={vo.docuseal_submission_id} mono />
              )}
              {vo.signed_document_id && (
                <Meta label="Signed document" value={vo.signed_document_id} mono />
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}

function Meta({
  label,
  value,
  mono,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'baseline' }}>
      <span
        style={{ color: 'var(--color-neutral-500)', minWidth: 130, fontSize: 12 }}
      >
        {label}
      </span>
      <span
        style={{
          color: 'var(--color-neutral-900)',
          fontFamily: mono ? 'var(--font-mono, monospace)' : 'inherit',
          fontSize: mono ? 12.5 : 13,
          wordBreak: 'break-all',
        }}
      >
        {value}
      </span>
    </div>
  )
}
