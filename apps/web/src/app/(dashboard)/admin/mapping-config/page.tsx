import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { and, asc, eq } from 'drizzle-orm'
import { requireUserProfile, can } from '@buildops/auth'
import { db } from '@buildops/database'
import { mappingConfig, materialItems } from '@buildops/database/schema'
import { MappingConfigForm } from '@/components/admin/mapping-config-form'

export const metadata: Metadata = { title: 'Togal mapping config' }

export default async function MappingConfigPage() {
  const profile = await requireUserProfile()
  if (!can(profile.role, 'admin.system_config')) {
    redirect('/admin?error=forbidden')
  }

  const rows = await db
    .select({
      id: mappingConfig.id,
      source_label: mappingConfig.source_label,
      material_item_id: mappingConfig.material_item_id,
      notes: mappingConfig.notes,
      created_at: mappingConfig.created_at,
      item_code: materialItems.code,
      item_description: materialItems.description,
      item_unit: materialItems.unit,
    })
    .from(mappingConfig)
    .leftJoin(materialItems, eq(mappingConfig.material_item_id, materialItems.id))
    .where(eq(mappingConfig.tenant_id, profile.tenantId))
    .orderBy(asc(mappingConfig.source_label))
    .limit(1000)

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

  return (
    <div>
      <div className="page-header">
        <div className="page-toolbar">
          <div>
            <p className="page-eyebrow">Admin</p>
            <h1 className="page-title">Togal mapping config</h1>
            <p className="page-subtitle">
              Maps Togal source labels to your material catalog so imports auto-generate BOM lines.
              {' '}
              {rows.length} mapping{rows.length === 1 ? '' : 's'}.
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
            <h2 className="card-title">Mappings</h2>
          </div>
          {rows.length === 0 ? (
            <div className="card-empty">
              No mappings yet. Each entry connects a Togal label (e.g. “Wall — Drywall”) to a material item.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Source label</th>
                    <th>Material item</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <code style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5 }}>
                          {r.source_label}
                        </code>
                      </td>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <strong style={{ fontSize: 13 }}>
                            {r.item_code ?? '—'}
                          </strong>
                          <span style={{ fontSize: 12, color: 'var(--color-neutral-500)' }}>
                            {r.item_description ?? '—'}{r.item_unit ? ` · ${r.item_unit}` : ''}
                          </span>
                        </div>
                      </td>
                      <td className="muted" style={{ maxWidth: 300 }}>
                        {r.notes ?? '—'}
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
            <h2 className="card-title">Add mapping</h2>
          </div>
          <div style={{ padding: 16 }}>
            {itemOptions.length === 0 ? (
              <p style={{ color: 'var(--color-neutral-500)', fontSize: 13 }}>
                Add a material item first.
              </p>
            ) : (
              <MappingConfigForm materialItems={itemOptions} />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
