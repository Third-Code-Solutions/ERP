import type { Metadata } from 'next'
import Link from 'next/link'
import { can, createSupabaseServerClient, requireUserProfile } from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import { tenants } from '@third-code-erp/database/schema'
import { eq } from 'drizzle-orm'
import { EditTenantForm } from '@/components/settings/edit-tenant-form'
import { getIntegrationStatus } from './integration-status'
import { readNotificationPreferences } from './notification-preferences'
import { NotificationPreferencesForm } from './notification-preferences-form'
import { companyDocumentIdentity, missingDocumentIdentityFields } from '@/lib/operations/company-document-identity'

export const metadata: Metadata = { title: 'Settings' }

export default async function SettingsPage({ searchParams }: {
  searchParams: Promise<{ notice?: string; error?: string }>
}) {
  const params = await searchParams
  const profile = await requireUserProfile()
  const canEditWorkspace = profile.role === 'owner' || profile.role === 'admin'
  const canReadTeam = can(profile.role, 'admin.users.read')
  const canManageTeam = can(profile.role, 'admin.users')
  const canReadFinance = can(profile.role, 'finance.read')
  const canManageCash = can(profile.role, 'finance.manage_cash')
  const canConfigureIntegrations = can(profile.role, 'admin.system_config')
  const integrations = canConfigureIntegrations ? getIntegrationStatus() : []
  let platformOwner = false
  if (profile.user.email) {
    try {
      const client = await createSupabaseServerClient()
      const decision = await client.rpc('is_platform_owner')
      platformOwner = !decision.error && decision.data === true
    } catch {
      // The platform destination fails closed when the authoritative assignment
      // check is unavailable; the platform route still enforces its own guard.
      platformOwner = false
    }
  }
  const tenant = await db
    .select()
    .from(tenants)
    .where(eq(tenants.id, profile.tenantId))
    .then((r) => r[0])
  const missingIdentity = tenant
    ? missingDocumentIdentityFields(companyDocumentIdentity({
        workspace_name: tenant.name,
        legal_name: tenant.legal_name,
        registered_address: tenant.registered_address,
        document_email: tenant.document_email,
        document_phone: tenant.document_phone,
        bir_tin: tenant.bir_tin,
        pcab_license: tenant.pcab_license,
      }))
    : ['workspace']

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Settings</h1>
        <p className="page-subtitle">Workspace preferences and account management</p>
      </div>

      {(params.notice || params.error) && (
        <p role={params.error ? 'alert' : 'status'} className={`platform-flash ${params.error ? 'is-error' : 'is-success'}`}>
          {params.error || params.notice}
        </p>
      )}

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
            background: 'var(--color-surface)',
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
            {tenant && canEditWorkspace && <EditTenantForm tenant={tenant} />}
          </div>
          {tenant ? (
            <dl style={{ margin: 0 }}>
              {[
                { label: 'Workspace Name', value: tenant.name },
                { label: 'Registered Legal Name', value: tenant.legal_name ?? '—' },
                { label: 'Registered Address', value: tenant.registered_address ?? '—' },
                { label: 'Document Email', value: tenant.document_email ?? '—' },
                { label: 'Document Phone', value: tenant.document_phone ?? '—' },
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
            background: 'var(--color-surface)',
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
              color: 'var(--color-navy-text)',
              fontSize: '0.875rem',
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            Open profile and password settings
          </Link>
        </div>
      </div>

      <section aria-labelledby="installation-readiness-heading" className="card mt-6 max-w-[860px]">
        <div className="card-header"><h2 id="installation-readiness-heading" className="card-title">Operator-led installation readiness</h2></div>
        <div className="space-y-4 p-6 text-sm">
          <p>This checklist supports a local handover. It does not represent hosted deployment, automated onboarding, BIR certification, or buyer acceptance.</p>
          <ul className="space-y-3">
            <li><strong>Administrator access:</strong> signed in as {profile.role}. Installation operator must verify the first administrator and recovery path.</li>
            <li><strong>Company document identity:</strong> {missingIdentity.length === 0 ? 'configured for document drafts.' : `incomplete — add ${missingIdentity.join(', ')} before issuing external documents.`}</li>
            <li><strong>Users and roles:</strong> installation operator must review team access before handover.</li>
            <li><strong>Finance and master data:</strong> customer must approve finance policy, opening balances, vendors, items, units, and warehouses.</li>
            <li><strong>Integrations and acceptance:</strong> verify provider credentials, worker connectivity, backups, and opening acceptance in the target installation.</li>
          </ul>
        </div>
      </section>

      <section aria-labelledby="settings-team-heading" className="card mt-6 max-w-[860px]">
        <div className="card-header">
          <h2 id="settings-team-heading" className="card-title">Team management</h2>
        </div>
        <div className="space-y-4 p-6">
          <p className="text-sm text-[var(--color-neutral-600)]">
            {canManageTeam
              ? 'Manage workspace users and their assigned roles. New accounts use an initial password that you share securely; email invitations are not enabled.'
              : canReadTeam
                ? 'Review workspace users and their assigned roles. Only owners and admins can change access.'
                : 'Ask a workspace owner or admin to manage users and access.'}
          </p>
          {canReadTeam && (
            <div className="flex flex-wrap gap-4">
              <Link href="/admin/users" className="text-sm font-semibold text-[var(--color-navy-700)] underline underline-offset-4">
                {canManageTeam ? 'Manage team' : 'View team'}
              </Link>
              {canManageTeam && (
                <Link href="/admin/users/new" className="text-sm font-semibold text-[var(--color-navy-700)] underline underline-offset-4">
                  Add team member
                </Link>
              )}
            </div>
          )}
          {platformOwner ? (
            <p className="mt-4 text-sm">
              <Link href="/platform-admin" className="font-semibold text-[var(--color-navy-700)] underline underline-offset-4">
                Open platform administration
              </Link>
              <span className="text-[var(--color-neutral-600)]"> — restricted platform-owner controls.</span>
            </p>
          ) : null}
        </div>
      </section>

      <section aria-labelledby="settings-finance-heading" className="card mt-6 max-w-[860px]">
        <div className="card-header"><h2 id="settings-finance-heading" className="card-title">Project invoices and payments</h2></div>
        <div className="space-y-4 p-6 text-sm">
          <p>Prepare project invoices, review outstanding receivables, and record payments against issued invoices. Recording a payment does not transfer money or charge a card.</p>
          {canReadFinance ? (
            <div className="flex flex-wrap gap-4 font-semibold text-[var(--color-navy-700)]">
              <Link href="/invoices" className="underline underline-offset-4">Project invoices</Link>
              <Link href="/finance/receivables" className="underline underline-offset-4">Outstanding receivables</Link>
              <Link href="/finance/cash" className="underline underline-offset-4">Payment records</Link>
              {canManageCash && <Link href="/finance/cash/new" className="underline underline-offset-4">Record a payment</Link>}
            </div>
          ) : <p>Ask your finance team or workspace administrator for invoice and payment access.</p>}
        </div>
      </section>

      <section aria-labelledby="settings-integrations-heading" className="card mt-6 max-w-[860px]">
        <div className="card-header"><h2 id="settings-integrations-heading" className="card-title">Integrations</h2></div>
        <div className="space-y-4 p-6 text-sm">
          <p>Existing provider configuration for this Web deployment. This is not a live connectivity test; Railway worker configuration must be checked separately. Credentials stay in deployment secrets, never in browser forms.</p>
          {canConfigureIntegrations ? (
            <ul className="space-y-4">
              {integrations.map((integration) => (
                <li key={integration.name} className="space-y-1 border-b pb-4 last:border-0">
                  <h3 className="font-semibold">{integration.name} — {integration.purpose}</h3>
                  <p>{integration.configured ? 'Configuration present' : 'Setup required'}</p>
                  {integration.missing.length > 0 && <p>Missing: {integration.missing.join(', ')}</p>}
                  <p className="text-[var(--color-neutral-600)]">{integration.guidance}</p>
                </li>
              ))}
            </ul>
          ) : <p>Only owners and admins can inspect deployment configuration. Contact your workspace administrator for integration setup.</p>}
        </div>
      </section>

      <section aria-labelledby="settings-notifications-heading" className="card mt-6 max-w-[860px]">
        <div className="card-header"><h2 id="settings-notifications-heading" className="card-title">Notifications</h2></div>
        <div className="p-6">
          <NotificationPreferencesForm initial={readNotificationPreferences(profile.user.user_metadata?.notification_preferences)} />
        </div>
      </section>
    </div>
  )
}
