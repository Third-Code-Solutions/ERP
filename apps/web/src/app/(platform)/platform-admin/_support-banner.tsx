import Link from 'next/link'
import { getPlatformOverview } from '@/lib/platform-admin-client'
import { endSupportContextAction } from './actions'
import { PlatformSubmitButton } from './_submit-button'

export async function PlatformSupportBanner() {
  const result = await getPlatformOverview()
  if (!result.ok) return <p role="alert" className="platform-flash is-error">Support context could not be verified. Refresh before a tenant operation.</p>
  const session = result.data.activeSupportSession
  if (!session) return <p className="platform-flash">To change an existing tenant or its users, <Link href="/platform-admin/tenants">enter support context on Tenants</Link> with a reason first. Tenant creation and read-only platform views do not require support context.</p>
  return <section className="card platform-support-banner" aria-label="Platform Support Mode">
    <div>
      <p className="page-eyebrow">Platform Support Mode</p>
      <h2>{session.tenantName}</h2>
      <p>{session.reason}</p>
      <span>Expires {new Date(session.expiresAt).toLocaleString()}. Actions retain your platform-owner identity; the tenant workspace is not impersonated.</span>
    </div>
    <div className="platform-row-actions">
      <Link href={`/platform-admin/tenants?q=${encodeURIComponent(session.tenantName)}`} className="button button-secondary">Selected tenant</Link>
      <form action={endSupportContextAction}>
        <input type="hidden" name="sessionId" value={session.id} />
        <PlatformSubmitButton className="button button-secondary">End context</PlatformSubmitButton>
      </form>
    </div>
  </section>
}
