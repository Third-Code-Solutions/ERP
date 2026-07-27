// REFACTOR.md M2 US-007 #5 — Renders the Site Inspection Report as a
// standalone HTML document. Useful for:
//
//   1. Letting the browser print the report directly (Content-Type:
//      text/html with @page CSS converts cleanly via "Save as PDF").
//   2. Serving as a fallback when the archived copy in Storage is not yet
//      available (e.g. the upload-to-Storage step failed but the inspection
//      itself was persisted).
//
// Auth + tenant scoping happen here so the underlying inspection record
// can stay private. Mirrors the auth pattern in
// apps/web/src/app/api/documents/[id]/route.ts.

import { NextRequest, NextResponse } from 'next/server'
import { and, asc, eq } from 'drizzle-orm'
import { getUser } from '@third-code-erp/auth'
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

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params

  // Basic shape guard so a malformed path doesn't reach the DB.
  if (!/^[0-9a-fA-F-]{36}$/.test(id)) {
    return NextResponse.json({ error: 'Invalid inspection id' }, { status: 400 })
  }

  const user = await getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

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

  const [inspection] = await db
    .select({
      id: siteInspections.id,
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
        eq(siteInspections.tenant_id, userRow.tenant_id)
      )
    )
    .limit(1)

  if (!inspection) {
    return NextResponse.json({ error: 'Inspection not found' }, { status: 404 })
  }

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
      .where(eq(tenants.id, userRow.tenant_id))
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

  return new NextResponse(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      // The report changes only on inspection mutation; keep the response
      // short-lived in the browser so revisions show up quickly. No CDN
      // caching since this is auth-scoped per tenant.
      'Cache-Control': 'private, max-age=30, must-revalidate',
    },
  })
}
