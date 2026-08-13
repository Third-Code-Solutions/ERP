export function summarizeProviderSource({
  migrations,
  appliedVersions,
  duplicatePurchaseOrderGroups = [],
}) {
  const repositoryVersions = migrations.map((migration) => migration.version)
  const appliedSet = new Set(appliedVersions)
  const missing = migrations.filter((migration) => !appliedSet.has(migration.version))
  const firstMissing = missing[0] ?? null
  const riskCounts = new Map()

  for (const migration of missing) {
    for (const risk of migration.sqlRisk) {
      riskCounts.set(risk, (riskCounts.get(risk) ?? 0) + 1)
    }
  }

  return {
    sourceCount: migrations.length,
    sourceHead: repositoryVersions.at(-1) ?? null,
    appliedCount: appliedVersions.length,
    appliedHead: appliedVersions.at(-1) ?? null,
    pendingCount: missing.length,
    pending: missing,
    firstPending: firstMissing?.filename ?? null,
    riskCounts: Object.fromEntries(
      [...riskCounts.entries()].sort(([left], [right]) =>
        left.localeCompare(right)
      )
    ),
    duplicatePurchaseOrderGroups,
    ready:
      missing.length === 0 && duplicatePurchaseOrderGroups.length === 0,
  }
}
