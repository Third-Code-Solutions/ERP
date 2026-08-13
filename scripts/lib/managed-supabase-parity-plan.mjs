const MIGRATION_PATTERN = /^(\d{14})_[a-z0-9_]+\.sql$/

function unique(values) {
  return new Set(values).size === values.length
}

export function validateManagedSupabaseParityPlan(plan, migrationFiles) {
  const errors = []
  const sourceFiles = [...migrationFiles].sort()
  const snapshot = plan?.snapshot ?? {}
  const batches = Array.isArray(plan?.batches) ? plan.batches : []

  if (plan?.version !== 1) errors.push('plan version must be 1')
  if (!/^[a-z]{20}$/.test(snapshot.projectRef ?? '')) {
    errors.push('snapshot projectRef must be a Supabase project reference')
  }
  if (!sourceFiles.every((file) => MIGRATION_PATTERN.test(file))) {
    errors.push('source migration filenames must use the repository format')
  }
  if (!unique(sourceFiles.map((file) => file.slice(0, 14)))) {
    errors.push('source migration timestamps must be unique')
  }
  if (snapshot.sourceCount !== sourceFiles.length) {
    errors.push('snapshot sourceCount does not match repository migrations')
  }

  const sourceHead = sourceFiles.at(-1)?.slice(0, 14) ?? null
  if (snapshot.sourceHead !== sourceHead) {
    errors.push('snapshot sourceHead does not match repository head')
  }

  const appliedHeadIndex = sourceFiles.findIndex((file) =>
    file.startsWith(`${snapshot.appliedHead}_`)
  )
  if (appliedHeadIndex < 0) {
    errors.push('snapshot appliedHead is absent from repository migrations')
  }
  if (snapshot.appliedCount !== appliedHeadIndex + 1) {
    errors.push('snapshot appliedCount does not match appliedHead position')
  }

  const batchIds = batches.map((batch) => batch.id)
  if (!unique(batchIds)) errors.push('batch ids must be unique')
  if (
    batches.some(
      (batch) =>
        !Array.isArray(batch.migrations) || batch.migrations.length === 0
    )
  ) {
    errors.push('every batch must contain at least one migration')
  }

  const plannedPending = batches.flatMap((batch) => batch.migrations ?? [])
  if (!unique(plannedPending)) errors.push('planned migrations must be unique')
  if (!plannedPending.every((file) => MIGRATION_PATTERN.test(file))) {
    errors.push('planned migration filenames must use the repository format')
  }
  if (
    plannedPending.some(
      (file, index) => index > 0 && plannedPending[index - 1] >= file
    )
  ) {
    errors.push('planned migrations must remain in strict source order')
  }

  const expectedPending =
    appliedHeadIndex < 0 ? [] : sourceFiles.slice(appliedHeadIndex + 1)
  if (snapshot.pendingCount !== expectedPending.length) {
    errors.push('snapshot pendingCount does not match repository suffix')
  }
  if (plannedPending.length !== expectedPending.length) {
    errors.push('planned migration count does not match repository suffix')
  }
  for (let index = 0; index < expectedPending.length; index += 1) {
    if (plannedPending[index] !== expectedPending[index]) {
      errors.push(
        `planned migration ${index + 1} must be ${expectedPending[index]}`
      )
      break
    }
  }

  if (snapshot.appliedCount + snapshot.pendingCount !== snapshot.sourceCount) {
    errors.push('applied plus pending counts must equal source count')
  }

  return {
    ok: errors.length === 0,
    errors,
    sourceCount: sourceFiles.length,
    appliedCount: snapshot.appliedCount,
    pendingCount: expectedPending.length,
    batchCount: batches.length,
    appliedHead: snapshot.appliedHead,
    sourceHead,
  }
}
