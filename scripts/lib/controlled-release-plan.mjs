/**
 * Pure release-gate aggregation for a controlled Third Code ERP release.
 *
 * This module never talks to a provider or database. It only turns the
 * read-only planner summaries into one explicit decision so a deployment
 * caller cannot accidentally treat a partial green check as release approval.
 */

function asNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0 ? value : 0
}

function componentStatus(value) {
  return value === 'clear' ? 'clear' : 'review_required'
}

export function buildControlledReleasePlan({
  database,
  duplicates,
  audit,
  providers,
}) {
  const blockers = []

  const databaseStatus =
    database?.status === 'current' &&
    Array.isArray(database?.blockers) &&
    database.blockers.length === 0
      ? 'clear'
      : 'review_required'
  if (databaseStatus !== 'clear') {
    blockers.push(
      ...(database?.blockers?.length
        ? database.blockers
        : ['database migration ledger is not current'])
    )
  }

  const duplicateStatus = componentStatus(duplicates?.status)
  if (duplicateStatus !== 'clear') {
    blockers.push(
      ...(duplicates?.blockers?.length
        ? duplicates.blockers
        : ['Purchase Order duplicate planner requires review'])
    )
  }

  const auditStatus = componentStatus(audit?.status)
  if (auditStatus !== 'clear') {
    blockers.push(
      ...(audit?.blockers?.length
        ? audit.blockers
        : ['audit recovery planner requires review'])
    )
  }

  const providerReports = providers && typeof providers === 'object' ? providers : {}
  for (const [name, provider] of Object.entries(providerReports)) {
    if (provider?.status !== 'clear') {
      blockers.push(
        ...(provider?.blockers?.length
          ? provider.blockers.map((blocker) => `${name}: ${blocker}`)
          : [`${name}: readiness check failed`])
      )
    }
  }

  const duplicateGroups = asNonNegativeInteger(duplicates?.groups)
  const duplicateRecords = asNonNegativeInteger(duplicates?.records)
  const auditRows = asNonNegativeInteger(audit?.rows)

  return {
    status: blockers.length === 0 ? 'clear' : 'review_required',
    blockers: [...new Set(blockers)],
    components: {
      database: {
        status: databaseStatus,
        appliedCount: asNonNegativeInteger(database?.appliedCount),
        migrationCount: asNonNegativeInteger(database?.migrationCount),
        missing: Array.isArray(database?.missing) ? database.missing : [],
      },
      duplicates: {
        status: duplicateStatus,
        groups: duplicateGroups,
        records: duplicateRecords,
      },
      audit: {
        status: auditStatus,
        rows: auditRows,
        linkMismatches: asNonNegativeInteger(audit?.linkMismatches),
        hashMismatches: asNonNegativeInteger(audit?.hashMismatches),
      },
      providers: Object.fromEntries(
        Object.entries(providerReports).map(([name, provider]) => [name, {
          status: componentStatus(provider?.status),
          httpStatus: provider?.httpStatus ?? null,
          url: provider?.url ?? null,
          revision: provider?.revision ?? null,
        }])
      ),
    },
  }
}

