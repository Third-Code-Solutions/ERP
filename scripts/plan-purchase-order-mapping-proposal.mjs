#!/usr/bin/env node

/**
 * Read-only Purchase Order duplicate-mapping proposal generator.
 *
 * Writes deterministic owner-review recommendations outside the repository.
 * The output is deliberately not a version-1 mapping and cannot authorize or
 * execute a repair. Existing files are never overwritten.
 *
 * Usage:
 *   node --env-file=apps/web/.env.local scripts/plan-purchase-order-mapping-proposal.mjs `
 *     --proposal-file=C:\secure\thirdcode-po-mapping-proposal.json
 */
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { existsSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  assertSafeMappingProposalPath,
  buildPurchaseOrderMappingProposal,
} from './lib/purchase-order-mapping-proposal.mjs'

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
  else console.error(`Purchase Order mapping proposal blocked: ${message}`)
  process.exitCode = 2
}

function databaseErrorCode(error) {
  return error && typeof error.code === 'string' ? error.code : 'unknown'
}

const proposalFile = optionValue('proposal-file')
if (!proposalFile) {
  fail('--proposal-file is required and must be outside the repository')
} else if (!databaseUrl) {
  fail('DATABASE_URL is required')
} else {
  let outputPath
  try {
    outputPath = assertSafeMappingProposalPath(repoRoot, proposalFile)
    if (existsSync(outputPath)) {
      throw new Error('proposal file already exists; refusing to overwrite it')
    }
  } catch (error) {
    outputPath = undefined
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
          const duplicateRows = await transaction.unsafe(`
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
          const tenantIds = [
            ...new Set(duplicateRows.map((row) => row.tenant_id)),
          ]
          const scopedRows =
            tenantIds.length === 0
              ? []
              : await transaction.unsafe(
                  `
                    select tenant_id, po_number
                    from public.purchase_orders
                    where tenant_id = any($1::uuid[])
                  `,
                  [tenantIds]
                )
          return {
            duplicateRows,
            scopedRows,
            postgresMajor: Math.floor(
              Number(server?.server_version_num ?? 0) / 10_000
            ),
            timezone: server?.timezone ?? null,
          }
        }
      )

      const proposal = buildPurchaseOrderMappingProposal({
        duplicateRows: snapshot.duplicateRows.map((row) => ({
          id: row.id,
          tenantId: row.tenant_id,
          poNumber: row.po_number,
          createdAt: row.created_at,
        })),
        scopedRows: snapshot.scopedRows.map((row) => ({
          tenantId: row.tenant_id,
          poNumber: row.po_number,
        })),
        capturedAt: new Date().toISOString(),
        postgresMajor: snapshot.postgresMajor,
        timezone: snapshot.timezone,
      })
      const bytes = Buffer.from(`${JSON.stringify(proposal, null, 2)}\n`, 'utf8')
      writeFileSync(outputPath, bytes, {
        encoding: 'utf8',
        flag: 'wx',
        mode: 0o600,
      })
      const renumberRecommendations = proposal.recommendations.filter(
        (entry) => entry.suggestedAction === 'renumber'
      ).length
      const report = {
        mode: 'read_only',
        status: 'ready_for_owner_review',
        proposalFile: {
          bytes: bytes.byteLength,
          sha256: createHash('sha256').update(bytes).digest('hex'),
        },
        duplicateGroups: proposal.snapshot.duplicateGroups,
        duplicateRecords: proposal.snapshot.duplicateRecords,
        keepRecommendations:
          proposal.recommendations.length - renumberRecommendations,
        renumberRecommendations,
        ownerApproved: false,
        blockers:
          proposal.recommendations.length > 0
            ? ['database owner must review and create a separate version-1 mapping']
            : [],
      }
      if (jsonOutput) console.log(JSON.stringify(report, null, 2))
      else {
        console.log('Third Code ERP Purchase Order mapping proposal (READ ONLY)')
        console.log(`Status: ${report.status}`)
        console.log(
          `Groups: ${report.duplicateGroups}; records: ${report.duplicateRecords}; renumber suggestions: ${report.renumberRecommendations}`
        )
        console.log(`Proposal SHA-256: ${report.proposalFile.sha256}`)
        for (const blocker of report.blockers) console.log(`- ${blocker}`)
        console.log('No PO numbers, UUIDs, or recommendation values were printed.')
        console.log('No SQL or provider state was changed.')
      }
      if (report.blockers.length > 0) process.exitCode = 2
    } catch (error) {
      fail(`Purchase Order mapping proposal failed (${databaseErrorCode(error)})`)
    } finally {
      await sql.end({ timeout: 1 })
    }
  }
}
