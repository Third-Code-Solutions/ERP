#!/usr/bin/env node

/**
 * Read-only Purchase Order duplicate-mapping preflight.
 *
 * The mapping file contains business values and must live outside the
 * repository. This command compares it with one repeatable-read snapshot,
 * prints only counts/opaque conflict references, and never writes SQL.
 *
 * Usage:
 *   node --env-file=apps/web/.env.local scripts/plan-purchase-order-mapping.mjs --mapping-file=C:\\secure\\po-mapping.json
 *   node --env-file=apps/web/.env.local scripts/plan-purchase-order-mapping.mjs --mapping-file=C:\\secure\\po-mapping.json --json
 */
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  normalizePurchaseOrderMapping,
  validatePurchaseOrderMapping,
} from './lib/purchase-order-duplicate-mapping.mjs'

const scriptDirectory = fileURLToPath(new URL('.', import.meta.url))
const repoRoot = resolve(scriptDirectory, '..')
const jsonOutput = process.argv.includes('--json')
const databaseUrl = process.env.DATABASE_URL

function optionValue(name) {
  const prefix = `--${name}=`
  const argument = process.argv.find((value) => value.startsWith(prefix))
  return argument?.slice(prefix.length)
}

function isWithin(directory, candidate) {
  const child = relative(directory, candidate)
  return child === '' || (!child.startsWith(`..${sep}`) && !isAbsolute(child))
}

function fail(message) {
  const report = {
    mode: 'read_only',
    status: 'review_required',
    blockers: [message],
  }
  if (jsonOutput) console.log(JSON.stringify(report, null, 2))
  else console.error(`Purchase Order mapping preflight blocked: ${message}`)
  process.exitCode = 2
}

function databaseErrorCode(error) {
  return error && typeof error.code === 'string' ? error.code : 'unknown'
}

const mappingFile = optionValue('mapping-file')
if (!mappingFile) {
  fail('--mapping-file is required')
} else if (!databaseUrl) {
  fail('DATABASE_URL is required')
} else {
  const mappingPath = resolve(mappingFile)
  if (isWithin(repoRoot, mappingPath)) {
    fail('mapping file must live outside the repository')
  } else {
    let raw
    let mapping
    let entries
    try {
      raw = readFileSync(mappingPath)
      mapping = JSON.parse(raw.toString('utf8'))
      entries = normalizePurchaseOrderMapping(mapping)
    } catch (error) {
      fail(error instanceof Error ? error.message : String(error))
    }

    if (raw && entries) {
      const requireFromDatabasePackage = createRequire(
        join(repoRoot, 'packages', 'database', 'package.json')
      )
      const postgres = requireFromDatabasePackage('postgres')
      const sql = postgres(databaseUrl, {
        prepare: false,
        max: 1,
        connect_timeout: 10,
        idle_timeout: 5,
      })
      const mappingDigest = createHash('sha256').update(raw).digest('hex')
      const tenantIds = [...new Set(entries.map((entry) => entry.tenantId))]

      try {
        const report = await sql.begin(
          'isolation level repeatable read read only',
          async (transaction) => {
            const duplicateRows = await transaction.unsafe(`
              with duplicate_groups as (
                select tenant_id, po_number
                from public.purchase_orders
                group by tenant_id, po_number
                having count(*) > 1
              )
              select po.id, po.tenant_id, po.po_number
              from public.purchase_orders po
              join duplicate_groups duplicate_group
                on duplicate_group.tenant_id = po.tenant_id
               and duplicate_group.po_number = po.po_number
              order by po.tenant_id, po.po_number, po.created_at, po.id
            `)

            const scopedRows =
              tenantIds.length === 0
                ? []
                : await transaction.unsafe(
                    `
                      select id, tenant_id, po_number
                      from public.purchase_orders
                      where tenant_id = any($1::uuid[])
                    `,
                    [tenantIds]
                  )

            return validatePurchaseOrderMapping({
              mapping,
              duplicateRows: duplicateRows.map((row) => ({
                id: row.id,
                tenantId: row.tenant_id,
                poNumber: row.po_number,
              })),
              scopedRows: scopedRows.map((row) => ({
                id: row.id,
                tenantId: row.tenant_id,
                poNumber: row.po_number,
              })),
            })
          }
        )

        const output = {
          ...report,
          mappingFile: {
            bytes: raw.byteLength,
            sha256: mappingDigest,
          },
        }
        if (jsonOutput) {
          console.log(JSON.stringify(output, null, 2))
        } else {
          console.log('Third Code ERP Purchase Order mapping preflight (READ ONLY)')
          console.log(`Status: ${report.status}`)
          console.log(
            `Mapping entries: ${report.mappingEntries}; duplicate records: ${report.duplicateRecords}`
          )
          if (report.blockers.length > 0) {
            console.log('Blockers:')
            for (const blocker of report.blockers) console.log(`- ${blocker}`)
          }
          console.log(`Mapping SHA-256: ${mappingDigest}`)
          console.log('No PO numbers, UUIDs, or mapping values were printed.')
          console.log('No database state was changed.')
        }
        if (report.status !== 'ready') process.exitCode = 2
      } catch (error) {
        fail(`Purchase Order mapping query failed (${databaseErrorCode(error)})`)
      } finally {
        await sql.end({ timeout: 1 })
      }
    }
  }
}
