import { getPlatformIntegrations } from '@/lib/platform-admin-client'
import { PlatformPageHeader, PlatformUnavailable, StatusPill } from '../_components'

export default async function PlatformIntegrationsPage() {
  const result = await getPlatformIntegrations()
  return <>
    <PlatformPageHeader title="Integrations" description="Configuration presence is shown without exposing credentials. Configured does not imply a live provider health check." />
    {!result.ok ? <PlatformUnavailable message={result.error} /> : <section className="platform-integration-grid">{result.data.map((integration) => <article className="card platform-integration-card" key={integration.key}><div><h2>{integration.label}</h2><StatusPill status={integration.status} /></div><p>{integration.detail}</p></article>)}</section>}
  </>
}
