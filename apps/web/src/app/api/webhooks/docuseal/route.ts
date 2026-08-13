import { NextRequest, NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { db } from '@third-code-erp/database'
import {
  bomPortalTokens,
  boms,
  documents,
  projects,
} from '@third-code-erp/database/schema'
import type { DocuSealWebhookPayload } from '@/lib/operations/integrations/docuseal'
import { notifyRoles } from '@/lib/operations/notifications'
import { writeAuditLog } from '@/lib/audit'

/**
 * DocuSeal webhook receiver (REFACTOR.md M3 / US-012).
 *
 * Always returns 200 (except secret mismatch) so DocuSeal doesn't retry —
 * any downstream failure is logged but doesn't surface to the sender.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const expectedSecret = process.env.DOCUSEAL_WEBHOOK_SECRET
  if (expectedSecret) {
    const provided = req.headers.get('x-docuseal-secret')
    if (provided !== expectedSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  let payload: DocuSealWebhookPayload
  try {
    payload = (await req.json()) as DocuSealWebhookPayload
  } catch {
    return NextResponse.json({ received: false, error: 'Invalid JSON' }, { status: 200 })
  }

  if (payload.event !== 'submission.completed') {
    // Acknowledge non-completion events but take no action.
    return NextResponse.json({ received: true, ignored: payload.event }, { status: 200 })
  }

  if (!payload.submission_id) {
    return NextResponse.json({ received: false, error: 'submission_id missing' }, { status: 200 })
  }

  try {
    const [tokenRow] = await db
      .select({
        id: bomPortalTokens.id,
        tenant_id: bomPortalTokens.tenant_id,
        bom_id: bomPortalTokens.bom_id,
        used_at: bomPortalTokens.used_at,
      })
      .from(bomPortalTokens)
      .where(eq(bomPortalTokens.docuseal_submission_id, payload.submission_id))
      .limit(1)

    if (!tokenRow) {
      return NextResponse.json(
        { received: true, note: 'no matching portal token' },
        { status: 200 }
      )
    }

    const now = new Date()

    // Idempotency — only mark used if not already used.
    if (!tokenRow.used_at) {
      await db
        .update(bomPortalTokens)
        .set({ used_at: now })
        .where(
          and(
            eq(bomPortalTokens.id, tokenRow.id),
            eq(bomPortalTokens.tenant_id, tokenRow.tenant_id)
          )
        )
    }

    // Find the parent project for document attachment.
    const [bomRow] = await db
      .select({
        id: boms.id,
        project_id: boms.project_id,
        tcv_cents: boms.tcv_cents,
        project_name: projects.name,
      })
      .from(boms)
      .leftJoin(
        projects,
        and(
          eq(boms.project_id, projects.id),
          eq(projects.tenant_id, tokenRow.tenant_id)
        )
      )
      .where(
        and(
          eq(boms.id, tokenRow.bom_id),
          eq(boms.tenant_id, tokenRow.tenant_id)
        )
      )
      .limit(1)

    if (bomRow) {
      // Save signed PDF if present.
      const signedDoc = payload.documents?.[0]
      if (signedDoc?.url) {
        await db.insert(documents).values({
          tenant_id: tokenRow.tenant_id,
          project_id: bomRow.project_id,
          document_type: 'contract',
          file_name: signedDoc.name ?? `bom-${tokenRow.bom_id}-signed.pdf`,
          storage_path: signedDoc.url,
          mime_type: 'application/pdf',
          size_bytes: 0,
          description: `DocuSeal-signed BOM (submission ${payload.submission_id})`,
        })
      }

      // Lock the BOM.
      await db
        .update(boms)
        .set({ status: 'locked', locked_at: now, updated_at: now })
        .where(
          and(
            eq(boms.id, tokenRow.bom_id),
            eq(boms.tenant_id, tokenRow.tenant_id)
          )
        )

      const tcvPhp = (bomRow.tcv_cents / 100).toLocaleString('en-PH', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })

      await notifyRoles({
        tenantId: tokenRow.tenant_id,
        recipientRoles: ['sales', 'commercial', 'admin', 'owner'],
        subject: `Client signed BOM — ${bomRow.project_name ?? 'project'}`,
        body: `DocuSeal recorded signature for the BOM. TCV: ₱${tcvPhp}.`,
        linkUrl: `/projects/${bomRow.project_id}/bom`,
        alsoEmail: true,
        templateId: 'bom-signed',
        templateVars: {
          project_name: bomRow.project_name ?? 'your project',
          tcv_php: tcvPhp,
          project_url: `/projects/${bomRow.project_id}`,
        },
      })

      await writeAuditLog({
        tenantId: tokenRow.tenant_id,
        actorId: tokenRow.bom_id,
        entityType: 'bom',
        entityId: tokenRow.bom_id,
        action: 'lock',
        diff: {
          source: 'docuseal_webhook',
          submission_id: payload.submission_id,
          signed_document_url: signedDoc?.url ?? null,
        },
      })
    }
  } catch (err) {
    // Best-effort logging; webhook still acks 200 to prevent retry storms.
    // eslint-disable-next-line no-console
    console.error('[webhook:docuseal] handler error:', err)
  }

  return NextResponse.json({ received: true }, { status: 200 })
}
