// Auth-gated HTML endpoint for a single weekly report.
//
//   GET /api/weekly-report/<uuid>  → text/html (the rendered report body)
//
// Useful for sharing via signed link in the future, or for the print view
// to pull the body from a single source of truth. The HTML is re-rendered
// from the persisted `snapshot` JSONB so changes to the template apply to
// historical reports without needing a re-run.

import { NextRequest, NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { getUser } from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import {
  accounts,
  projects,
  tenants,
  users,
  weeklyReports,
} from '@third-code-erp/database/schema'
import {
  buildWeeklyReportHtml,
  type WeeklyReportSnapshot,
} from '@/lib/reports/weekly-report-template'

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id: reportId } = await ctx.params

  // Basic shape guard so a malformed path doesn't reach the DB.
  if (!/^[0-9a-fA-F-]{36}$/.test(reportId)) {
    return NextResponse.json({ error: 'Invalid report id' }, { status: 400 })
  }

  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [userRow] = await db
    .select({ tenant_id: users.tenant_id })
    .from(users)
    .where(eq(users.id, user.id))
  if (!userRow?.tenant_id) {
    return NextResponse.json(
      { error: 'No tenant associated with account' },
      { status: 403 }
    )
  }

  const [report] = await db
    .select({
      id: weeklyReports.id,
      project_id: weeklyReports.project_id,
      week_ending: weeklyReports.week_ending,
      snapshot: weeklyReports.snapshot,
      generated_at: weeklyReports.generated_at,
    })
    .from(weeklyReports)
    .where(
      and(
        eq(weeklyReports.id, reportId),
        eq(weeklyReports.tenant_id, userRow.tenant_id)
      )
    )
    .limit(1)

  if (!report) {
    return NextResponse.json({ error: 'Report not found' }, { status: 404 })
  }

  const [projectRow, tenantRow] = await Promise.all([
    db
      .select({
        id: projects.id,
        name: projects.name,
        client: projects.client,
        location: projects.location,
        account_id: projects.account_id,
      })
      .from(projects)
      .where(eq(projects.id, report.project_id))
      .limit(1),
    db
      .select({ name: tenants.name })
      .from(tenants)
      .where(eq(tenants.id, userRow.tenant_id))
      .limit(1),
  ])

  const project = projectRow[0] ?? null
  const tenant = tenantRow[0] ?? null

  const [accountRow] = project?.account_id
    ? await db
        .select({
          id: accounts.id,
          name: accounts.name,
          billing_address: accounts.billing_address,
        })
        .from(accounts)
        .where(eq(accounts.id, project.account_id))
        .limit(1)
    : [null]

  const html = buildWeeklyReportHtml(
    report.snapshot as WeeklyReportSnapshot,
    project
      ? {
          id: project.id,
          name: project.name,
          client: project.client,
          location: project.location,
        }
      : null,
    accountRow ?? null,
    {
      week_ending: report.week_ending,
      generated_at: report.generated_at,
      report_id: report.id,
      tenant_name: tenant?.name ?? null,
    }
  )

  return new NextResponse(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      // Don't cache — reports re-render from latest template + snapshot.
      'Cache-Control': 'private, no-store',
    },
  })
}
