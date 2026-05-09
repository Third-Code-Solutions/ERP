import type { Metadata } from 'next'
import { getUser } from '@buildops/auth'
import { db } from '@buildops/database'
import { tenants, users } from '@buildops/database/schema'
import { eq } from 'drizzle-orm'

export const metadata: Metadata = { title: 'Settings' }

export default async function SettingsPage() {
  const user = await getUser()
  if (!user) return null

  const [userRow] = await db
    .select({ tenant_id: users.tenant_id, email: users.email, role: users.role })
    .from(users)
    .where(eq(users.id, user.id))

  const tenant = userRow?.tenant_id
    ? await db
        .select()
        .from(tenants)
        .where(eq(tenants.id, userRow.tenant_id))
        .then((r) => r[0])
    : null

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Settings</h1>
        <p className="page-subtitle">Workspace preferences and account management</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', maxWidth: '860px' }}>
        {/* Workspace card */}
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
            Workspace
          </h2>
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
              { label: 'Email', value: user.email ?? '—' },
              { label: 'User ID', value: user.id.slice(0, 8) + '…' },
              { label: 'Role', value: userRow?.role ?? '—' },
              {
                label: 'Last sign-in',
                value: user.last_sign_in_at
                  ? new Date(user.last_sign_in_at).toLocaleString('en-PH', {
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
        </div>
      </div>

      {/* Phase 3+ roadmap notice */}
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
        Team management, billing, integrations, and notification preferences are coming in Phase 3.
      </div>
    </div>
  )
}
