// Permit Staleness Checker — runs daily at 08:00 PHT (00:00 UTC).
//
// Finds permits that have been sitting in a non-terminal status for more
// than 7 days and notifies PM + GM (admin) for that tenant.

import { handleOptions, jsonResponse } from '../_shared/cors.ts'
import {
  fetchUsersByRoles,
  pgInsert,
  pgSelect,
  sendEmail,
} from '../_shared/email.ts'

interface PermitRow {
  id: string
  tenant_id: string
  project_id: string
  permit_type: string
  status: string
  last_status_change_at: string
  submitted_at: string | null
  expected_approval_at: string | null
}

interface ProjectLite {
  id: string
  name: string
}

interface RunSummary {
  processed: number
  notified: number
  errors: Array<{ id: string; error: string }>
}

const PM_ROLES = ['sd_pm_pe', 'pm']
const GM_ROLES = ['admin', 'owner']

function buildBody(args: {
  projectName: string
  permitType: string
  status: string
  daysStale: number
}): { subject: string; html: string; text: string } {
  const subject = `Stale permit: ${args.permitType} on ${args.projectName} (${args.daysStale}d)`
  const text = [
    `A permit has been in status "${args.status}" for ${args.daysStale} days without movement.`,
    ``,
    `Project: ${args.projectName}`,
    `Permit type: ${args.permitType}`,
    `Status: ${args.status}`,
    ``,
    `Action needed: follow up with the issuing agency or update the status if it moved.`,
  ].join('\n')
  const html = `
    <p>A permit has been in status <strong>${args.status}</strong> for <strong>${args.daysStale} days</strong> without movement.</p>
    <ul>
      <li><strong>Project:</strong> ${args.projectName}</li>
      <li><strong>Permit type:</strong> ${args.permitType}</li>
      <li><strong>Status:</strong> ${args.status}</li>
    </ul>
    <p>Action needed: follow up with the issuing agency or update the status if it moved.</p>
  `.trim()
  return { subject, html, text }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleOptions()

  const summary: RunSummary = { processed: 0, notified: 0, errors: [] }
  const nowMs = Date.now()
  const sevenDaysAgoIso = new Date(nowMs - 7 * 86400 * 1000).toISOString()

  try {
    const permits = await pgSelect<PermitRow>(
      'permits',
      `status=not.in.(approved,rejected)&last_status_change_at=lt.${sevenDaysAgoIso}&select=*`
    )

    if (permits.length === 0) return jsonResponse(summary)

    // Batch-fetch projects in one go.
    const projectIds = [...new Set(permits.map((p) => p.project_id))]
    const projectsRaw = await pgSelect<ProjectLite>(
      'projects',
      `id=in.(${projectIds.join(',')})&select=id,name`
    )
    const projectMap = new Map(projectsRaw.map((p) => [p.id, p]))

    // Cache GM recipients per tenant — they don't change row-to-row.
    const gmCache = new Map<string, Array<{ id: string; email: string }>>()

    for (const permit of permits) {
      summary.processed += 1
      try {
        const project = projectMap.get(permit.project_id)
        const projectName = project?.name ?? 'Unknown project'
        const daysStale = Math.floor(
          (nowMs - new Date(permit.last_status_change_at).getTime()) / (86400 * 1000)
        )

        // GM recipients (admin/owner role within tenant)
        let gms = gmCache.get(permit.tenant_id)
        if (!gms) {
          gms = await fetchUsersByRoles(permit.tenant_id, GM_ROLES)
          gmCache.set(permit.tenant_id, gms)
        }

        // PM recipients (role-based; projects table has no pm_id field today)
        const roleBasedPms = await fetchUsersByRoles(permit.tenant_id, PM_ROLES)
        const recipientMap = new Map<string, { id: string; email: string }>()
        for (const u of [...gms, ...roleBasedPms]) {
          recipientMap.set(u.id, u)
        }

        const { subject, html, text } = buildBody({
          projectName,
          permitType: permit.permit_type,
          status: permit.status,
          daysStale,
        })

        for (const recipient of recipientMap.values()) {
          await pgInsert('notifications', {
            tenant_id: permit.tenant_id,
            recipient_user_id: recipient.id,
            channel: 'in_app',
            subject,
            body: text,
            link_url: `/projects/${permit.project_id}/permits`,
            payload: {
              template_id: 'permit-staleness',
              permit_id: permit.id,
              days_stale: daysStale,
            },
          })
          await sendEmail({ to: recipient.email, subject, html, text })
        }

        summary.notified += 1
      } catch (err) {
        summary.errors.push({
          id: permit.id,
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
