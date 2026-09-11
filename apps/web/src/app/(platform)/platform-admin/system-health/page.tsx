import { getPlatformSystemHealth } from '@/lib/platform-admin-client'
import { PlatformPageHeader, PlatformUnavailable, StatusPill } from '../_components'

export default async function PlatformSystemHealthPage() {
  const result = await getPlatformSystemHealth()
  return <>
    <PlatformPageHeader title="System health" description="Direct API/database availability plus truthful dependency configuration. Uninstrumented provider telemetry remains labeled as such." />
  {!result.ok ? <PlatformUnavailable message={result.error} /> : <div className="platform-stack"><section className="platform-metric-grid" aria-label="Core service health"><article className="card platform-health-card"><span>Core API</span><StatusPill status={result.data.api} /></article><article className="card platform-health-card"><span>PostgreSQL</span><StatusPill status={result.data.database} /></article></section><section className="card"><div className="card-header"><div><h2 className="card-title">Dependencies</h2><p className="card-subtitle">Generated {new Date(result.data.generatedAt).toLocaleString()}</p></div></div><div className="platform-table-wrap" tabIndex={0}><table className="data-table"><caption className="sr-only">Configured platform dependencies and evidence</caption><thead><tr><th scope="col">Dependency</th><th scope="col">Status</th><th scope="col">Evidence</th></tr></thead><tbody>{result.data.dependencies.map((dependency) => <tr key={dependency.key}><td className="row-leader">{dependency.label}</td><td><StatusPill status={dependency.status} /></td><td>{dependency.detail}</td></tr>)}</tbody></table></div></section></div>}
  </>
}
