#!/usr/bin/env node

/**
 * Static authority guard for Next.js API routes.
 *
 * The Web app may still expose legacy routes while ERP transactions migrate
 * into Nest, but every direct database write must be explicit, tenant-scoped,
 * and assigned a migration owner. This verifier is read-only: it inventories
 * direct Drizzle access and fails when a new route bypasses the reviewed
 * allowlist.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(fileURLToPath(new URL('.', import.meta.url)), '..')
const API_ROOT = 'apps/web/src/app/api'

const DIRECT_ACCESS_PATTERN = /\b(?:db|tx)\s*\.\s*(insert|update|delete|transaction|execute)\b/g
const WRITE_OPERATIONS = new Set(['insert', 'update', 'delete', 'transaction'])

// Explicit legacy surface. Each entry is temporary migration debt, not a
// permission to add more writes. New business writes must be added to Nest
// first, then the corresponding Web route should be removed from this list.
export const WEB_API_DATABASE_ALLOWLIST = Object.freeze({
  'apps/web/src/app/api/bom/takeoff-import/route.ts': Object.freeze({
    operations: Object.freeze(['insert', 'transaction', 'update']),
    migration: 'WO-08 -> Nest generic takeoff-import authority',
    reason: 'Tenant-scoped BOM import commit with additive upsert, unresolved-row retention, and an audit entry.',
  }),
  'apps/web/src/app/api/crm/opportunities/[id]/inspection-photos/route.ts': Object.freeze({
    operations: Object.freeze(['insert', 'transaction']),
    migration: 'WO-12 -> Nest site-inspection intake authority',
    reason: 'Capability-gated, tenant-scoped field photo metadata transaction with storage cleanup and audit entry.',
  }),
  'apps/web/src/app/api/notifications/route.ts': Object.freeze({
    operations: Object.freeze(['update']),
    migration: 'M3.198 → Nest notification read-state authority',
    reason: 'Self-user, tenant-scoped read-state update; no ERP posting authority.',
  }),
  'apps/web/src/app/api/upload/complete/route.ts': Object.freeze({
    operations: Object.freeze(['insert', 'transaction']),
    migration: 'M3.198 → Nest document intake authority',
    reason: 'Records a tenant/project-scoped document before optional AI/CAD processing.',
  }),
  'apps/web/src/app/api/webhooks/docuseal/route.ts': Object.freeze({
    operations: Object.freeze(['insert', 'update']),
    migration: 'M3.198 → Nest signature webhook authority',
    reason: 'Secret-gated external callback; idempotent token use, document attach, and BOM lock remain legacy.',
  }),
})

// Health and read-only similarity retrieval use db.execute with SELECT-only
// statements. Keep them visible in the report without treating them as writes.
export const WEB_API_READONLY_ALLOWLIST = Object.freeze({
  'apps/web/src/app/api/ai/similar-items/route.ts': Object.freeze({
    operations: Object.freeze(['execute']),
    reason: 'Tenant-filtered read-only vector similarity query.',
  }),
  'apps/web/src/app/api/ready/route.ts': Object.freeze({
    operations: Object.freeze(['execute']),
    reason: 'SELECT 1 readiness probe only.',
  }),
})

function collectRuntimeFiles(root) {
  const files = []
  const absoluteRoot = resolve(root, API_ROOT)

  function visit(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        visit(resolve(directory, entry.name))
        continue
      }
      if (!entry.name.endsWith('.ts') || entry.name.endsWith('.test.ts')) continue

      const absolutePath = resolve(directory, entry.name)
      const relativePath = absolutePath
        .slice(root.length + 1)
        .replaceAll('\\', '/')
      files.push({ path: relativePath, source: readFileSync(absolutePath, 'utf8') })
    }
  }

  visit(absoluteRoot)
  return files.sort((a, b) => a.path.localeCompare(b.path))
}

function findAccesses(source) {
  const accesses = []
  for (const match of source.matchAll(DIRECT_ACCESS_PATTERN)) {
    const operation = match[1]
    const line = source.slice(0, match.index).split('\n').length
    accesses.push({ operation, line })
  }
  return accesses
}

function normalizeAllowlist(allowlist) {
  return Object.fromEntries(
    Object.entries(allowlist ?? {}).map(([path, entry]) => [
      path,
      new Set(entry.operations),
    ])
  )
}

/**
 * Pure report builder. `files` is injectable so the policy can be tested
 * without touching a database, network, or hosted provider.
 */
export function buildWebDatabaseBoundaryReport({
  files,
  writeAllowlist = WEB_API_DATABASE_ALLOWLIST,
  readOnlyAllowlist = WEB_API_READONLY_ALLOWLIST,
} = {}) {
  const writes = []
  const reads = []
  const blockers = []
  const normalizedWrites = normalizeAllowlist(writeAllowlist)
  const normalizedReads = normalizeAllowlist(readOnlyAllowlist)

  for (const file of files ?? []) {
    const accesses = findAccesses(file.source)
    if (accesses.length === 0) continue

    const entry = {
      path: file.path,
      operations: [...new Set(accesses.map((access) => access.operation))].sort(),
      evidence: accesses.map((access) => `line ${access.line}: ${access.operation}`),
    }
    const writeOperations = entry.operations.filter((operation) =>
      WRITE_OPERATIONS.has(operation)
    )
    const executeOperations = entry.operations.filter((operation) => operation === 'execute')

    if (writeOperations.length > 0) {
      writes.push({ ...entry, operations: writeOperations })
      const allowed = normalizedWrites[file.path]
      if (!allowed) {
        blockers.push(`${file.path}: direct database write is not allowlisted`)
      } else {
        for (const operation of writeOperations) {
          if (!allowed.has(operation)) {
            blockers.push(`${file.path}: operation ${operation} is not allowlisted`)
          }
        }
      }
    }

    if (executeOperations.length > 0) {
      reads.push({ ...entry, operations: executeOperations })
      const allowed = normalizedReads[file.path]
      if (!allowed) {
        blockers.push(`${file.path}: db.execute must be explicitly classified read-only`)
      } else {
        for (const operation of executeOperations) {
          if (!allowed.has(operation)) {
            blockers.push(`${file.path}: operation ${operation} is not allowlisted as read-only`)
          }
        }
      }
    }
  }

  return {
    status: blockers.length === 0 ? 'clear' : 'review_required',
    blockers,
    directWrites: writes,
    directReads: reads,
  }
}

export function verifyWebDatabaseBoundary(root = repoRoot) {
  return buildWebDatabaseBoundaryReport({ files: collectRuntimeFiles(root) })
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = verifyWebDatabaseBoundary()
  console.log(`Web DB boundary: ${report.status}`)
  console.log(`- direct write routes: ${report.directWrites.length}`)
  for (const write of report.directWrites) {
    console.log(`  - ${write.path} [${write.operations.join(', ')}]`)
  }
  console.log(`- direct read routes: ${report.directReads.length}`)
  for (const blocker of report.blockers) console.log(`- ${blocker}`)
  if (report.status !== 'clear') process.exitCode = 2
}
