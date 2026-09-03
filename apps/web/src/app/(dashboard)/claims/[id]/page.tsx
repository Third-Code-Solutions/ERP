/**
 * Progress Claim detail page (Track 3 of M5).
 *
 * Layout:
 *   - Breadcrumb + header with claim number, project, status badge
 *   - 6/7-step stepper (Draft → Submitted → Certificate → Certified →
 *     Finance → Invoiced → Paid)
 *   - section-grid-2:
 *       LEFT  → claim summary card · attached documents list · attach form
 *       RIGHT → state-transition action panel (per status)
 *   - Audit trail at the bottom (last 20 events for this claim)
 *
 * Server component; mutations live in ./actions and are called from the
 * client components in the right rail.
 */

import { requireUuidRouteParams } from '@/lib/uuid-route-params'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { and, desc, eq, inArray } from 'drizzle-orm'
import { can, requireUserProfile } from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import {
  auditLog,
  documents,
  invoices,
  progressClaimDocuments,
  progressClaims,
  projects,
  users as usersTable,
} from '@third-code-erp/database/schema'
import { ClaimDetailHeader } from '@/components/claims/claim-detail-header'
import { ClaimStepper } from '@/components/claims/claim-stepper'
import { ClaimTransitionActions } from '@/components/claims/claim-transition-actions'
import { ClaimDocumentAttach } from '@/components/claims/claim-document-attach'

export const metadata: Metadata = { title: 'Progress Claim' }

type ClaimStatus =
  | 'draft'
  | 'submitted'
  | 'certificate_pending'
  | 'certified'
  | 'handed_over_finance'
  | 'invoiced'
  | 'paid'
  | 'rejected'
  | 'cancelled'

function pesos(cents: number): string {
  return `₱${(cents / 100).toLocaleString('en-PH')}`
}

function fmtDate(d: Date | null | undefined): string {
  if (!d) return '—'
  return new Date(d).toLocaleString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
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

const KIND_LABELS: Record<string, string> = {
  photo: 'Photo',
  certificate: 'Certificate',
  measurement: 'Measurement',
  other: 'Other',
}

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function ClaimDetailPage({ params }: PageProps) {
  const { id } = await requireUuidRouteParams(params)
  const profile = await requireUserProfile()
  const canManageClaim =
    can(profile.role, 'po.create') ||
    can(profile.role, 'precon.manage_checklist') ||
    can(profile.role, 'finance.issue_invoice')
  const canAttachDocument = can(profile.role, 'document.manage')

  // Claim + project join — bound by tenant.
  const [claim] = await db
    .select({
      id: progressClaims.id,
      claim_number: progressClaims.claim_number,
      project_id: progressClaims.project_id,
      project_name: projects.name,
      milestone_pct: progressClaims.milestone_pct,
      amount_cents: progressClaims.amount_cents,
      description: progressClaims.description,
      status: progressClaims.status,
      submitted_at: progressClaims.submitted_at,
      submitted_by: progressClaims.submitted_by,
      certified_at: progressClaims.certified_at,
      certified_by: progressClaims.certified_by,
      certificate_document_id: progressClaims.certificate_document_id,
      handed_over_to_finance_at: progressClaims.handed_over_to_finance_at,
      handed_over_to_finance_by: progressClaims.handed_over_to_finance_by,
      invoice_id: progressClaims.invoice_id,
      paid_at: progressClaims.paid_at,
      rejected_at: progressClaims.rejected_at,
      rejected_reason: progressClaims.rejected_reason,
      created_at: progressClaims.created_at,
      created_by: progressClaims.created_by,
    })
    .from(progressClaims)
    .innerJoin(projects, eq(projects.id, progressClaims.project_id))
    .where(
      and(eq(progressClaims.id, id), eq(progressClaims.tenant_id, profile.tenantId))
    )
    .limit(1)

  if (!claim) return notFound()

  // Hydrate the few user FKs in one query.
  const userIds = [
    claim.created_by,
    claim.submitted_by,
    claim.certified_by,
    claim.handed_over_to_finance_by,
  ].filter((x): x is string => !!x)
  const userRows =
    userIds.length > 0
      ? await db
          .select({
            id: usersTable.id,
            full_name: usersTable.full_name,
            email: usersTable.email,
          })
          .from(usersTable)
          .where(
            and(
              eq(usersTable.tenant_id, profile.tenantId),
              inArray(usersTable.id, userIds)
            )
          )
      : []
  const userById = new Map(
    userRows.map((u) => [u.id, u.full_name || u.email] as const)
  )
  function nameOf(uid: string | null | undefined): string {
    if (!uid) return '—'
    return userById.get(uid) ?? '—'
  }

  // Attached documents — joined to documents for the filename.
  const attachedDocs = await db
    .select({
      id: progressClaimDocuments.id,
      document_id: progressClaimDocuments.document_id,
      kind: progressClaimDocuments.kind,
      caption: progressClaimDocuments.caption,
      uploaded_at: progressClaimDocuments.uploaded_at,
      file_name: documents.file_name,
      document_type: documents.document_type,
    })
    .from(progressClaimDocuments)
    .innerJoin(documents, eq(documents.id, progressClaimDocuments.document_id))
    .where(
      and(
        eq(progressClaimDocuments.claim_id, id),
        eq(progressClaimDocuments.tenant_id, profile.tenantId)
      )
    )
    .orderBy(desc(progressClaimDocuments.uploaded_at))

  // Certificate candidates — project-scoped documents.
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
        eq(documents.project_id, claim.project_id)
      )
    )
    .orderBy(desc(documents.created_at))
    .limit(50)

  // Invoices on this project — for the "Link invoice" picker.
  const projectInvoices = await db
    .select({
      id: invoices.id,
      invoice_number: invoices.invoice_number,
      net_amount_cents: invoices.net_amount_cents,
    })
    .from(invoices)
    .where(
      and(
        eq(invoices.tenant_id, profile.tenantId),
        eq(invoices.project_id, claim.project_id)
      )
    )
    .orderBy(desc(invoices.created_at))
    .limit(50)

  // Linked invoice summary (when present).
  let linkedInvoice: {
    id: string
    invoice_number: string
    net_amount_cents: number
  } | null = null
  if (claim.invoice_id) {
    const [inv] = await db
      .select({
        id: invoices.id,
        invoice_number: invoices.invoice_number,
        net_amount_cents: invoices.net_amount_cents,
      })
      .from(invoices)
      .where(
        and(eq(invoices.id, claim.invoice_id), eq(invoices.tenant_id, profile.tenantId))
      )
      .limit(1)
    linkedInvoice = inv ?? null
  }

  // Audit trail for this entity, last 20 events.
  const auditEntries = await db
    .select()
    .from(auditLog)
    .where(
      and(
        eq(auditLog.tenant_id, profile.tenantId),
        eq(auditLog.entity_type, 'progress_claim'),
        eq(auditLog.entity_id, id)
      )
    )
    .orderBy(desc(auditLog.created_at))
    .limit(20)

  return (
    <div>
      <ClaimDetailHeader
        claimNumber={claim.claim_number}
        status={claim.status}
        projectId={claim.project_id}
        projectName={claim.project_name}
        milestonePct={claim.milestone_pct}
      />

      <div style={{ marginBottom: 18 }}>
        <ClaimStepper status={claim.status} />
      </div>

      <div className="section-grid-2">
        {/* Main column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* Summary card */}
          <div
            style={{
              background: 'white',
              border: '1px solid var(--color-border)',
              borderRadius: 8,
              padding: 16,
            }}
          >
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: 16,
              }}
            >
              <MetaField label="Project" value={claim.project_name} />
              <MetaField
                label="Milestone"
                value={`${claim.milestone_pct}%`}
                mono
              />
              <MetaField label="Amount" value={pesos(claim.amount_cents)} mono />
              <MetaField label="Status" value={statusLabel(claim.status)} />
              <MetaField
                label="Created"
                value={`${fmtDate(claim.created_at)} · ${nameOf(claim.created_by)}`}
              />
              <MetaField
                label="Submitted"
                value={
                  claim.submitted_at
                    ? `${fmtDate(claim.submitted_at)} · ${nameOf(claim.submitted_by)}`
                    : '—'
                }
              />
              <MetaField
                label="Certified"
                value={
                  claim.certified_at
                    ? `${fmtDate(claim.certified_at)} · ${nameOf(claim.certified_by)}`
                    : '—'
                }
              />
              <MetaField
                label="Handed to Finance"
                value={
                  claim.handed_over_to_finance_at
                    ? `${fmtDate(claim.handed_over_to_finance_at)} · ${nameOf(claim.handed_over_to_finance_by)}`
                    : '—'
                }
              />
              <MetaField
                label="Invoice"
                value={
                  linkedInvoice
                    ? `${linkedInvoice.invoice_number} · ${pesos(linkedInvoice.net_amount_cents)}`
                    : '—'
                }
              />
              <MetaField label="Paid" value={fmtDate(claim.paid_at)} />
            </div>

            {claim.description && (
              <div style={{ marginTop: 16 }}>
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
                  Description
                </div>
                <div
                  style={{
                    fontSize: '0.875rem',
                    color: 'var(--color-neutral-900)',
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {claim.description}
                </div>
              </div>
            )}

            {claim.rejected_reason &&
              (claim.status === 'rejected' || claim.status === 'cancelled') && (
                <div
                  style={{
                    marginTop: 16,
                    background: '#fef3f2',
                    border: '1px solid #f4b4b4',
                    color: '#8a2222',
                    padding: '10px 12px',
                    borderRadius: 6,
                    fontSize: 12.5,
                  }}
                >
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>
                    {claim.status === 'rejected' ? 'Rejected' : 'Cancelled'} reason
                  </div>
                  <div>{claim.rejected_reason}</div>
                </div>
              )}
          </div>

          {/* Attached documents */}
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
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span>Attached documents ({attachedDocs.length})</span>
            </div>
            {attachedDocs.length === 0 ? (
              <div
                style={{
                  padding: 24,
                  textAlign: 'center',
                  fontSize: '0.8125rem',
                  color: 'var(--color-neutral-500)',
                }}
              >
                No documents attached yet. Use the form below to attach photos,
                certificates, or measurements.
              </div>
            ) : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {attachedDocs.map((d, idx) => (
                  <li
                    key={d.id}
                    style={{
                      padding: '12px 16px',
                      borderBottom:
                        idx < attachedDocs.length - 1
                          ? '1px solid var(--color-border)'
                          : 'none',
                      display: 'grid',
                      gridTemplateColumns: '110px 1fr 160px',
                      gap: 12,
                      alignItems: 'center',
                      fontSize: 13,
                    }}
                  >
                    <span
                      className="stage-badge"
                      style={{
                        background:
                          d.kind === 'certificate'
                            ? '#ecfdf5'
                            : d.kind === 'measurement'
                              ? '#eff6ff'
                              : 'var(--color-neutral-50)',
                        color:
                          d.kind === 'certificate'
                            ? '#15803d'
                            : d.kind === 'measurement'
                              ? '#1d4ed8'
                              : 'var(--color-neutral-700)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                        fontSize: 11,
                      }}
                    >
                      {KIND_LABELS[d.kind] ?? d.kind}
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          fontWeight: 500,
                          color: 'var(--color-neutral-900)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                        title={d.file_name}
                      >
                        {d.file_name}
                      </div>
                      {d.caption && (
                        <div
                          style={{
                            fontSize: 12,
                            color: 'var(--color-neutral-500)',
                            marginTop: 2,
                          }}
                        >
                          {d.caption}
                        </div>
                      )}
                    </div>
                    <span
                      style={{
                        fontSize: 12,
                        color: 'var(--color-neutral-500)',
                        textAlign: 'right',
                      }}
                    >
                      {fmtDate(d.uploaded_at)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Attach form — disabled on terminal states. */}
          {canAttachDocument && <ClaimDocumentAttach
            claimId={claim.id}
            disabled={
              claim.status === 'paid' ||
              claim.status === 'rejected' ||
              claim.status === 'cancelled'
            }
          />}

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
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                      title={
                        e.diff
                          ? JSON.stringify(e.diff)
                          : undefined
                      }
                    >
                      {e.diff
                        ? Object.entries(e.diff as Record<string, unknown>)
                            .slice(0, 3)
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
        {canManageClaim && <aside style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <ClaimTransitionActions
            claimId={claim.id}
            status={claim.status as ClaimStatus}
            rejectedReason={claim.rejected_reason}
            certificateDocs={projectDocs.map((d) => ({
              id: d.id,
              file_name: d.file_name,
            }))}
            invoices={projectInvoices.map((i) => ({
              id: i.id,
              invoice_number: i.invoice_number,
              net_amount_cents: i.net_amount_cents,
            }))}
          />
        </aside>}
      </div>
    </div>
  )
}

function statusLabel(status: string): string {
  return status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function MetaField({
  label,
  value,
  mono,
}: {
  label: string
  value: string
  mono?: boolean
}) {
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
      <div
        style={{
          fontSize: '0.875rem',
          color: 'var(--color-neutral-900)',
          fontFamily: mono ? 'JetBrains Mono, monospace' : undefined,
        }}
      >
        {value}
      </div>
    </div>
  )
}
