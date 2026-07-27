import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { and, asc, eq } from 'drizzle-orm'
import { requireUserProfile } from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import {
  accounts,
  opportunities,
  projects,
  siteInspectionPhotos,
  siteInspectionRfis,
  siteInspections,
  tenants,
  users,
} from '@third-code-erp/database/schema'
import {
  buildInspectionReportHtml,
  type InspectionPhotoInput,
  type InspectionRfiInput,
} from '@/lib/pdf/site-inspection-report'
import { PrintButton } from './print-button'

export const metadata: Metadata = { title: 'Site Inspection Report' }

// REFACTOR.md M2 US-007 #5 — Print-friendly server-rendered route.
//
// The HTML body is generated server-side by `buildInspectionReportHtml`,
// which fully escapes every user-supplied value. We deliver it to the
// browser inside a sandboxed <iframe srcDoc=...> for two reasons:
//
//   1. The builder returns a complete `<!doctype html>` document, so an
//      iframe (not an inline div) is the correct embedding primitive.
//   2. `sandbox="allow-same-origin allow-modals"` blocks any script
//      execution from the iframe, giving us defense-in-depth even though
//      the content is server-generated and escaped.
export default async function InspectionPrintPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const profile = await requireUserProfile()

  const [inspection] = await db
    .select({
      id: siteInspections.id,
      tenant_id: siteInspections.tenant_id,
      opportunity_id: siteInspections.opportunity_id,
      payload: siteInspections.payload,
      submitted_at: siteInspections.submitted_at,
      created_at: siteInspections.created_at,
      submitted_by: siteInspections.submitted_by,
    })
    .from(siteInspections)
    .where(
      and(
        eq(siteInspections.id, id),
        eq(siteInspections.tenant_id, profile.tenantId)
      )
    )
    .limit(1)

  if (!inspection) return notFound()

  // Joined context — project + account + tenant brand + inspector name.
  // Each query is small and tenant-scoped; running them in parallel keeps
  // the render under the (print) route's render budget.
  const [photosRows, rfisRows, oppRow, tenantRow, inspectorRow] = await Promise.all([
    db
      .select({
        id: siteInspectionPhotos.id,
        document_id: siteInspectionPhotos.document_id,
        caption: siteInspectionPhotos.caption,
      })
      .from(siteInspectionPhotos)
      .where(eq(siteInspectionPhotos.inspection_id, inspection.id))
      .orderBy(asc(siteInspectionPhotos.created_at)),
    db
      .select({
        id: siteInspectionRfis.id,
        description: siteInspectionRfis.description,
        priority: siteInspectionRfis.priority,
        resolved_at: siteInspectionRfis.resolved_at,
      })
      .from(siteInspectionRfis)
      .where(eq(siteInspectionRfis.inspection_id, inspection.id))
      .orderBy(asc(siteInspectionRfis.created_at)),
    db
      .select({
        project_id: opportunities.project_id,
        account_id: opportunities.account_id,
      })
      .from(opportunities)
      .where(eq(opportunities.id, inspection.opportunity_id))
      .limit(1),
    db
      .select({
        name: tenants.name,
        bir_tin: tenants.bir_tin,
        pcab_license: tenants.pcab_license,
      })
      .from(tenants)
      .where(eq(tenants.id, profile.tenantId))
      .limit(1),
    inspection.submitted_by
      ? db
          .select({ full_name: users.full_name, email: users.email })
          .from(users)
          .where(eq(users.id, inspection.submitted_by))
          .limit(1)
      : Promise.resolve([] as Array<{ full_name: string | null; email: string | null }>),
  ])

  const opp = oppRow[0]

  const [projectRow] = opp?.project_id
    ? await db
        .select({
          id: projects.id,
          name: projects.name,
          client: projects.client,
          location: projects.location,
        })
        .from(projects)
        .where(eq(projects.id, opp.project_id))
        .limit(1)
    : [null]

  const [accountRow] = opp?.account_id
    ? await db
        .select({
          id: accounts.id,
          name: accounts.name,
          billing_address: accounts.billing_address,
        })
        .from(accounts)
        .where(eq(accounts.id, opp.account_id))
        .limit(1)
    : [null]

  const tenant = tenantRow[0]
  const inspector = inspectorRow[0]

  const html = buildInspectionReportHtml({
    inspection: {
      id: inspection.id,
      opportunity_id: inspection.opportunity_id,
      payload: inspection.payload,
      submitted_at: inspection.submitted_at,
      created_at: inspection.created_at,
    },
    photos: photosRows as InspectionPhotoInput[],
    rfis: rfisRows as InspectionRfiInput[],
    project: projectRow ?? null,
    account: accountRow ?? null,
    brand: {
      tenant_name: tenant?.name ?? null,
      bir_tin: tenant?.bir_tin ?? null,
      pcab_license: tenant?.pcab_license ?? null,
      inspector_name: inspector?.full_name ?? inspector?.email ?? null,
    },
  })

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
          href={`/crm/opportunities/${inspection.opportunity_id}/proposal/inspection`}
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
        title="Site Inspection Report"
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
