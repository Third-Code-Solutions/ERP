import { requireUuidRouteParams } from '@/lib/uuid-route-params'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { and, desc, eq } from 'drizzle-orm'
import { requireUserProfile } from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import {
  auditLog,
  deliverySchedules,
  deliveryInspections,
  purchaseOrders,
  vendors,
  projects,
  users as usersTable,
} from '@third-code-erp/database/schema'
import { SitePrepPanel } from '@/components/deliveries/site-prep-panel'
import { InspectionPanel } from '@/components/deliveries/inspection-panel'
import { DeliveryStatusActions } from '@/components/deliveries/delivery-status-actions'

export const metadata: Metadata = { title: 'Delivery detail' }

type DeliveryStatus =
  | 'scheduled'
  | 'site_preparing'
  | 'site_ready'
  | 'in_transit'
  | 'received'
  | 'inspecting'
  | 'accepted'
  | 'rejected'
  | 'cancelled'

type InspectionResult = 'pending' | 'pass' | 'fail' | 'partial_pass'

const STATUS_BADGE: Record<string, string> = {
  scheduled: 'stage-badge stage-opportunity_creation',
  site_preparing: 'stage-badge stage-scoping',
  site_ready: 'stage-badge stage-scoping',
  in_transit: 'stage-badge stage-bom_submission',
  received: 'stage-badge stage-negotiation',
  inspecting: 'stage-badge stage-negotiation',
  accepted: 'stage-badge stage-closed_won',
  rejected: 'stage-badge stage-closed_lost',
  cancelled: 'stage-badge stage-closed_lost',
}

function fmtDateTime(d: Date | null | undefined): string {
  if (!d) return '—'
  return new Date(d).toLocaleString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

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
  return date.toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export default async function DeliveryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await requireUuidRouteParams(params)
  const profile = await requireUserProfile()

  const [row] = await db
    .select({
      id: deliverySchedules.id,
      status: deliverySchedules.status,
      scheduled_date: deliverySchedules.scheduled_date,
      site_address: deliverySchedules.site_address,
      site_contact_name: deliverySchedules.site_contact_name,
      site_contact_phone: deliverySchedules.site_contact_phone,
      site_preparation_notes: deliverySchedules.site_preparation_notes,
      site_prepared_at: deliverySchedules.site_prepared_at,
      site_prepared_by: deliverySchedules.site_prepared_by,
      received_at: deliverySchedules.received_at,
      received_by: deliverySchedules.received_by,
      received_notes: deliverySchedules.received_notes,
      rejected_at: deliverySchedules.rejected_at,
      rejected_reason: deliverySchedules.rejected_reason,
      accepted_at: deliverySchedules.accepted_at,
      accepted_by: deliverySchedules.accepted_by,
      created_at: deliverySchedules.created_at,
      created_by: deliverySchedules.created_by,
      purchase_order_id: deliverySchedules.purchase_order_id,
      po_number: purchaseOrders.po_number,
      project_id: purchaseOrders.project_id,
      project_name: projects.name,
      vendor_name: vendors.name,
    })
    .from(deliverySchedules)
    .leftJoin(
      purchaseOrders,
      eq(purchaseOrders.id, deliverySchedules.purchase_order_id)
    )
    .leftJoin(vendors, eq(vendors.id, purchaseOrders.vendor_id))
    .leftJoin(projects, eq(projects.id, purchaseOrders.project_id))
    .where(
      and(
        eq(deliverySchedules.id, id),
        eq(deliverySchedules.tenant_id, profile.tenantId)
      )
    )
    .limit(1)

  if (!row) return notFound()

  // Hydrate stamp names in one tenant-scoped query.
  const userRows = await db
    .select({
      id: usersTable.id,
      full_name: usersTable.full_name,
      email: usersTable.email,
    })
    .from(usersTable)
    .where(eq(usersTable.tenant_id, profile.tenantId))
  const userById = new Map(userRows.map((u) => [u.id, u.full_name || u.email]))

  const inspections = await db
    .select({
      id: deliveryInspections.id,
      inspector_id: deliveryInspections.inspector_id,
      started_at: deliveryInspections.started_at,
      completed_at: deliveryInspections.completed_at,
      result: deliveryInspections.result,
      defect_notes: deliveryInspections.defect_notes,
      acceptance_notes: deliveryInspections.acceptance_notes,
    })
    .from(deliveryInspections)
    .where(
      and(
        eq(deliveryInspections.delivery_schedule_id, row.id),
        eq(deliveryInspections.tenant_id, profile.tenantId)
      )
    )
    .orderBy(desc(deliveryInspections.started_at))

  const auditEntries = await db
    .select()
    .from(auditLog)
    .where(
      and(
        eq(auditLog.tenant_id, profile.tenantId),
        eq(auditLog.entity_type, 'delivery_schedule'),
        eq(auditLog.entity_id, row.id)
      )
    )
    .orderBy(desc(auditLog.created_at))
    .limit(20)

  const status = row.status as DeliveryStatus

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <Link
          href="/procurement/deliveries"
          style={{
            color: 'var(--color-neutral-400)',
            fontSize: '0.875rem',
            textDecoration: 'none',
          }}
        >
          Deliveries
        </Link>
        <span style={{ color: 'var(--color-neutral-300)' }}>/</span>
        <span style={{ fontSize: '0.875rem', color: 'var(--color-neutral-600)' }}>
          {row.po_number ?? '—'}
        </span>
      </div>

      <div className="page-header">
        <p className="page-eyebrow">Procurement · Delivery</p>
        <h1 className="page-title" style={{ marginBottom: 8 }}>
          {row.po_number ?? 'Unknown PO'}
        </h1>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <span className={STATUS_BADGE[status] ?? 'stage-badge'}>
            <span className="stage-badge-dot" />
            {status.replace(/_/g, ' ')}
          </span>
          {row.vendor_name ? (
            <span style={{ fontSize: '0.8125rem', color: 'var(--color-neutral-600)' }}>
              {row.vendor_name}
            </span>
          ) : null}
          {row.project_name ? (
            <span style={{ fontSize: '0.8125rem', color: 'var(--color-neutral-600)' }}>
              · {row.project_name}
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
          {/* Section 1 — Schedule details */}
          <Section title="Schedule details">
            <Grid>
              <MetaField label="Scheduled date" value={fmtDateTime(row.scheduled_date)} />
              <MetaField label="Site address" value={row.site_address ?? '—'} />
              <MetaField
                label="Site contact"
                value={
                  row.site_contact_name
                    ? `${row.site_contact_name}${
                        row.site_contact_phone ? ` · ${row.site_contact_phone}` : ''
                      }`
                    : '—'
                }
              />
              <MetaField
                label="Scheduled by"
                value={
                  row.created_by
                    ? userById.get(row.created_by) ?? '—'
                    : '—'
                }
              />
              <MetaField
                label="Site prep notes"
                value={row.site_preparation_notes ?? '—'}
                span={2}
              />
              <MetaField
                label="Site prepared"
                value={
                  row.site_prepared_at
                    ? `${fmtDateTime(row.site_prepared_at)} · ${
                        row.site_prepared_by
                          ? userById.get(row.site_prepared_by) ?? '—'
                          : '—'
                      }`
                    : '—'
                }
              />
              <MetaField
                label="Received"
                value={
                  row.received_at
                    ? `${fmtDateTime(row.received_at)} · ${
                        row.received_by
                          ? userById.get(row.received_by) ?? '—'
                          : '—'
                      }`
                    : '—'
                }
              />
              {row.received_notes ? (
                <MetaField label="Receipt notes" value={row.received_notes} span={2} />
              ) : null}
              {row.accepted_at ? (
                <MetaField
                  label="Accepted"
                  value={`${fmtDateTime(row.accepted_at)} · ${
                    row.accepted_by ? userById.get(row.accepted_by) ?? '—' : '—'
                  }`}
                />
              ) : null}
              {row.rejected_at ? (
                <MetaField
                  label="Rejected"
                  value={`${fmtDate(row.rejected_at)} — ${row.rejected_reason ?? 'no reason'}`}
                  span={2}
                />
              ) : null}
            </Grid>
          </Section>

          {/* Section 2 — Site prep workflow */}
          <SitePrepPanel
            scheduleId={row.id}
            status={status}
            sitePreparationNotes={row.site_preparation_notes ?? ''}
          />

          {/* Section 3 — Inspection workflow */}
          <InspectionPanel
            scheduleId={row.id}
            status={status}
            inspections={inspections.map((i) => ({
              id: i.id,
              inspector: i.inspector_id ? userById.get(i.inspector_id) ?? null : null,
              started_at: i.started_at ? i.started_at.toISOString() : null,
              completed_at: i.completed_at ? i.completed_at.toISOString() : null,
              result: i.result as InspectionResult,
              defect_notes: i.defect_notes,
              acceptance_notes: i.acceptance_notes,
            }))}
          />

          {/* Section 4 — Audit trail */}
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
                        idx < auditEntries.length - 1
                          ? '1px solid var(--color-border)'
                          : 'none',
                      display: 'grid',
                      gridTemplateColumns: '110px 130px 1fr',
                      gap: 12,
                      fontSize: '0.8125rem',
                    }}
                  >
                    <span style={{ color: 'var(--color-neutral-500)' }}>
                      {relativeTime(new Date(e.created_at))}
                    </span>
                    <span
                      style={{ fontWeight: 500, color: 'var(--color-neutral-800)' }}
                    >
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
          <DeliveryStatusActions scheduleId={row.id} status={status} />
        </div>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
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
        {title}
      </div>
      <div style={{ padding: 16 }}>{children}</div>
    </div>
  )
}

function Grid({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: 16,
      }}
    >
      {children}
    </div>
  )
}

function MetaField({
  label,
  value,
  span,
}: {
  label: string
  value: string
  span?: number
}) {
  return (
    <div style={{ gridColumn: span ? `span ${span}` : undefined }}>
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
      <div
        style={{
          fontSize: '0.875rem',
          color: 'var(--color-neutral-900)',
          whiteSpace: 'pre-wrap',
        }}
      >
        {value}
      </div>
    </div>
  )
}
