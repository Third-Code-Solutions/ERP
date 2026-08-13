/**
 * CX ticket detail (REFACTOR.md US-WA-002).
 *
 * Surfaces full ticket context, the message thread (internal vs client-visible
 * styled differently), and the status-action row (Acknowledge → Schedule →
 * In-progress → Close). Close requires a Service Report document id.
 */

import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { and, desc, eq } from 'drizzle-orm'
import { requireUserProfile, can } from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import {
  warrantyTickets,
  ticketMessages,
  projects,
  accounts,
  documents,
  users,
} from '@third-code-erp/database/schema'
import { TicketMessageThread } from '@/components/warranty/ticket-message-thread'
import { TicketStatusActions } from '@/components/warranty/ticket-status-actions'

export const metadata: Metadata = { title: 'Warranty Ticket' }

const STATUS_BADGE: Record<string, string> = {
  open: 'stage-badge stage-opportunity_creation',
  acknowledged: 'stage-badge stage-scoping',
  scheduled: 'stage-badge stage-bom_submission',
  in_progress: 'stage-badge stage-negotiation',
  closed: 'stage-badge stage-closed_won',
  cancelled: 'stage-badge stage-closed_lost',
}

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function TicketDetailPage({ params }: PageProps) {
  const { id } = await params
  const profile = await requireUserProfile()

  const [ticket] = await db
    .select({
      id: warrantyTickets.id,
      tenant_id: warrantyTickets.tenant_id,
      ticket_number: warrantyTickets.ticket_number,
      category: warrantyTickets.category,
      description: warrantyTickets.description,
      location: warrantyTickets.location,
      status: warrantyTickets.status,
      submitted_by_name: warrantyTickets.submitted_by_name,
      submitted_by_email: warrantyTickets.submitted_by_email,
      acknowledged_at: warrantyTickets.acknowledged_at,
      scheduled_at: warrantyTickets.scheduled_at,
      closed_at: warrantyTickets.closed_at,
      service_report_document_id: warrantyTickets.service_report_document_id,
      created_at: warrantyTickets.created_at,
      sla_breached_ack: warrantyTickets.sla_breached_ack,
      sla_breached_schedule: warrantyTickets.sla_breached_schedule,
      project_id: warrantyTickets.project_id,
      project_name: projects.name,
      account_name: accounts.name,
    })
    .from(warrantyTickets)
    .innerJoin(
      projects,
      and(
        eq(projects.id, warrantyTickets.project_id),
        eq(projects.tenant_id, profile.tenantId),
      ),
    )
    .leftJoin(
      accounts,
      and(
        eq(accounts.id, warrantyTickets.account_id),
        eq(accounts.tenant_id, profile.tenantId),
      ),
    )
    .where(
      and(eq(warrantyTickets.id, id), eq(warrantyTickets.tenant_id, profile.tenantId))
    )
    .limit(1)

  if (!ticket) notFound()

  const messages = await db
    .select({
      id: ticketMessages.id,
      body: ticketMessages.body,
      is_internal: ticketMessages.is_internal,
      sender_name: ticketMessages.sender_name,
      sender_user_id: ticketMessages.sender_user_id,
      created_at: ticketMessages.created_at,
      user_full_name: users.full_name,
    })
    .from(ticketMessages)
    .leftJoin(
      users,
      and(eq(users.id, ticketMessages.sender_user_id), eq(users.tenant_id, profile.tenantId)),
    )
    .where(
      and(
        eq(ticketMessages.ticket_id, id),
        eq(ticketMessages.tenant_id, profile.tenantId),
      ),
    )
    .orderBy(ticketMessages.created_at)

  // Project documents for service-report close picker.
  const projectDocs = await db
    .select({
      id: documents.id,
      file_name: documents.file_name,
      document_type: documents.document_type,
      created_at: documents.created_at,
    })
    .from(documents)
    .where(
      and(
        eq(documents.tenant_id, profile.tenantId),
        eq(documents.project_id, ticket.project_id)
      )
    )
    .orderBy(desc(documents.created_at))
    .limit(50)

  const canManage = can(profile.role, 'warranty.manage')

  return (
    <div>
      <div className="page-header">
        <p className="page-eyebrow">
          <Link href="/warranty" style={{ color: 'inherit' }}>
            ← Back to warranty queue
          </Link>
        </p>
        <h1 className="page-title">
          {ticket.ticket_number}{' '}
          <span className={STATUS_BADGE[ticket.status] ?? 'stage-badge'}>
            <span className="stage-badge-dot" />
            {ticket.status}
          </span>
        </h1>
        <p className="page-subtitle">
          {ticket.project_name}
          {ticket.account_name && <> · {ticket.account_name}</>}
        </p>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) 320px',
          gap: 20,
          alignItems: 'flex-start',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">Issue summary</h2>
            </div>
            <div style={{ padding: 16, display: 'grid', gap: 12 }}>
              <FieldRow label="Category" value={ticket.category} />
              <FieldRow label="Location" value={ticket.location ?? '—'} />
              <FieldRow
                label="Submitted by"
                value={
                  ticket.submitted_by_name
                    ? `${ticket.submitted_by_name} <${ticket.submitted_by_email ?? '—'}>`
                    : (ticket.submitted_by_email ?? '—')
                }
              />
              <FieldRow
                label="Created"
                value={new Date(ticket.created_at).toLocaleString('en-PH')}
              />
              <div>
                <div
                  style={{ fontSize: 11, color: 'var(--color-neutral-600)', marginBottom: 4 }}
                >
                  Description
                </div>
                <div style={{ whiteSpace: 'pre-wrap', fontSize: 14 }}>{ticket.description}</div>
              </div>
              {(ticket.sla_breached_ack || ticket.sla_breached_schedule) && (
                <div
                  style={{
                    background: '#fef3f2',
                    border: '1px solid #f4b4b4',
                    color: '#8a2222',
                    padding: '8px 12px',
                    borderRadius: 6,
                    fontSize: 12.5,
                  }}
                >
                  SLA breached:
                  {ticket.sla_breached_ack && ' acknowledgement'}
                  {ticket.sla_breached_schedule && ' scheduling'}
                </div>
              )}
            </div>
          </div>

          <TicketMessageThread
            ticketId={ticket.id}
            messages={messages.map((m) => ({
              id: m.id,
              body: m.body,
              is_internal: m.is_internal,
              sender_label:
                m.user_full_name || m.sender_name || (m.sender_user_id ? 'Internal' : 'Client'),
              created_at: m.created_at.toISOString(),
            }))}
            canManage={canManage}
          />
        </div>

        <aside style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {canManage && (
            <TicketStatusActions
              ticketId={ticket.id}
              status={ticket.status}
              scheduledAt={ticket.scheduled_at ? ticket.scheduled_at.toISOString() : null}
              serviceReportDocumentId={ticket.service_report_document_id}
              documents={projectDocs.map((d) => ({
                id: d.id,
                file_name: d.file_name,
                document_type: d.document_type,
              }))}
            />
          )}
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">Timeline</h2>
            </div>
            <div style={{ padding: 16, display: 'grid', gap: 10, fontSize: 13 }}>
              <TimelineRow label="Created" date={ticket.created_at} />
              <TimelineRow label="Acknowledged" date={ticket.acknowledged_at} />
              <TimelineRow label="Scheduled" date={ticket.scheduled_at} />
              <TimelineRow label="Closed" date={ticket.closed_at} />
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}

function FieldRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--color-neutral-600)', marginBottom: 2 }}>
        {label}
      </div>
      <div style={{ fontSize: 14 }}>{value}</div>
    </div>
  )
}

function TimelineRow({ label, date }: { label: string; date: Date | null }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
      <span style={{ color: 'var(--color-neutral-600)' }}>{label}</span>
      <span>{date ? new Date(date).toLocaleString('en-PH') : '—'}</span>
    </div>
  )
}
