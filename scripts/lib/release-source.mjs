export function compareReleaseSource({
  workingTreeEntries,
  head,
  originMain,
  localMigrations,
  originMigrations,
}) {
  const blockers = []
  const localSet = new Set(localMigrations)
  const originSet = new Set(originMigrations)
  const localOnlyMigrations = localMigrations.filter(
    (filename) => !originSet.has(filename)
  )
  const originOnlyMigrations = originMigrations.filter(
    (filename) => !localSet.has(filename)
  )

  if (workingTreeEntries.length > 0) {
    blockers.push('working tree contains uncommitted changes')
  }
  if (head && originMain && head !== originMain) {
    blockers.push('HEAD does not equal provider-linked origin/main')
  }
  if (!head) blockers.push('HEAD could not be identified')
  if (!originMain) blockers.push('provider-linked origin/main is unavailable')
  if (localOnlyMigrations.length > 0 || originOnlyMigrations.length > 0) {
    blockers.push('local and provider-linked migration sets differ')
  }

  return {
    passed: blockers.length === 0,
    blockers,
    workingTree: {
      clean: workingTreeEntries.length === 0,
      changedEntryCount: workingTreeEntries.length,
    },
    commits: {
      head: head || null,
      originMain: originMain || null,
      exactMatch: Boolean(head && originMain && head === originMain),
    },
    migrations: {
      localCount: localMigrations.length,
      originCount: originMigrations.length,
      localOnly: localOnlyMigrations,
      originOnly: originOnlyMigrations,
      exactMatch:
        localOnlyMigrations.length === 0 && originOnlyMigrations.length === 0,
    },
  }
}
