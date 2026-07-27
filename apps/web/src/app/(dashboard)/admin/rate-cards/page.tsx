import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { and, asc, desc, eq } from 'drizzle-orm'
import { requireUserProfile, can } from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import { rateCards, materialItems, vendors } from '@third-code-erp/database/schema'
import { RateCardForm } from '@/components/admin/rate-card-form'

export const metadata: Metadata = { title: 'Rate cards' }

function formatPHP(cents: number): string {
  return '₱' + (cents / 100).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default async function RateCardsPage() {
  const profile = await requireUserProfile()
  if (!can(profile.role, 'admin.rate_card')) {
    redirect('/admin?error=forbidden')
  }

  const rows = await db
    .select({
      id: rateCards.id,
      material_item_id: rateCards.material_item_id,
      vendor_id: rateCards.vendor_id,
      unit_price_cents: rateCards.unit_price_cents,
      lead_time_days: rateCards.lead_time_days,
      is_preferred: rateCards.is_preferred,
      effective_from: rateCards.effective_from,
      effective_to: rateCards.effective_to,
      created_at: rateCards.created_at,
      item_code: materialItems.code,
      item_description: materialItems.description,
      item_unit: materialItems.unit,
      vendor_name: vendors.name,
    })
    .from(rateCards)
    .leftJoin(materialItems, eq(rateCards.material_item_id, materialItems.id))
    .leftJoin(vendors, eq(rateCards.vendor_id, vendors.id))
    .where(eq(rateCards.tenant_id, profile.tenantId))
    .orderBy(desc(rateCards.is_preferred), desc(rateCards.effective_from))
    .limit(500)

  const itemOptions = await db
    .select({
      id: materialItems.id,
      code: materialItems.code,
      description: materialItems.description,
      unit: materialItems.unit,
    })
    .from(materialItems)
    .where(
      and(
        eq(materialItems.tenant_id, profile.tenantId),
        eq(materialItems.is_active, true)
      )
    )
    .orderBy(asc(materialItems.code))

  const vendorOptions = await db
    .select({ id: vendors.id, name: vendors.name })
    .from(vendors)
    .where(eq(vendors.tenant_id, profile.tenantId))
    .orderBy(asc(vendors.name))

  return (
    <div>
      <div className="page-header">
        <div className="page-toolbar">
          <div>
            <p className="page-eyebrow">Admin</p>
            <h1 className="page-title">Rate cards</h1>
            <p className="page-subtitle">
              Per-vendor unit pricing with lead times. {rows.length} card{rows.length === 1 ? '' : 's'}.
            </p>
          </div>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) 380px',
          gap: 24,
          alignItems: 'start',
        }}
      >
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Pricing catalog</h2>
          </div>
          {rows.length === 0 ? (
            <div className="card-empty">
              No rate cards yet. Create one on the right (you must have at least one material item).
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Vendor</th>
                    <th className="numeric">Unit price</th>
                    <th className="numeric">Lead time</th>
                    <th>Preferred</th>
                    <th>Effective from</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <strong style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                            {r.item_code ?? '—'}
                          </strong>
                          <span style={{ fontSize: 12, color: 'var(--color-neutral-500)' }}>
                            {r.item_description ?? '—'}
                          </span>
                        </div>
                      </td>
                      <td className="muted">{r.vendor_name ?? '— (generic)'}</td>
                      <td className="numeric" style={{ fontFamily: 'var(--font-mono)', fontWeight: 500 }}>
                        {formatPHP(r.unit_price_cents)}{' '}
                        <span style={{ color: 'var(--color-neutral-400)', fontWeight: 400 }}>
                          /{r.item_unit ?? '—'}
                        </span>
                      </td>
                      <td className="numeric" style={{ fontFamily: 'var(--font-mono)' }}>
                        {r.lead_time_days != null ? `${r.lead_time_days}d` : '—'}
                      </td>
                      <td>
                        {r.is_preferred ? (
                          <span
                            className="stage-badge"
                            style={{ color: '#E07B2A', background: '#E07B2A18' }}
                          >
                            ★ Preferred
                          </span>
                        ) : (
                          <span style={{ color: 'var(--color-neutral-400)', fontSize: 12 }}>—</span>
                        )}
                      </td>
                      <td className="muted">
                        {new Date(r.effective_from).toLocaleDateString('en-PH', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="card" style={{ position: 'sticky', top: 16 }}>
          <div className="card-header">
            <h2 className="card-title">Add rate</h2>
          </div>
          <div style={{ padding: 16 }}>
            {itemOptions.length === 0 ? (
              <p style={{ color: 'var(--color-neutral-500)', fontSize: 13 }}>
                Add a material item first.
              </p>
            ) : (
              <RateCardForm materialItems={itemOptions} vendors={vendorOptions} />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
