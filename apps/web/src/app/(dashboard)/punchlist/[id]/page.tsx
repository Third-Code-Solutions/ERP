import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { and, desc, eq } from 'drizzle-orm'
import { requireUserProfile } from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import {
  auditLog,
  documents,
  projects,
  punchlistItems,
  punchlistPhotos,
  users as usersTable,
} from '@third-code-erp/database/schema'
import { PunchlistStatusActions } from '@/components/punchlist/punchlist-status-actions'
import { PunchlistPhotos } from '@/components/punchlist/punchlist-photos'

export const metadata: Metadata = { title: 'Punchlist item' }

const STATUS_BADGE: Record<string, string> = {
  open: 'stage-badge stage-opportunity_creation',
  in_progress: 'stage-badge stage-scoping',
  for_inspection: 'stage-badge stage-negotiation',
  closed: 'stage-badge stage-closed_won',
}

const PRIORITY_COLOR: Record<string, string> = {
  low: 'var(--color-neutral-500)',
  medium: 'var(--color-info)',
  high: 'var(--color-warning)',
  critical: 'var(--color-danger)',
}

const PE_SIGNOFF_ROLES = ['sd_pm_pe', 'pm', 'admin', 'owner']

function fmtDate(d: Date | null | undefined): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function relativeTime(date: Date): string {
  const diff = Date.now() - date.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  return date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default async function PunchlistDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const profile = await requireUserProfile()

  const [item] = await db
    .select({
      id: punchlistItems.id,
      project_id: punchlistItems.project_id,
      project_name: projects.name,
      description: punchlistItems.description,
      location: punchlistItems.location,
      trade: punchlistItems.trade,
      priority: punchlistItems.priority,
      status: punchlistItems.status,
      due_date: punchlistItems.due_date,
      assigned_to_user_id: punchlistItems.assigned_to_user_id,
      assigned_to_text: punchlistItems.assigned_to_text,
      pe_signed_off_at: punchlistItems.pe_signed_off_at,
      pe_signed_off_by: punchlistItems.pe_signed_off_by,
      closed_at: punchlistItems.closed_at,
      created_at: punchlistItems.created_at,
      created_by: punchlistItems.created_by,
    })
    .from(punchlistItems)
    .innerJoin(projects, eq(projects.id, punchlistItems.project_id))
    .where(
      and(eq(punchlistItems.id, id), eq(punchlistItems.tenant_id, profile.tenantId))
    )
    .limit(1)

  if (!item) return notFound()

  // Hydrate user names for the few user FKs in one shot.
  const userIds = [
    item.assigned_to_user_id,
    item.pe_signed_off_by,
    item.created_by,
  ].filter((x): x is string => !!x)
  const userRows = userIds.length
    ? await db
        .select({ id: usersTable.id, full_name: usersTable.full_name, email: usersTable.email })
        .from(usersTable)
        .where(eq(usersTable.tenant_id, profile.tenantId))
    : []
  const userById = new Map(userRows.map((u) => [u.id, u.full_name || u.email]))

  // Photos — join to documents for filenames.
  const photoRows = await db
    .select({
      id: punchlistPhotos.id,
      document_id: punchlistPhotos.document_id,
      caption: punchlistPhotos.caption,
      is_before: punchlistPhotos.is_before,
      created_at: punchlistPhotos.created_at,
      file_name: documents.file_name,
    })
    .from(punchlistPhotos)
    .innerJoin(documents, eq(documents.id, punchlistPhotos.document_id))
    .where(
      and(
        eq(punchlistPhotos.punchlist_item_id, item.id),
        eq(punchlistPhotos.tenant_id, profile.tenantId)
      )
    )
    .orderBy(desc(punchlistPhotos.created_at))

  // Available docs to attach — project images + PDFs that aren't already
  // attached to this item.
  const projectDocs = await db
    .select({
      id: documents.id,
      file_name: documents.file_name,
      document_type: documents.document_type,
    })
    .from(documents)
    .where(
      and(
        eq(documents.tenant_id, profile.tenantId),
        eq(documents.project_id, item.project_id)
      )
    )
    .orderBy(desc(documents.created_at))
    .limit(50)
  const attachedDocIds = new Set(photoRows.map((p) => p.document_id))
  const availableDocs = projectDocs
    .filter((d) => !attachedDocIds.has(d.id))
    .filter(
      (d) =>
        d.document_type === 'image' || d.document_type === 'pdf' || d.document_type === 'other'
    )
    .map((d) => ({ id: d.id, file_name: d.file_name }))

  // Audit trail — last 20 events for this entity.
  const auditEntries = await db
    .select()
    .from(auditLog)
    .where(
      and(
        eq(auditLog.tenant_id, profile.tenantId),
        eq(auditLog.entity_type, 'punchlist_item'),
        eq(auditLog.entity_id, item.id)
      )
    )
    .orderBy(desc(auditLog.created_at))
    .limit(20)

  const canSignOff = PE_SIGNOFF_ROLES.includes(profile.role)
  const assigneeLabel = item.assigned_to_user_id
    ? userById.get(item.assigned_to_user_id) ?? '—'
    : item.assigned_to_text ?? '—'

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <Link
          href="/punchlist"
          style={{
            color: 'var(--color-neutral-400)',
            fontSize: '0.875rem',
            textDecoration: 'none',
          }}
        >
          Punchlist
        </Link>
        <span style={{ color: 'var(--color-neutral-300)' }}>/</span>
        <Link
          href={`/projects/${item.project_id}`}
          style={{
            color: 'var(--color-neutral-400)',
            fontSize: '0.875rem',
            textDecoration: 'none',
          }}
        >
          {item.project_name}
        </Link>
        <span style={{ color: 'var(--color-neutral-300)' }}>/</span>
        <span style={{ fontSize: '0.875rem', color: 'var(--color-neutral-600)' }}>
          {item.description.slice(0, 60)}
        </span>
      </div>

      <div className="page-header">
        <p className="page-eyebrow">Post-Construction · Punchlist</p>
        <h1 className="page-title" style={{ marginBottom: 8 }}>
          {item.description}
        </h1>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <span className={STATUS_BADGE[item.status] ?? 'stage-badge'}>
            <span className="stage-badge-dot" />
            {item.status.replace(/_/g, ' ')}
          </span>
          <span style={{ color: PRIORITY_COLOR[item.priority], fontWeight: 600, fontSize: '0.875rem' }}>
            {item.priority.toUpperCase()}
          </span>
          {item.trade ? (
            <span style={{ fontSize: '0.8125rem', color: 'var(--color-neutral-600)' }}>
              {item.trade}
            </span>
          ) : null}
          {item.location ? (
            <span style={{ fontSize: '0.8125rem', color: 'var(--color-neutral-600)' }}>
              {item.location}
            </span>
          ) : null}
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 320px',
          gap: 20,
          alignItems: 'start',
        }}
      >
        {/* Main column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Meta card */}
          <div
            style={{
              background: 'white',
              border: '1px solid var(--color-border)',
              borderRadius: 8,
              padding: 16,
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: 16,
            }}
          >
            <MetaField label="Project" value={item.project_name} />
            <MetaField label="Assignee" value={assigneeLabel} />
            <MetaField label="Due date" value={fmtDate(item.due_date)} />
            <MetaField label="Created" value={fmtDate(item.created_at)} />
            <MetaField
              label="PE signed off"
              value={
                item.pe_signed_off_at
                  ? `${fmtDate(item.pe_signed_off_at)} · ${
                      item.pe_signed_off_by
                        ? userById.get(item.pe_signed_off_by) ?? '—'
                        : '—'
                    }`
                  : '—'
              }
            />
            <MetaField label="Closed" value={fmtDate(item.closed_at)} />
          </div>

          {/* Photos */}
          <PunchlistPhotos
            itemId={item.id}
            projectId={item.project_id}
            photos={photoRows.map((p) => ({
              id: p.id,
              document_id: p.document_id,
              file_name: p.file_name,
              caption: p.caption,
              is_before: p.is_before,
              created_at: p.created_at,
            }))}
            availableDocs={availableDocs}
            canEdit={item.status !== 'closed'}
          />

          {/* Audit trail */}
          <div
            style={{
              background: 'white',
              border: '1px solid var(--color-border)',
              borderRadius: 8,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                padding: '12px 16px',
                borderBottom: '1px solid var(--color-border)',
                fontSize: '0.875rem',
                fontWeight: 600,
                color: 'var(--color-neutral-900)',
              }}
            >
              Audit trail ({auditEntries.length})
            </div>
            {auditEntries.length === 0 ? (
              <div
                style={{
                  padding: 24,
                  textAlign: 'center',
                  fontSize: '0.8125rem',
                  color: 'var(--color-neutral-500)',
                }}
              >
                No audit events recorded yet.
              </div>
            ) : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {auditEntries.map((e, idx) => (
                  <li
                    key={e.id}
                    style={{
                      padding: '10px 16px',
                      borderBottom:
                        idx < auditEntries.length - 1 ? '1px solid var(--color-border)' : 'none',
                      display: 'grid',
                      gridTemplateColumns: '110px 110px 1fr',
                      gap: 12,
                      fontSize: '0.8125rem',
                    }}
                  >
                    <span style={{ color: 'var(--color-neutral-500)' }}>
                      {relativeTime(new Date(e.created_at))}
                    </span>
                    <span style={{ fontWeight: 500, color: 'var(--color-neutral-800)' }}>
                      {e.action}
                    </span>
                    <span
                      style={{
                        fontFamily: 'JetBrains Mono, monospace',
                        fontSize: '0.75rem',
                        color: 'var(--color-neutral-600)',
                      }}
                    >
                      {e.diff
                        ? Object.entries(e.diff as Record<string, unknown>)
                            .slice(0, 2)
                            .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
                            .join(' · ')
                        : '—'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Right rail */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <PunchlistStatusActions
            itemId={item.id}
            currentStatus={item.status as 'open' | 'in_progress' | 'for_inspection' | 'closed'}
            isSignedOff={!!item.pe_signed_off_at}
            canSignOff={canSignOff}
          />
        </div>
      </div>
    </div>
  )
}

function MetaField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div
        style={{
          fontSize: '0.7rem',
          fontWeight: 600,
          color: 'var(--color-neutral-500)',
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: '0.875rem', color: 'var(--color-neutral-900)' }}>{value}</div>
    </div>
  )
}
