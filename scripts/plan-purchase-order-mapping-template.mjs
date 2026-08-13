#!/usr/bin/env node

/**
 * Read-only Purchase Order duplicate-mapping template generator.
 *
 * Reads one repeatable-read snapshot and writes a new owner-review skeleton
 * outside the repository. It never updates SQL, migration history, provider
 * state, or Purchase Order numbers. Existing files are never overwritten.
 *
 * Usage:
 *   node --env-file=apps/web/.env.local scripts/plan-purchase-order-mapping-template.mjs `
 *     --template-file=C:\secure\thirdcode-po-mapping-template.json
 */
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { existsSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  assertSafeMappingTemplatePath,
  buildPurchaseOrderMappingTemplate,
} from './lib/purchase-order-mapping-template.mjs'

const scriptDirectory = fileURLToPath(new URL('.', import.meta.url))
const repoRoot = resolve(scriptDirectory, '..')
const jsonOutput = process.argv.includes('--json')
const databaseUrl = process.env.DATABASE_URL

function optionValue(name) {
  const prefix = `--${name}=`
  const argument = process.argv.find((value) => value.startsWith(prefix))
  return argument?.slice(prefix.length)
}

function fail(message) {
  const report = {
    mode: 'read_only',
    status: 'review_required',
    blockers: [message],
  }
  if (jsonOutput) console.log(JSON.stringify(report, null, 2))
  else console.error(`Purchase Order mapping template blocked: ${message}`)
  process.exitCode = 2
}

const templateFile = optionValue('template-file')
if (!templateFile) {
  fail('--template-file is required and must be outside the repository')
} else if (!databaseUrl) {
  fail('DATABASE_URL is required')
} else {
  let outputPath
  try {
    outputPath = assertSafeMappingTemplatePath(repoRoot, templateFile)
    if (existsSync(outputPath)) {
      throw new Error('template file already exists; refusing to overwrite it')
    }
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error))
  }

  if (outputPath) {
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

    try {
      const snapshot = await sql.begin(
        'isolation level repeatable read read only',
        async (transaction) => {
          const [server] = await transaction.unsafe(
            "select current_setting('server_version_num') as server_version_num, current_setting('TimeZone') as timezone"
          )
          const rows = await transaction.unsafe(`
            with duplicate_groups as (
              select tenant_id, po_number
              from public.purchase_orders
              group by tenant_id, po_number
              having count(*) > 1
            )
            select po.id, po.tenant_id, po.po_number, po.created_at
            from public.purchase_orders po
            join duplicate_groups duplicate_group
              on duplicate_group.tenant_id = po.tenant_id
             and duplicate_group.po_number = po.po_number
            order by po.tenant_id, po.po_number, po.created_at, po.id
          `)
          return {
            rows,
            postgresMajor: Math.floor(
              Number(server?.server_version_num ?? 0) / 10_000
            ),
            timezone: server?.timezone ?? null,
          }
        }
      )

      const template = buildPurchaseOrderMappingTemplate({
        rows: snapshot.rows.map((row) => ({
          id: row.id,
          tenantId: row.tenant_id,
          poNumber: row.po_number,
          createdAt: row.created_at,
        })),
        capturedAt: new Date().toISOString(),
        postgresMajor: snapshot.postgresMajor,
        timezone: snapshot.timezone,
      })
      const bytes = Buffer.from(`${JSON.stringify(template, null, 2)}\n`, 'utf8')
      // wx makes the artifact creation atomic and prevents accidental edits to
      // an existing owner decision file.
      writeFileSync(outputPath, bytes, { encoding: 'utf8', flag: 'wx', mode: 0o600 })
      const report = {
        mode: 'read_only',
        status: 'ready_for_owner_review',
        templateFile: {
          bytes: bytes.byteLength,
          sha256: createHash('sha256').update(bytes).digest('hex'),
        },
        duplicateRecords: template.entries.length,
        postgresMajor: snapshot.postgresMajor,
        blockers:
          template.entries.length > 0
            ? ['owner must fill and approve every replacementNumber']
            : [],
      }
      if (jsonOutput) console.log(JSON.stringify(report, null, 2))
      else {
        console.log('Third Code ERP Purchase Order mapping template (READ ONLY)')
        console.log(`Status: ${report.status}`)
        console.log(`Duplicate records captured: ${report.duplicateRecords}`)
        console.log(`Template SHA-256: ${report.templateFile.sha256}`)
        if (report.blockers.length > 0) {
          for (const blocker of report.blockers) console.log(`- ${blocker}`)
        }
        console.log('No SQL or provider state was changed.')
      }
      if (template.entries.length > 0) process.exitCode = 2
    } catch (error) {
      fail(`Purchase Order mapping template failed (${error instanceof Error ? error.message : String(error)})`)
    } finally {
      await sql.end({ timeout: 1 })
    }
  }
}
