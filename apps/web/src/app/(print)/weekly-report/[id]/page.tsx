import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { and, eq } from 'drizzle-orm'
import { requireUserProfile } from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import {
  accounts,
  projects,
  tenants,
  weeklyReports,
} from '@third-code-erp/database/schema'
import {
  buildWeeklyReportHtml,
  type WeeklyReportSnapshot,
} from '@/lib/reports/weekly-report-template'
import { PrintButton } from './print-button'

export const metadata: Metadata = { title: 'Weekly Report' }

// Print-friendly server-rendered weekly report.
//
// The HTML body is generated server-side by `buildWeeklyReportHtml`, which
// fully escapes every user-supplied value. We deliver it to the browser
// inside a sandboxed <iframe srcDoc=...> for two reasons:
//
//   1. The builder returns a complete `<!doctype html>` document, so an
//      iframe (not an inline div) is the correct embedding primitive.
//   2. `sandbox="allow-same-origin allow-modals"` blocks any script
//      execution from the iframe, giving us defense-in-depth even though
//      the content is server-generated and escaped.
export default async function WeeklyReportPrintPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const profile = await requireUserProfile()

  const [report] = await db
    .select({
      id: weeklyReports.id,
      tenant_id: weeklyReports.tenant_id,
      project_id: weeklyReports.project_id,
      week_ending: weeklyReports.week_ending,
      snapshot: weeklyReports.snapshot,
      generated_at: weeklyReports.generated_at,
    })
    .from(weeklyReports)
    .where(
      and(
        eq(weeklyReports.id, id),
        eq(weeklyReports.tenant_id, profile.tenantId)
      )
    )
    .limit(1)

  if (!report) return notFound()

  // Parallel small reads for the header — project, account, tenant brand.
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
      .where(eq(tenants.id, profile.tenantId))
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

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: '32px 16px',
        background: '#f3f4f6',
      }}
    >
      <div
        className="no-print"
        style={{
          position: 'fixed',
          top: '24px',
          right: '24px',
          display: 'flex',
          gap: '8px',
          zIndex: 50,
        }}
      >
        <Link
          href={`/projects/${report.project_id}/reports`}
          style={{
            padding: '8px 16px',
            borderRadius: '6px',
            fontSize: '0.875rem',
            fontWeight: 500,
            background: 'white',
            color: '#374151',
            border: '1px solid #d1d5db',
            textDecoration: 'none',
          }}
        >
          ← Back
        </Link>
        <PrintButton />
      </div>

      {/*
        The builder returns a complete <!doctype html> document; embed it
        via srcDoc on an iframe. `sandbox` removes script execution rights
        and `allow-same-origin` lets the iframe load /api/documents/* photo
        URLs while still being treated as same-origin for auth cookies.
      */}
      <iframe
        title="Weekly Report"
        srcDoc={html}
        style={{
          width: '210mm',
          minHeight: '297mm',
          border: 'none',
          background: 'white',
          boxShadow: '0 4px 32px rgba(0,0,0,0.12)',
        }}
        sandbox="allow-same-origin allow-modals"
      />
    </div>
  )
}
