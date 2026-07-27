import type { Metadata } from 'next'
import Link from 'next/link'
import { getUser } from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import { purchaseOrders, vendors, users } from '@third-code-erp/database/schema'
import { eq, desc } from 'drizzle-orm'
import { AddVendorForm } from '@/components/procurement/add-vendor-form'

export const metadata: Metadata = { title: 'Procurement' }

function formatPHP(cents: number): string {
  return '₱' + (cents / 100).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default async function ProcurementPage() {
  const user = await getUser()
  if (!user) return null

  const [userRow] = await db
    .select({ tenant_id: users.tenant_id })
    .from(users)
    .where(eq(users.id, user.id))

  if (!userRow?.tenant_id) return null

  const vendorList = await db
    .select({
      id: vendors.id,
      name: vendors.name,
      contact_name: vendors.contact_name,
      email: vendors.email,
      phone: vendors.phone,
      bir_tin: vendors.bir_tin,
      created_at: vendors.created_at,
    })
    .from(vendors)
    .where(eq(vendors.tenant_id, userRow.tenant_id))
    .orderBy(vendors.name)

  const recentPOs = await db
    .select({
      id: purchaseOrders.id,
      po_number: purchaseOrders.po_number,
      status: purchaseOrders.status,
      total_cents: purchaseOrders.total_cents,
      created_at: purchaseOrders.created_at,
      vendor_name: vendors.name,
    })
    .from(purchaseOrders)
    .leftJoin(vendors, eq(purchaseOrders.vendor_id, vendors.id))
    .where(eq(purchaseOrders.tenant_id, userRow.tenant_id))
    .orderBy(desc(purchaseOrders.created_at))
    .limit(5)

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Procurement</h1>
        <p className="page-subtitle">Vendor directory and purchase order management</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', maxWidth: '1100px' }}>
        {/* Vendor directory */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <h2 style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-neutral-700)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Vendors ({vendorList.length})
            </h2>
            <AddVendorForm />
          </div>

          {vendorList.length === 0 ? (
            <div
              style={{
                background: 'white',
                border: '1px solid var(--color-border)',
                borderRadius: '8px',
                padding: '40px 24px',
                textAlign: 'center',
                color: 'var(--color-neutral-400)',
                fontSize: '0.875rem',
              }}
            >
              No vendors registered yet.
            </div>
          ) : (
            <div style={{ background: 'white', border: '1px solid var(--color-border)', borderRadius: '8px', overflow: 'hidden' }}>
              {vendorList.map((vendor, i) => (
                <div
                  key={vendor.id}
                  style={{
                    padding: '14px 20px',
                    borderBottom: i < vendorList.length - 1 ? '1px solid var(--color-border)' : undefined,
                  }}
                >
                  <div style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--color-neutral-900)', marginBottom: '2px' }}>
                    {vendor.name}
                  </div>
                  <div style={{ fontSize: '0.8125rem', color: 'var(--color-neutral-500)', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                    {vendor.contact_name && <span>{vendor.contact_name}</span>}
                    {vendor.email && <span>{vendor.email}</span>}
                    {vendor.phone && <span>{vendor.phone}</span>}
                    {vendor.bir_tin && (
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>TIN: {vendor.bir_tin}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent POs */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <h2 style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-neutral-700)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Recent Purchase Orders
            </h2>
            <Link href="/purchase-orders" style={{ fontSize: '0.8125rem', color: 'var(--color-navy-700)' }}>
              View all →
            </Link>
          </div>

          {recentPOs.length === 0 ? (
            <div
              style={{
                background: 'white',
                border: '1px solid var(--color-border)',
                borderRadius: '8px',
                padding: '40px 24px',
                textAlign: 'center',
                color: 'var(--color-neutral-400)',
                fontSize: '0.875rem',
              }}
            >
              No purchase orders yet.
            </div>
          ) : (
            <div style={{ background: 'white', border: '1px solid var(--color-border)', borderRadius: '8px', overflow: 'hidden' }}>
              {recentPOs.map((po, i) => (
                <div
                  key={po.id}
                  style={{
                    padding: '14px 20px',
                    borderBottom: i < recentPOs.length - 1 ? '1px solid var(--color-border)' : undefined,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.8rem', fontFamily: 'var(--font-mono)', color: 'var(--color-navy-700)' }}>
                      {po.po_number}
                    </div>
                    <div style={{ fontSize: '0.8125rem', color: 'var(--color-neutral-500)', marginTop: '2px' }}>
                      {po.vendor_name ?? 'No vendor'} · {po.status}
                    </div>
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-neutral-800)' }}>
                    {formatPHP(po.total_cents)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

    </div>
  )
}
