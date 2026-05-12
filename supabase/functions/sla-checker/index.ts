// SLA Checker — runs every 30 min via pg_cron / Supabase Scheduled Functions.
//
// For each open row in `sla_logs` (completed_at IS NULL AND breached_at IS NULL):
//   • Compute elapsed seconds since started_at.
//   • If elapsed >= breach_at_seconds → mark breached_at = now(), notify admins.
//   • Else if elapsed >= breach_at_seconds * warning_at_pct AND warned_at IS NULL
//     → mark warned_at = now(), notify admins with "approaching breach" subject.
//
// All Postgres access happens via PostgREST + service-role key.

import { handleOptions, jsonResponse } from '../_shared/cors.ts'
import {
  fetchUsersByRoles,
  pgInsert,
  pgSelect,
  pgUpdate,
  sendEmail,
} from '../_shared/email.ts'

interface SlaLogRow {
  id: string
  tenant_id: string
  entity_type: string
  entity_id: string
  sla_label: string
  started_at: string
  sla_seconds: { breach_at_seconds: number; warning_at_pct: number }
  warned_at: string | null
  breached_at: string | null
  completed_at: string | null
}

interface RunSummary {
  processed: number
  warned: number
  breached: number
  errors: Array<{ id: string; error: string }>
}

const ADMIN_ROLES = ['admin', 'owner']

function buildEmailBody(args: {
  label: string
  entityType: string
  entityId: string
  status: 'warning' | 'breach'
  elapsedSeconds: number
  breachAtSeconds: number
}): { subject: string; html: string; text: string } {
  const verb = args.status === 'breach' ? 'BREACHED' : 'approaching breach'
  const subject =
    args.status === 'breach'
      ? `SLA breached: ${args.label}`
      : `SLA approaching breach: ${args.label}`
  const hrsElapsed = (args.elapsedSeconds / 3600).toFixed(1)
  const hrsLimit = (args.breachAtSeconds / 3600).toFixed(1)
  const text = [
    `An SLA timer is ${verb}.`,
    ``,
    `Label: ${args.label}`,
    `Entity: ${args.entityType} ${args.entityId}`,
    `Elapsed: ${hrsElapsed}h of ${hrsLimit}h budget`,
    ``,
    `Open BuildOps to review and resolve.`,
  ].join('\n')
  const html = `
    <p>An SLA timer is <strong>${verb}</strong>.</p>
    <ul>
      <li><strong>Label:</strong> ${args.label}</li>
      <li><strong>Entity:</strong> ${args.entityType} <code>${args.entityId}</code></li>
      <li><strong>Elapsed:</strong> ${hrsElapsed}h of ${hrsLimit}h budget</li>
    </ul>
    <p>Open BuildOps to review and resolve.</p>
  `.trim()
  return { subject, html, text }
}

async function processRow(
  row: SlaLogRow,
  summary: RunSummary,
  nowMs: number
): Promise<void> {
  const startedMs = new Date(row.started_at).getTime()
  const elapsed = Math.floor((nowMs - startedMs) / 1000)
  const cfg = row.sla_seconds
  if (!cfg || typeof cfg.breach_at_seconds !== 'number') {
    summary.errors.push({ id: row.id, error: 'invalid sla_seconds config' })
    return
  }
  const warnThreshold = cfg.breach_at_seconds * cfg.warning_at_pct

  if (elapsed >= cfg.breach_at_seconds) {
    const nowIso = new Date(nowMs).toISOString()
    await pgUpdate('sla_logs', `id=eq.${row.id}`, { breached_at: nowIso })

    const admins = await fetchUsersByRoles(row.tenant_id, ADMIN_ROLES)
    const { subject, html, text } = buildEmailBody({
      label: row.sla_label,
      entityType: row.entity_type,
      entityId: row.entity_id,
      status: 'breach',
      elapsedSeconds: elapsed,
      breachAtSeconds: cfg.breach_at_seconds,
    })

    for (const admin of admins) {
      await pgInsert('notifications', {
        tenant_id: row.tenant_id,
        recipient_user_id: admin.id,
        channel: 'in_app',
        subject,
        body: text,
        payload: {
          template_id: 'sla-breach',
          sla_label: row.sla_label,
          entity_type: row.entity_type,
          entity_id: row.entity_id,
          elapsed_seconds: elapsed,
        },
      })
      await sendEmail({ to: admin.email, subject, html, text })
    }
    summary.breached += 1
    return
  }

  if (elapsed >= warnThreshold && !row.warned_at) {
    const nowIso = new Date(nowMs).toISOString()
    await pgUpdate('sla_logs', `id=eq.${row.id}`, { warned_at: nowIso })

    const admins = await fetchUsersByRoles(row.tenant_id, ADMIN_ROLES)
    const { subject, html, text } = buildEmailBody({
      label: row.sla_label,
      entityType: row.entity_type,
      entityId: row.entity_id,
      status: 'warning',
      elapsedSeconds: elapsed,
      breachAtSeconds: cfg.breach_at_seconds,
    })

    for (const admin of admins) {
      await pgInsert('notifications', {
        tenant_id: row.tenant_id,
        recipient_user_id: admin.id,
        channel: 'in_app',
        subject,
        body: text,
        payload: {
          template_id: 'sla-breach',
          sla_label: row.sla_label,
          entity_type: row.entity_type,
          entity_id: row.entity_id,
          elapsed_seconds: elapsed,
          warning: true,
        },
      })
      await sendEmail({ to: admin.email, subject, html, text })
    }
    summary.warned += 1
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleOptions()

  const summary: RunSummary = { processed: 0, warned: 0, breached: 0, errors: [] }
  const nowMs = Date.now()

  try {
    const rows = await pgSelect<SlaLogRow>(
      'sla_logs',
      'completed_at=is.null&breached_at=is.null&select=*'
    )

    for (const row of rows) {
      summary.processed += 1
      try {
        await processRow(row, summary, nowMs)
      } catch (err) {
        summary.errors.push({
          id: row.id,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }

    return jsonResponse(summary)
  } catch (err) {
    return jsonResponse(
      {
        ...summary,
        fatal: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    )
  }
})
