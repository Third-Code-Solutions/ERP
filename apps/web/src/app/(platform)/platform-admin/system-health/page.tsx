import { getPlatformSystemHealth } from '@/lib/platform-admin-client'
import { PlatformPageHeader, PlatformUnavailable, StatusPill } from '../_components'

export default async function PlatformSystemHealthPage() {
  const result = await getPlatformSystemHealth()
  return <>
    <PlatformPageHeader title="System health" description="Direct API/database availability plus truthful dependency configuration. Uninstrumented provider telemetry remains labeled as such." />
    {!result.ok ? <PlatformUnavailable message={result.error} /> : <div className="platform-stack"><section className="platform-metric-grid"><article className="card platform-health-card"><span>Core API</span><StatusPill status={result.data.api} /></article><article className="card platform-health-card"><span>PostgreSQL</span><StatusPill status={result.data.database} /></article></section><section className="card"><div className="card-header"><div><h2 className="card-title">Dependencies</h2><p className="card-subtitle">Generated {new Date(result.data.generatedAt).toLocaleString()}</p></div></div><div className="platform-table-wrap"><table className="data-table"><thead><tr><th>Dependency</th><th>Status</th><th>Evidence</th></tr></thead><tbody>{result.data.dependencies.map((dependency) => <tr key={dependency.key}><td className="row-leader">{dependency.label}</td><td><StatusPill status={dependency.status} /></td><td>{dependency.detail}</td></tr>)}</tbody></table></div></section></div>}
  </>
}
