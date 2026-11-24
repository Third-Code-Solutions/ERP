import assert from 'node:assert/strict'
import test from 'node:test'
import {
  MAX_ROWS,
  formatImportReport,
  materialItemAuditHash,
  parseCsv,
  parseImportArgs,
  parseMaterialItemsCsv,
  planMaterialItemsImport,
  resolveUnit,
} from './material-items-import.mjs'
import { computeDatabaseAuditHash } from '../../packages/shared-types/src/audit/hash-chain.ts'

const TENANT = '2b2b039c-b066-412b-af4c-564f2af6097e'

const EXISTING = {
  itemCodes: ['CEM-40'],
  unitsOfMeasure: [{ code: 'PCS' }, { code: 'BAG' }, { code: 'M' }],
  unitAliases: [{ alias: 'pieces', uom_code: 'PCS' }],
}

test('parseCsv reads quoted commas, doubled quotes, CRLF and a BOM', () => {
  const records = parseCsv('﻿a,"b,c","say ""hi"""\r\n\r\nd,e,f\n')
  assert.deepEqual(
    records.map((record) => record.cells),
    [['a', 'b,c', 'say "hi"'], ['d', 'e', 'f']]
  )
  assert.deepEqual(records.map((record) => record.line), [1, 3])
})

test('parseCsv refuses a quoted field that never closes', () => {
  assert.throws(() => parseCsv('a,"b\nc'), /never closed/)
})

test('rows are trimmed and tracked defaults to no', () => {
  const { rows, errors } = parseMaterialItemsCsv(
    'code,description,unit,tracked\n ABC-1 , Gravel , m ,Yes\nABC-2,Sand,bag,\nABC-3,Rebar,pcs,0\n'
  )
  assert.deepEqual(errors, [])
  assert.deepEqual(
    rows.map(({ code, description, unit, tracked }) => ({ code, description, unit, tracked })),
    [
      { code: 'ABC-1', description: 'Gravel', unit: 'm', tracked: true },
      { code: 'ABC-2', description: 'Sand', unit: 'bag', tracked: false },
      { code: 'ABC-3', description: 'Rebar', unit: 'pcs', tracked: false },
    ]
  )
})

test('the tracked column is optional', () => {
  const { rows, errors } = parseMaterialItemsCsv('code,description,unit\nA,Thing,pcs\n')
  assert.deepEqual(errors, [])
  assert.equal(rows[0].tracked, false)
})

test('every problem is reported with its line, not just the first', () => {
  const { rows, errors } = parseMaterialItemsCsv(
    'code,description,unit,tracked\nA,ok,pcs,yes\n,no code,pcs,no\nB,,pcs,no\nC,bad flag,pcs,maybe\nA,again,pcs,no\n'
  )
  assert.equal(rows.length, 1)
  assert.deepEqual(
    errors.map((error) => error.line),
    [3, 4, 5, 6]
  )
  assert.match(errors[0].message, /code is required/)
  assert.match(errors[1].message, /description is required/)
  assert.match(errors[2].message, /tracked must be yes or no, not "maybe"/)
  assert.match(errors[3].message, /code A is repeated \(first on line 2\)/)
})

test('a missing or unknown column stops the import before any row is read', () => {
  assert.match(parseMaterialItemsCsv('code,description\nA,x\n').errors[0].message, /Missing column "unit"/)
  assert.match(
    parseMaterialItemsCsv('code,description,unit,uom\nA,x,pcs,pcs\n').errors[0].message,
    /Unknown column "uom"/
  )
  assert.match(parseMaterialItemsCsv('').errors[0].message, /CSV is empty/)
})

test('a row with more cells than the header is refused, not shifted into the next column', () => {
  const { rows, errors } = parseMaterialItemsCsv('code,description,unit\nB-1,Bolt, M,pcs\nB-2,"Bolt, M",pcs\n')
  assert.deepEqual(rows.map((row) => [row.code, row.description, row.unit]), [['B-2', 'Bolt, M', 'pcs']])
  assert.equal(errors.length, 1)
  assert.equal(errors[0].line, 2)
  assert.match(errors[0].message, /has 4 cells, header has 3/)
})

test('a repeated column name stops the import', () => {
  const { rows, errors } = parseMaterialItemsCsv('code,Code,description,unit\nA,B,x,pcs\n')
  assert.equal(rows.length, 0)
  assert.match(errors[0].message, /Column "code" appears more than once/)
})

test('control characters are refused in code, description and unit', () => {
  const { rows, errors } = parseMaterialItemsCsv(
    'code,description,unit\n"A\nB",ok,pcs\nC,"bad\u001b[31m",pcs\nD,ok,"p\u007fcs"\nE,ok\ttab,pcs\n'
  )
  assert.equal(rows.length, 0)
  assert.deepEqual(
    errors.map((error) => error.message),
    [
      'code contains a control character',
      'description contains a control character',
      'unit contains a control character',
      'description contains a control character',
    ]
  )
})

test('the audit hash is the shared-types database audit hash of a material item create', async () => {
  const id = '6f1c2a4e-1b2c-4d3e-8f90-123456789abc'
  const prevHash = '4c61fd9eb3ed405dde0a6f8db34db410ea9fa20680078aa18efd9f2ba7804ace'
  // Whole second, trailing-zero fraction, full millisecond: the cases the timestamp text trims differently.
  for (const stamp of ['2026-11-24T01:02:03.000Z', '2026-11-24T01:02:03.400Z', '2026-11-24T23:59:59.123Z']) {
    const createdAt = new Date(stamp)
    for (const prev of ['genesis', prevHash]) {
      assert.equal(
        materialItemAuditHash(prev, id, createdAt),
        await computeDatabaseAuditHash(prev, {
          entity_type: 'material_item',
          entity_id: id,
          action: 'create',
          created_at: createdAt,
        }),
        `${prev} at ${stamp}`
      )
    }
  }
})

test('an import is capped', () => {
  const body = Array.from({ length: MAX_ROWS + 1 }, (_, index) => `C${index},d,pcs`).join('\n')
  assert.match(parseMaterialItemsCsv(`code,description,unit\n${body}\n`).errors[0].message, /At most 5000/)
})

test('a unit matches a unit code or an alias, ignoring case and padding, and nothing else', () => {
  assert.equal(resolveUnit(' bag ', EXISTING), 'BAG')
  assert.equal(resolveUnit('Pieces', EXISTING), 'PCS')
  assert.equal(resolveUnit('sacks', EXISTING), null)
  assert.equal(resolveUnit('pieces', { ...EXISTING, unitAliases: null }), null)
})

test('plan: new codes are inserted with the unit code, existing codes are left alone, unknown units fail', () => {
  const { rows } = parseMaterialItemsCsv(
    'code,description,unit,tracked\nGRV-1,Gravel,m,yes\nCEM-40,Cement,bag,yes\nNAIL-1,Nails,pieces,no\nSAC-1,Sacks,sacks,no\n'
  )
  const plan = planMaterialItemsImport(rows, EXISTING)
  assert.deepEqual(
    plan.insert.map(({ code, unit, tracked }) => ({ code, unit, tracked })),
    [
      { code: 'GRV-1', unit: 'M', tracked: true },
      { code: 'NAIL-1', unit: 'PCS', tracked: false },
    ]
  )
  assert.deepEqual(plan.present.map((entry) => entry.row.code), ['CEM-40'])
  assert.equal(plan.errors.length, 1)
  assert.match(plan.errors[0].message, /unit "sacks" is not a unit of measure or alias of this tenant/)
})

test('plan: code matching is exact, like the unique index', () => {
  const { rows } = parseMaterialItemsCsv('code,description,unit\ncem-40,Cement,bag\n')
  assert.equal(planMaterialItemsImport(rows, EXISTING).insert.length, 1)
})

test('report lists inserts, existing codes and errors', () => {
  const { rows } = parseMaterialItemsCsv(
    'code,description,unit,tracked\nGRV-1,Gravel,m,yes\nCEM-40,Cement,bag,yes\nSAC-1,Sacks,sacks,no\n'
  )
  const report = formatImportReport(planMaterialItemsImport(rows, EXISTING), {
    tenantId: TENANT,
    tenantName: 'Acme Builders',
    actorUserId: 'actor',
    actorSource: 'earliest active owner/admin',
    apply: false,
  }).join('\n')
  assert.match(report, /DRY RUN/)
  assert.match(report, /Items: insert 1, already present 1, errors 1/)
  assert.match(report, /\+ GRV-1 Gravel \[M\] tracked/)
  assert.match(report, /= CEM-40 \(code exists, left unchanged\)/)
  assert.match(report, /! line 4: unit "sacks"/)
})

test('arguments: tenant id and csv are required; apply is opt-in', () => {
  const options = parseImportArgs(['--tenant-id', TENANT.toUpperCase(), '--csv', 'items.csv'])
  assert.deepEqual(options, { tenantId: TENANT, csvPath: 'items.csv', actorUserId: null, apply: false })
  assert.equal(parseImportArgs(['--tenant-id', TENANT, '--csv', 'items.csv', '--apply']).apply, true)
  assert.throws(() => parseImportArgs(['--csv', 'items.csv']), /--tenant-id <uuid> is required/)
  assert.throws(() => parseImportArgs(['--tenant-id', TENANT]), /--csv <file> is required/)
  assert.throws(() => parseImportArgs(['--tenant-id', TENANT, '--csv', 'x', '--actor-user-id', 'x']), /must be a UUID/)
  assert.throws(() => parseImportArgs(['--tenant-id', TENANT, '--csv', 'x', '--force']), /Usage: node scripts\/import-material-items.mjs/)
})
