import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { and, desc, eq } from 'drizzle-orm'
import { requireUserProfile, can } from '@buildops/auth'
import { db } from '@buildops/database'
import { materialItems } from '@buildops/database/schema'
import { MaterialItemForm } from '@/components/admin/material-item-form'

export const metadata: Metadata = { title: 'Material items' }

export default async function MaterialItemsPage() {
  const profile = await requireUserProfile()
  if (!can(profile.role, 'admin.rate_card')) {
    redirect('/admin?error=forbidden')
  }

  const rows = await db
    .select({
      id: materialItems.id,
      code: materialItems.code,
      description: materialItems.description,
      category: materialItems.category,
      unit: materialItems.unit,
      wastage_bps: materialItems.wastage_bps,
      is_active: materialItems.is_active,
      created_at: materialItems.created_at,
    })
    .from(materialItems)
    .where(eq(materialItems.tenant_id, profile.tenantId))
    .orderBy(desc(materialItems.created_at))
    .limit(500)

  return (
    <div>
      <div className="page-header">
        <div className="page-toolbar">
          <div>
            <p className="page-eyebrow">Admin</p>
            <h1 className="page-title">Material items</h1>
            <p className="page-subtitle">
              Tenant catalog feeding BOM auto-fill. {rows.length} item{rows.length === 1 ? '' : 's'}.
            </p>
          </div>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) 360px',
          gap: 24,
          alignItems: 'start',
        }}
      >
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Catalog</h2>
          </div>
          {rows.length === 0 ? (
            <div className="card-empty">
              No material items yet. Add one on the right to begin building BOMs.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Description</th>
                    <th>Category</th>
                    <th>Unit</th>
                    <th className="numeric">Wastage</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <strong style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5 }}>
                          {r.code}
                        </strong>
                      </td>
                      <td>{r.description}</td>
                      <td className="muted">{r.category ?? '—'}</td>
                      <td className="muted">{r.unit}</td>
                      <td className="numeric" style={{ fontFamily: 'var(--font-mono)' }}>
                        {(r.wastage_bps / 100).toFixed(2)}%
                      </td>
                      <td>
                        <span
                          className="stage-badge"
                          style={{
                            color: r.is_active ? '#10b981' : '#9ca3af',
                            background: (r.is_active ? '#10b981' : '#9ca3af') + '18',
                          }}
                        >
                          {r.is_active ? 'Active' : 'Inactive'}
                        </span>
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
            <h2 className="card-title">Add item</h2>
          </div>
          <div style={{ padding: 16 }}>
            <MaterialItemForm />
          </div>
        </div>
      </div>
    </div>
  )
}
