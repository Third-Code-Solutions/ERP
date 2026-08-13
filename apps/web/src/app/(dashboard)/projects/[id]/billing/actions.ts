'use server'

import { revalidatePath } from 'next/cache'
import { getUserProfile, requireCapability } from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import { boms, invoices, projects } from '@third-code-erp/database/schema'
import { and, desc, eq, sql } from 'drizzle-orm'
import { writeAuditLog } from '@/lib/audit'
import {
  progressBillingAmount,
  computeRetention,
  computeVAT,
  computeEWT,
} from '@third-code-erp/shared-types/bom'

const RETENTION_BPS = 1000 // 10% — Philippine construction standard

export async function createInvoice(
  projectId: string,
  formData: FormData
): Promise<{ error?: string; invoiceId?: string }> {
  const profile = await getUserProfile()
  if (!profile) return { error: 'Unauthorized' }
  if (!profile.tenantId) return { error: 'No tenant' }

  try {
    requireCapability(profile, 'finance.issue_invoice')
  } catch (err: unknown) {
    return { error: 'You do not have permission to create invoices.' }
  }

  const [project] = await db
    .select({ id: projects.id, account_id: projects.account_id })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.tenant_id, profile.tenantId)))
    .limit(1)
  if (!project) return { error: 'Project not found' }

  const billingPct = parseFloat(String(formData.get('billing_pct') ?? ''))
  if (isNaN(billingPct) || billingPct <= 0 || billingPct > 100) {
    return { error: 'Billing % must be between 1 and 100' }
  }

  // Pull contract value from latest BOM (any status; the latest is canonical)
  const [bom] = await db
    .select({ tcv_cents: boms.tcv_cents })
    .from(boms)
    .where(and(eq(boms.project_id, projectId), eq(boms.tenant_id, profile.tenantId)))
    .orderBy(desc(boms.version))
    .limit(1)

  const tcvCents = Number(bom?.tcv_cents ?? 0)

  // All math goes through the canonical helpers (32 unit tests in
  // @third-code-erp/shared-types). This guarantees billing matches BOM totals
  // and Philippine BIR conventions exactly.
  const billingPctBps = Math.round(billingPct * 100)
  const subtotalCents = progressBillingAmount(tcvCents, billingPctBps)
  const retentionCents = computeRetention(subtotalCents, RETENTION_BPS)
  const baseForTax = subtotalCents - retentionCents
  const vatCents = computeVAT(baseForTax)
  const withholdingTaxCents = computeEWT(baseForTax)
  const netAmountCents = baseForTax + vatCents - withholdingTaxCents

  // BIR-compliant continuous invoice numbering: INV-YYYYMM-NNN per tenant.
  //
  // The transaction-scoped PostgreSQL advisory lock serializes allocation for
  // one tenant/month. The read and insert therefore form one atomic unit; a
  // rollback releases the lock without consuming a number. The database-level
  // unique constraint remains a final integrity guard.
  const now = new Date()
  const prefix = `INV-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}-`
  const dueDateStr = String(formData.get('due_date') ?? '').trim()
  const notes = String(formData.get('notes') ?? '').trim() || null
  const allocationLockKey = `invoice-number:${profile.tenantId}:${prefix}`

  const inserted = await db.transaction(
    async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${allocationLockKey}))`
      )

      const [lastInvoice] = await tx
        .select({ invoice_number: invoices.invoice_number })
        .from(invoices)
        .where(
          and(
            eq(invoices.tenant_id, profile.tenantId),
            sql`${invoices.invoice_number} LIKE ${prefix + '%'}`
          )
        )
        .orderBy(desc(invoices.invoice_number))
        .limit(1)

      let seq = 1
      if (lastInvoice?.invoice_number) {
        const parts = lastInvoice.invoice_number.split('-')
        const last = parseInt(parts[parts.length - 1] ?? '0', 10)
        seq = isNaN(last) ? 1 : last + 1
      }
      const invoiceNumber = `${prefix}${String(seq).padStart(3, '0')}`

      const [created] = await tx
        .insert(invoices)
        .values({
          tenant_id: profile.tenantId,
          project_id: projectId,
          account_id: project.account_id,
          created_by: profile.user.id,
          invoice_number: invoiceNumber,
          status: 'draft',
          billing_percent_bps: billingPctBps,
          retention_bps: RETENTION_BPS,
          subtotal_cents: subtotalCents,
          retention_cents: retentionCents,
          vat_cents: vatCents,
          withholding_tax_cents: withholdingTaxCents,
          net_amount_cents: netAmountCents,
          due_date: dueDateStr ? new Date(dueDateStr) : null,
          notes,
        })
        .returning({ id: invoices.id })

      if (!created) throw new Error('Failed to create invoice')
      return { id: created.id, invoiceNumber }
    },
    {
      isolationLevel: 'read committed',
      accessMode: 'read write',
    }
  )

  await writeAuditLog({
    tenantId: profile.tenantId,
    actorId: profile.user.id,
    entityType: 'invoice',
    entityId: inserted.id,
    action: 'create',
    diff: {
      invoice_number: inserted.invoiceNumber,
      billing_percent_bps: billingPctBps,
      subtotal_cents: subtotalCents,
      retention_cents: retentionCents,
      vat_cents: vatCents,
      withholding_tax_cents: withholdingTaxCents,
      net_amount_cents: netAmountCents,
    },
  })

  revalidatePath(`/projects/${projectId}/billing`)
  revalidatePath('/invoices')

  return { invoiceId: inserted.id }
}
