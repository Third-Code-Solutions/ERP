import type { Metadata } from 'next'
import Link from 'next/link'
import { createSupabaseServerClient, requireUserProfile } from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import { tenants } from '@third-code-erp/database/schema'
import { eq } from 'drizzle-orm'
import { EditTenantForm } from '@/components/settings/edit-tenant-form'

export const metadata: Metadata = { title: 'Settings' }

export default async function SettingsPage() {
  const profile = await requireUserProfile()
  const canManageWorkspace = profile.role === 'owner' || profile.role === 'admin'
  let platformOwner = false
  if (profile.user.email?.toLowerCase() === 'kurt@thirdcodesolutions.com') {
    try {
      const client = await createSupabaseServerClient()
      const decision = await client.rpc('is_platform_owner')
      platformOwner = !decision.error && decision.data === true
    } catch {
      // Navigation fails closed; Core and middleware authorize independently.
      platformOwner = false
    }
  }
  const tenant = await db
    .select()
    .from(tenants)
    .where(eq(tenants.id, profile.tenantId))
    .then((r) => r[0])

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Settings</h1>
        <p className="page-subtitle">Workspace preferences and account management</p>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))',
          gap: '24px',
          maxWidth: '860px',
        }}
      >
        {/* Workspace card */}
        <div
          style={{
            background: 'white',
            border: '1px solid var(--color-border)',
            borderRadius: '8px',
            padding: '24px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <h2
              style={{
                fontSize: '0.875rem',
                fontWeight: 600,
                color: 'var(--color-neutral-700)',
                margin: 0,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              Workspace
            </h2>
            {tenant && canManageWorkspace && <EditTenantForm tenant={tenant} />}
          </div>
          {tenant ? (
            <dl style={{ margin: 0 }}>
              {[
                { label: 'Name', value: tenant.name },
                { label: 'BIR TIN', value: tenant.bir_tin ?? '—' },
                { label: 'PCAB License', value: tenant.pcab_license ?? '—' },
                { label: 'DPO Contact', value: tenant.dpo_contact ?? '—' },
                {
                  label: 'Created',
                  value: new Date(tenant.created_at).toLocaleDateString('en-PH', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  }),
                },
              ].map(({ label, value }) => (
                <div key={label} style={{ marginBottom: '14px' }}>
                  <dt
                    style={{
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      color: 'var(--color-neutral-400)',
                      marginBottom: '3px',
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                    }}
                  >
                    {label}
                  </dt>
                  <dd style={{ fontSize: '0.875rem', color: 'var(--color-neutral-800)', margin: 0 }}>
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
          ) : (
            <p style={{ fontSize: '0.875rem', color: 'var(--color-neutral-400)' }}>
              No workspace configured.
            </p>
          )}
        </div>

        {/* Account card */}
        <div
          style={{
            background: 'white',
            border: '1px solid var(--color-border)',
            borderRadius: '8px',
            padding: '24px',
          }}
        >
          <h2
            style={{
              fontSize: '0.875rem',
              fontWeight: 600,
              color: 'var(--color-neutral-700)',
              margin: '0 0 16px 0',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}
          >
            Account
          </h2>
          <dl style={{ margin: 0 }}>
            {[
              { label: 'Email', value: profile.user.email ?? '—' },
              { label: 'User ID', value: profile.user.id.slice(0, 8) + '…' },
              { label: 'Role', value: profile.role },
              {
                label: 'Last sign-in',
                value: profile.user.last_sign_in_at
                  ? new Date(profile.user.last_sign_in_at).toLocaleString('en-PH', {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })
                  : '—',
              },
            ].map(({ label, value }) => (
              <div key={label} style={{ marginBottom: '14px' }}>
                <dt
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    color: 'var(--color-neutral-400)',
                    marginBottom: '3px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                  }}
                >
                  {label}
                </dt>
                <dd
                  style={{
                    fontSize: '0.875rem',
                    color: 'var(--color-neutral-800)',
                    margin: 0,
                    fontFamily: label === 'User ID' ? 'var(--font-mono)' : 'inherit',
                  }}
                >
                  {value}
                </dd>
              </div>
            ))}
          </dl>
          <Link
            href="/settings/profile"
            style={{
              display: 'inline-flex',
              marginTop: '4px',
              color: 'var(--color-navy-700)',
              fontSize: '0.875rem',
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            Open profile and password settings
          </Link>
        </div>
      </div>

      {/* Existing destinations, not roadmap promises. */}
      <div
        style={{
          marginTop: '24px',
          background: 'var(--color-navy-50)',
          border: '1px solid var(--color-navy-100)',
          borderRadius: '8px',
          padding: '16px 20px',
          fontSize: '0.8125rem',
          color: 'var(--color-navy-700)',
          maxWidth: '860px',
        }}
      >
        {canManageWorkspace ? <p><Link href="/admin/users">Manage workspace users and tenant roles</Link>.</p> : <p>Contact your workspace owner or administrator for company settings and user access changes.</p>}
        {platformOwner ? <p><Link href="/platform-admin">Open platform administration</Link> — separate, verified platform-owner access.</p> : null}
      </div>
    </div>
  )
}
