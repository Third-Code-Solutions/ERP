import assert from 'node:assert/strict'
import test from 'node:test'
import {
  CASH_ACCOUNTS,
  COST_CODES,
  LEDGER_ACCOUNTS,
  REQUIRED_SYSTEM_KEYS,
  UNITS_OF_MEASURE,
  UNIT_ALIASES,
  buildBootstrapPlan,
  diffBootstrapPlan,
  formatBootstrapReport,
  manilaYear,
  parseBootstrapArgs,
} from './trial-tenant-bootstrap.mjs'

const TENANT = '2b2b039c-b066-412b-af4c-564f2af6097e'
const ACTOR = '0b6d8c68-2b7a-4f75-92f6-b539c91ad199'

const EMPTY = {
  ledgerAccounts: [],
  fiscalPeriods: [],
  cashAccounts: [],
  unitsOfMeasure: [],
  costCodes: [],
  warehouses: [],
  unitAliases: [],
}

// Account types the Finance setup enforces per system key (finance/actions.ts),
// plus the three inventory keys the stock posting functions read.
const TYPE_BY_KEY = {
  accounts_receivable: 'asset',
  retention_receivable: 'asset',
  withholding_tax_receivable: 'asset',
  revenue: 'income',
  output_vat_payable: 'liability',
  accounts_payable: 'liability',
  input_vat_receivable: 'asset',
  withholding_tax_payable: 'liability',
  inventory: 'asset',
  goods_received_not_invoiced: 'liability',
  inventory_consumption: 'expense',
  inventory_adjustment_gain: 'income',
  inventory_adjustment_loss: 'expense',
  cash: 'asset',
}

function existingFromPlan(plan) {
  return {
    ledgerAccounts: plan.ledgerAccounts.map(({ code, system_key }) => ({ code, system_key })),
    fiscalPeriods: [plan.fiscalPeriod],
    cashAccounts: plan.cashAccounts.map(({ name, ledger_code }) => ({ name, ledger_code })),
    unitsOfMeasure: plan.unitsOfMeasure.map(({ code }) => ({ code })),
    costCodes: plan.costCodes.map(({ code }) => ({ code })),
    warehouses: [{ code: plan.warehouse.code }],
    unitAliases: plan.unitAliases.map(({ alias }) => ({ alias })),
  }
}

test('chart carries every required system key exactly once with the type the app expects', () => {
  for (const key of REQUIRED_SYSTEM_KEYS) {
    const owners = LEDGER_ACCOUNTS.filter((row) => row.system_key === key)
    assert.equal(owners.length, 1, `system key ${key}`)
    assert.equal(owners[0].account_type, TYPE_BY_KEY[key], `type of ${key}`)
  }
  assert.deepEqual(Object.keys(TYPE_BY_KEY).sort(), [...REQUIRED_SYSTEM_KEYS].sort())
})

test('seed rows satisfy the table constraints', () => {
  const codes = LEDGER_ACCOUNTS.map((row) => row.code)
  assert.equal(new Set(codes).size, codes.length)
  const keys = LEDGER_ACCOUNTS.map((row) => row.system_key).filter(Boolean)
  assert.equal(new Set(keys).size, keys.length)
  for (const row of LEDGER_ACCOUNTS) {
    const debit = row.account_type === 'asset' || row.account_type === 'expense'
    assert.equal(row.normal_balance, debit ? 'debit' : 'credit', row.code)
    assert.ok(row.code === row.code.trim() && row.code.length <= 30)
    assert.ok(row.name === row.name.trim() && row.name.length <= 160)
    assert.ok(!row.system_key || row.system_key.length <= 60)
  }
  for (const unit of UNITS_OF_MEASURE) {
    assert.ok(unit.code.length <= 32 && unit.name.length <= 120)
    assert.ok(unit.decimal_places >= 0 && unit.decimal_places <= 6)
  }
  assert.equal(
    new Set(UNITS_OF_MEASURE.map((unit) => unit.code.toLowerCase())).size,
    UNITS_OF_MEASURE.length
  )
  assert.equal(
    new Set(COST_CODES.map((row) => row.code.toLowerCase())).size,
    COST_CODES.length
  )
  for (const cash of CASH_ACCOUNTS) {
    const ledger = LEDGER_ACCOUNTS.find((row) => row.code === cash.ledger_code)
    assert.equal(ledger?.account_type, 'asset', cash.name)
  }
})

test('plan names the fiscal period after the year and spans Jan 1 to Dec 31', () => {
  assert.deepEqual(buildBootstrapPlan({ fiscalYear: 2027 }).fiscalPeriod, {
    name: 'FY 2027',
    starts_on: '2027-01-01',
    ends_on: '2027-12-31',
  })
})

test('empty tenant: everything is inserted and nothing conflicts', () => {
  const plan = buildBootstrapPlan({ fiscalYear: 2026 })
  const diff = diffBootstrapPlan(plan, EMPTY)
  assert.equal(diff.ledgerAccounts.insert.length, LEDGER_ACCOUNTS.length)
  assert.equal(diff.fiscalPeriod.insert.length, 1)
  assert.equal(diff.cashAccounts.insert.length, CASH_ACCOUNTS.length)
  assert.equal(diff.unitsOfMeasure.insert.length, UNITS_OF_MEASURE.length)
  assert.equal(diff.costCodes.insert.length, COST_CODES.length)
  assert.equal(diff.unitAliases.insert.length, UNIT_ALIASES.length)
  assert.deepEqual(diff.warehouse.insert.map((row) => row.code), ['MAIN'])
  assert.deepEqual(diff.conflicts, [])
})

test('fully bootstrapped tenant: a second run inserts nothing', () => {
  const plan = buildBootstrapPlan({ fiscalYear: 2026 })
  const diff = diffBootstrapPlan(plan, existingFromPlan(plan))
  for (const key of [
    'ledgerAccounts',
    'fiscalPeriod',
    'cashAccounts',
    'unitsOfMeasure',
    'unitAliases',
    'warehouse',
    'costCodes',
  ]) {
    assert.equal(diff[key].insert.length, 0, key)
    assert.ok(diff[key].present.length > 0, key)
  }
  assert.deepEqual(diff.conflicts, [])
})

test('a system key already mapped on another code is not duplicated', () => {
  const plan = buildBootstrapPlan({ fiscalYear: 2026 })
  const existing = {
    ...EMPTY,
    ledgerAccounts: [{ code: '1150', system_key: 'accounts_receivable' }],
  }
  const diff = diffBootstrapPlan(plan, existing)
  const skipped = diff.ledgerAccounts.present.find((entry) => entry.row.code === '1100')
  assert.match(skipped.reason, /system key already on account 1150/)
  assert.equal(
    diff.ledgerAccounts.insert.some((row) => row.system_key === 'accounts_receivable'),
    false
  )
  assert.deepEqual(diff.conflicts, [])
})

test('a code taken by an account without the key is a conflict, not an update', () => {
  const plan = buildBootstrapPlan({ fiscalYear: 2026 })
  const existing = { ...EMPTY, ledgerAccounts: [{ code: '1200', system_key: null }] }
  const diff = diffBootstrapPlan(plan, existing)
  assert.equal(diff.conflicts.length, 1)
  assert.match(diff.conflicts[0], /"inventory".*1200/)
  assert.equal(diff.ledgerAccounts.insert.some((row) => row.code === '1200'), false)
})

test('an overlapping fiscal period is kept instead of inserting a second one', () => {
  const plan = buildBootstrapPlan({ fiscalYear: 2026 })
  const existing = {
    ...EMPTY,
    fiscalPeriods: [{ name: 'Jul 2026 to Jun 2027', starts_on: '2026-07-01', ends_on: '2027-06-30' }],
  }
  const diff = diffBootstrapPlan(plan, existing)
  assert.equal(diff.fiscalPeriod.insert.length, 0)
  assert.match(diff.fiscalPeriod.present[0].reason, /overlaps existing period Jul 2026/)
})

test('an adjacent fiscal year does not block the new one', () => {
  const plan = buildBootstrapPlan({ fiscalYear: 2026 })
  const existing = {
    ...EMPTY,
    fiscalPeriods: [{ name: 'FY 2025', starts_on: '2025-01-01', ends_on: '2025-12-31' }],
  }
  assert.equal(diffBootstrapPlan(plan, existing).fiscalPeriod.insert.length, 1)
})

test('units and cost codes match existing rows case-insensitively', () => {
  const plan = buildBootstrapPlan({ fiscalYear: 2026 })
  const existing = { ...EMPTY, unitsOfMeasure: [{ code: 'pcs' }], costCodes: [{ code: 'mat' }] }
  const diff = diffBootstrapPlan(plan, existing)
  assert.equal(diff.unitsOfMeasure.present.length, 1)
  assert.equal(diff.unitsOfMeasure.insert.length, UNITS_OF_MEASURE.length - 1)
  assert.equal(diff.costCodes.present.length, 1)
  assert.equal(diff.costCodes.insert.length, COST_CODES.length - 1)
})

test('an existing cash account on the same ledger account is kept', () => {
  const plan = buildBootstrapPlan({ fiscalYear: 2026 })
  const existing = {
    ...existingFromPlan(plan),
    cashAccounts: [{ name: 'Petty cash', ledger_code: '1000' }],
  }
  const diff = diffBootstrapPlan(plan, existing)
  assert.deepEqual(diff.cashAccounts.insert.map((row) => row.ledger_code), ['1010'])
  assert.deepEqual(diff.cashAccounts.present.map((entry) => entry.row.ledger_code), ['1000'])
})

test('report lists what is inserted, what exists and any conflicts', () => {
  const plan = buildBootstrapPlan({ fiscalYear: 2026 })
  const diff = diffBootstrapPlan(plan, {
    ...EMPTY,
    ledgerAccounts: [{ code: '1200', system_key: null }],
  })
  const report = formatBootstrapReport(diff, {
    tenantId: TENANT,
    tenantName: 'Acme Builders',
    fiscalYear: 2026,
    actorUserId: ACTOR,
    actorSource: 'earliest active owner/admin',
    apply: false,
  }).join('\n')
  assert.match(report, /DRY RUN/)
  assert.match(report, /Ledger accounts: insert 17, already present 1/)
  assert.match(report, /\+ 1100 Accounts receivable \[asset\/debit\] key=accounts_receivable/)
  assert.match(report, /= 1200 Inventory .*\(code exists\)/)
  assert.match(report, /CONFLICTS \(1\)/)
})

test('manilaYear follows Asia/Manila, not UTC', () => {
  assert.equal(manilaYear(new Date('2026-12-31T20:00:00Z')), 2027)
  assert.equal(manilaYear(new Date('2026-12-31T15:00:00Z')), 2026)
})

test('arguments: defaults to a dry run in the Manila year', () => {
  const options = parseBootstrapArgs(['--tenant-id', TENANT.toUpperCase()], new Date('2026-12-31T20:00:00Z'))
  assert.deepEqual(options, {
    tenantId: TENANT,
    fiscalYear: 2027,
    actorUserId: null,
    warehouseCode: 'MAIN',
    warehouseExplicit: false,
    apply: false,
  })
})

test('arguments: explicit year, actor and apply', () => {
  const options = parseBootstrapArgs([
    '--tenant-id', TENANT, '--fiscal-year', '2026', '--actor-user-id', ACTOR, '--apply',
  ])
  assert.deepEqual(options, {
    tenantId: TENANT,
    fiscalYear: 2026,
    actorUserId: ACTOR,
    warehouseCode: 'MAIN',
    warehouseExplicit: false,
    apply: true,
  })
})

test('arguments: an explicit warehouse code is upper-cased and validated', () => {
  const options = parseBootstrapArgs(['--tenant-id', TENANT, '--warehouse', 'site-1'])
  assert.equal(options.warehouseCode, 'SITE-1')
  assert.equal(options.warehouseExplicit, true)
  assert.throws(() => parseBootstrapArgs(['--tenant-id', TENANT, '--warehouse', 'a b']), /--warehouse must be/)
  assert.throws(() => parseBootstrapArgs(['--tenant-id', TENANT, '--warehouse', 'x'.repeat(41)]), /--warehouse must be/)
})

test('arguments: bad input is rejected with the usage text', () => {
  assert.throws(() => parseBootstrapArgs([]), /--tenant-id <uuid> is required/)
  assert.throws(() => parseBootstrapArgs(['--tenant-id', 'nope']), /--tenant-id <uuid> is required/)
  assert.throws(() => parseBootstrapArgs(['--tenant-id', TENANT, '--fiscal-year', '26']), /four digit year/)
  assert.throws(() => parseBootstrapArgs(['--tenant-id', TENANT, '--fiscal-year', '1999']), /four digit year/)
  assert.throws(() => parseBootstrapArgs(['--tenant-id', TENANT, '--actor-user-id', 'x']), /--actor-user-id must be a UUID/)
  assert.throws(() => parseBootstrapArgs(['--tenant-id', TENANT, '--force']), /Usage: node scripts\/bootstrap-trial-tenant.mjs/)
})

test('alias seed list is clean: lower case, unique, never a unit code, always a seeded unit', () => {
  const codes = new Set(UNITS_OF_MEASURE.map((unit) => unit.code.toLowerCase()))
  const seen = new Set()
  for (const { alias, uom_code } of UNIT_ALIASES) {
    assert.equal(alias, alias.trim().toLowerCase(), alias)
    assert.ok(alias.length > 0 && alias.length <= 32, alias)
    assert.ok(!seen.has(alias), `duplicate alias ${alias}`)
    seen.add(alias)
    assert.ok(!codes.has(alias), `${alias} is already a unit code`)
    assert.ok(codes.has(uom_code.toLowerCase()), `${alias} targets unknown unit ${uom_code}`)
  }
})

test('aliases wait for the unit_aliases table instead of failing the run', () => {
  const plan = buildBootstrapPlan({ fiscalYear: 2026 })
  const diff = diffBootstrapPlan(plan, { ...EMPTY, unitAliases: null })
  assert.equal(diff.unitAliases.insert.length, 0)
  assert.equal(diff.unitAliases.present.length, UNIT_ALIASES.length)
  assert.match(diff.unitAliases.present[0].reason, /apply migration 20261118100000 first/)
})

test('an existing alias is kept; one for a unit the tenant will not have is not inserted', () => {
  const plan = buildBootstrapPlan({ fiscalYear: 2026 })
  const existing = { ...EMPTY, unitAliases: [{ alias: 'PC' }] }
  const diff = diffBootstrapPlan(plan, existing)
  const reasonOf = (alias) => diff.unitAliases.present.find((entry) => entry.row.alias === alias)?.reason
  assert.equal(reasonOf('pc'), 'alias exists')
  assert.equal(diff.unitAliases.insert.some((row) => row.alias === 'pieces'), true)

  const custom = { ...plan, unitAliases: [{ alias: 'zz', uom_code: 'NOPE' }] }
  const missing = diffBootstrapPlan(custom, EMPTY).unitAliases
  assert.equal(missing.insert.length, 0)
  assert.equal(missing.present[0].reason, 'unit NOPE does not exist')
})

test('the warehouse is created for a tenant with none and skipped for one that has one', () => {
  const plan = buildBootstrapPlan({ fiscalYear: 2026 })
  assert.equal(diffBootstrapPlan(plan, EMPTY).warehouse.insert.length, 1)

  const other = { ...EMPTY, warehouses: [{ code: 'WH-1' }] }
  const skipped = diffBootstrapPlan(plan, other).warehouse
  assert.equal(skipped.insert.length, 0)
  assert.equal(skipped.present[0].reason, 'tenant already has a warehouse')

  const explicit = buildBootstrapPlan({ fiscalYear: 2026, warehouseCode: 'SITE-2', warehouseExplicit: true })
  assert.deepEqual(diffBootstrapPlan(explicit, other).warehouse.insert.map((row) => row.code), ['SITE-2'])
  assert.equal(diffBootstrapPlan(explicit, { ...EMPTY, warehouses: [{ code: 'site-2' }] }).warehouse.insert.length, 0)
})
