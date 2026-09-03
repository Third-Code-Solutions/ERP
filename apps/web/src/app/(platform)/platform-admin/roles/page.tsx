import { getPlatformRoles } from '@/lib/platform-admin-client'
import { EmptyPlatformState, PlatformPageHeader, PlatformUnavailable } from '../_components'

export default async function PlatformRolesPage() {
  const result = await getPlatformRoles()
  return <>
    <PlatformPageHeader title="Roles" description="Tenant role capabilities are visible here for governance. None grants platform access." />
    {!result.ok ? <PlatformUnavailable message={result.error} /> : result.data.length === 0 ? <EmptyPlatformState>No tenant roles are configured.</EmptyPlatformState> : <section className="platform-role-grid">{result.data.map((role) => <article className="card platform-role-card" key={role.role}><div><h2>{role.role.replaceAll('_', ' ')}</h2><span>Platform access: denied</span></div><p>{role.capabilities.length} tenant-scoped capabilities</p><ul>{role.capabilities.map((capability) => <li key={capability}>{capability}</li>)}</ul></article>)}</section>}
  </>
}
