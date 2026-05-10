'use server'

import { revalidatePath } from 'next/cache'
import { getUser } from '@buildops/auth'
import { db } from '@buildops/database'
import { boms, invoices, users } from '@buildops/database/schema'
import { and, desc, eq, sql } from 'drizzle-orm'
import { writeAuditLog } from '@/lib/audit'
import {
  progressBillingAmount,
  computeRetention,
  computeVAT,
  computeEWT,
} from '@buildops/shared-types/bom'

const RETENTION_BPS = 1000 // 10% — Philippine construction standard

export async function createInvoice(
  projectId: string,
  formData: FormData
): Promise<{ error?: string; invoiceId?: string }> {
  const user = await getUser()
  if (!user) return { error: 'Unauthorized' }

  const [userRow] = await db
    .select({ tenant_id: users.tenant_id })
    .from(users)
    .where(eq(users.id, user.id))
  if (!userRow?.tenant_id) return { error: 'No tenant' }

  const billingPct = parseFloat(String(formData.get('billing_pct') ?? ''))
  if (isNaN(billingPct) || billingPct <= 0 || billingPct > 100) {
    return { error: 'Billing % must be between 1 and 100' }
  }

  // Pull contract value from latest BOM (any status; the latest is canonical)
  const [bom] = await db
    .select({ tcv_cents: boms.tcv_cents })
    .from(boms)
    .where(and(eq(boms.project_id, projectId), eq(boms.tenant_id, userRow.tenant_id)))
    .orderBy(desc(boms.version))
    .limit(1)

  const tcvCents = Number(bom?.tcv_cents ?? 0)

  // All math goes through the canonical helpers (32 unit tests in
  // @buildops/shared-types). This guarantees billing matches BOM totals
  // and Philippine BIR conventions exactly.
  const billingPctBps = Math.round(billingPct * 100)
  const subtotalCents = progressBillingAmount(tcvCents, billingPctBps)
  const retentionCents = computeRetention(subtotalCents, RETENTION_BPS)
  const baseForTax = subtotalCents - retentionCents
  const vatCents = computeVAT(baseForTax)
  const withholdingTaxCents = computeEWT(baseForTax)
  const netAmountCents = baseForTax + vatCents - withholdingTaxCents

  // BIR-compliant continuous invoice numbering: INV-YYYYMM-NNN per tenant
  const now = new Date()
  const prefix = `INV-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}-`
  const [lastInvoice] = await db
    .select({ invoice_number: invoices.invoice_number })
    .from(invoices)
    .where(
      and(
        eq(invoices.tenant_id, userRow.tenant_id),
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

  const dueDateStr = String(formData.get('due_date') ?? '').trim()
  const notes = String(formData.get('notes') ?? '').trim() || null

  const [inserted] = await db
    .insert(invoices)
    .values({
      tenant_id: userRow.tenant_id,
      project_id: projectId,
      created_by: user.id,
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

  if (!inserted) return { error: 'Failed to create invoice' }

  await writeAuditLog({
    tenantId: userRow.tenant_id,
    actorId: user.id,
    entityType: 'invoice',
    entityId: inserted.id,
    action: 'create',
    diff: {
      invoice_number: invoiceNumber,
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
