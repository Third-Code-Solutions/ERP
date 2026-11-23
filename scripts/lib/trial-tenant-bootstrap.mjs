import { parseArgs } from 'node:util'

// Pure planning logic for scripts/bootstrap-trial-tenant.mjs. No I/O here, so the
// dry-run report and the insert statements are built from the same rows and the
// rules are unit tested without a database.

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const USAGE = [
  'Usage: node scripts/bootstrap-trial-tenant.mjs --tenant-id <uuid> [options]',
  '  --fiscal-year <yyyy>     default: current year in Asia/Manila',
  "  --actor-user-id <uuid>   default: the tenant's earliest active owner/admin",
  '  --warehouse <code>       warehouse to create (default MAIN). Without this option',
  '                           nothing is added to a tenant that already has a warehouse',
  '  --apply                  write the changes (default is a dry run)',
  'DATABASE_URL must be set in the environment.',
].join('\n')

// Every system_key the app looks up when posting (finance, inventory, receipts),
// plus the cash key the dev seed carries.
export const REQUIRED_SYSTEM_KEYS = Object.freeze([
  'cash',
  'accounts_receivable',
  'retention_receivable',
  'withholding_tax_receivable',
  'revenue',
  'output_vat_payable',
  'accounts_payable',
  'input_vat_receivable',
  'withholding_tax_payable',
  'inventory',
  'goods_received_not_invoiced',
  'inventory_consumption',
  'inventory_adjustment_gain',
  'inventory_adjustment_loss',
])

function account(code, name, account_type, system_key) {
  const normal_balance =
    account_type === 'asset' || account_type === 'expense' ? 'debit' : 'credit'
  return Object.freeze({ code, name, account_type, normal_balance, system_key })
}

// Codes, names and types mirror supabase/seed.sql (the dev tenant that is known
// to post cleanly). Deliberately no extra accounts: the UI cannot deactivate a
// ledger account, so anything beyond what posting needs is the trial company's
// accountant's call.
export const LEDGER_ACCOUNTS = Object.freeze([
  account('1000', 'Cash and cash equivalents', 'asset', 'cash'),
  account('1010', 'Operating bank', 'asset', null),
  account('1100', 'Accounts receivable', 'asset', 'accounts_receivable'),
  account('1110', 'Retention receivable', 'asset', 'retention_receivable'),
  account('1120', 'Withholding tax receivable', 'asset', 'withholding_tax_receivable'),
  account('1130', 'Input VAT receivable', 'asset', 'input_vat_receivable'),
  account('1200', 'Inventory', 'asset', 'inventory'),
  account('2000', 'Accounts payable', 'liability', 'accounts_payable'),
  account('2010', 'Goods received, not invoiced', 'liability', 'goods_received_not_invoiced'),
  account('2100', 'Output VAT payable', 'liability', 'output_vat_payable'),
  account('2110', 'Withholding tax payable', 'liability', 'withholding_tax_payable'),
  account('3000', 'Owner equity', 'equity', 'equity'),
  account('4000', 'Revenue', 'income', 'revenue'),
  account('4200', 'Inventory adjustment gain', 'income', 'inventory_adjustment_gain'),
  account('5000', 'Cost of sales', 'expense', 'cost_of_sales'),
  account('5100', 'Inventory consumption', 'expense', 'inventory_consumption'),
  account('6000', 'Operating expenses', 'expense', 'operating_expense'),
  account('6100', 'Inventory adjustment loss', 'expense', 'inventory_adjustment_loss'),
])

export const CASH_ACCOUNTS = Object.freeze([
  Object.freeze({ name: 'Main cash account', account_kind: 'cash', ledger_code: '1000' }),
  Object.freeze({ name: 'Operating bank', account_kind: 'bank', ledger_code: '1010' }),
])

// The seed has only PCS. The only screen that creates units is the material-item
// form (one per item), so the common construction units are provided up front.
export const UNITS_OF_MEASURE = Object.freeze(
  [
    ['PCS', 'Pieces', 0],
    ['SET', 'Sets', 0],
    ['LOT', 'Lots', 0],
    ['BAG', 'Bags', 0],
    ['BOX', 'Boxes', 0],
    ['ROLL', 'Rolls', 0],
    ['M', 'Meters', 2],
    ['SQM', 'Square meters', 2],
    ['CUM', 'Cubic meters', 2],
    ['KG', 'Kilograms', 2],
    ['L', 'Liters', 2],
  ].map(([code, name, decimal_places]) =>
    Object.freeze({ code, name, decimal_places })
  )
)

// PROPOSED spellings (alias, unit code) that purchase orders and BOMs use for the
// units above. Needs the trial company's sign-off before --apply on a customer
// tenant: an alias says two spellings are the same goods, which is business data.
// Anything not listed stays unlinked and is fixed by hand on the PO page. An alias
// equal to a unit code is never needed: the code is matched first.
export const UNIT_ALIASES = Object.freeze(
  [
    ['pc', 'PCS'],
    ['pc.', 'PCS'],
    ['pcs.', 'PCS'],
    ['piece', 'PCS'],
    ['pieces', 'PCS'],
    ['ea', 'PCS'],
    ['each', 'PCS'],
    ['nos', 'PCS'],
    ['sets', 'SET'],
    ['lots', 'LOT'],
    ['ls', 'LOT'],
    ['lump sum', 'LOT'],
    ['lumpsum', 'LOT'],
    ['bags', 'BAG'],
    ['boxes', 'BOX'],
    ['rolls', 'ROLL'],
    ['meter', 'M'],
    ['meters', 'M'],
    ['metre', 'M'],
    ['metres', 'M'],
    ['lm', 'M'],
    ['l.m.', 'M'],
    ['sq.m', 'SQM'],
    ['sq.m.', 'SQM'],
    ['sq m', 'SQM'],
    ['m2', 'SQM'],
    ['cu.m', 'CUM'],
    ['cu.m.', 'CUM'],
    ['cu m', 'CUM'],
    ['m3', 'CUM'],
    ['kgs', 'KG'],
    ['kg.', 'KG'],
    ['kilo', 'KG'],
    ['kilos', 'KG'],
    ['kilogram', 'KG'],
    ['kilograms', 'KG'],
    ['liter', 'L'],
    ['liters', 'L'],
    ['litre', 'L'],
    ['litres', 'L'],
    ['ltr', 'L'],
  ].map(([alias, uom_code]) => Object.freeze({ alias, uom_code }))
)

const DEFAULT_WAREHOUSE_CODE = 'MAIN'
const WAREHOUSE_CODE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/

// Generic cost codes from supabase/seed.sql (no project-specific ones).
export const COST_CODES = Object.freeze(
  [
    ['MAT', 'Materials', 'material'],
    ['LAB', 'Labour', 'labour'],
    ['SUB', 'Subcontractors', 'subcontractor'],
    ['EQP', 'Equipment', 'equipment'],
    ['OHD', 'Project overhead', 'overhead'],
    ['OTH', 'Other project cost', 'other'],
  ].map(([code, name, category]) => Object.freeze({ code, name, category }))
)

/** Calendar year in Asia/Manila, so a run just after midnight PHT still picks the local year. */
export function manilaYear(now = new Date()) {
  return Number(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Manila',
      year: 'numeric',
    }).format(now)
  )
}

export function parseBootstrapArgs(argv, now = new Date()) {
  let values
  try {
    ;({ values } = parseArgs({
      args: argv,
      options: {
        'tenant-id': { type: 'string' },
        'fiscal-year': { type: 'string' },
        'actor-user-id': { type: 'string' },
        warehouse: { type: 'string' },
        apply: { type: 'boolean', default: false },
      },
      strict: true,
      allowPositionals: false,
    }))
  } catch (error) {
    throw new Error(`${error.message}\n\n${USAGE}`)
  }

  const tenantId = values['tenant-id']?.trim().toLowerCase()
  if (!tenantId || !UUID_PATTERN.test(tenantId)) {
    throw new Error(`--tenant-id <uuid> is required\n\n${USAGE}`)
  }

  const rawYear = values['fiscal-year']?.trim() ?? String(manilaYear(now))
  const fiscalYear = Number(rawYear)
  if (!/^\d{4}$/.test(rawYear) || fiscalYear < 2000 || fiscalYear > 2100) {
    throw new Error(`--fiscal-year must be a four digit year (2000-2100)\n\n${USAGE}`)
  }

  const rawActor = values['actor-user-id']?.trim().toLowerCase()
  if (rawActor !== undefined && !UUID_PATTERN.test(rawActor)) {
    throw new Error(`--actor-user-id must be a UUID\n\n${USAGE}`)
  }

  const rawWarehouse = values.warehouse?.trim()
  if (rawWarehouse !== undefined && !WAREHOUSE_CODE_PATTERN.test(rawWarehouse)) {
    throw new Error(
      `--warehouse must be 1-40 letters, digits, dots, dashes or underscores\n\n${USAGE}`
    )
  }

  return {
    tenantId,
    fiscalYear,
    actorUserId: rawActor ?? null,
    warehouseCode: (rawWarehouse ?? DEFAULT_WAREHOUSE_CODE).toUpperCase(),
    warehouseExplicit: rawWarehouse !== undefined,
    apply: values.apply,
  }
}

/** Desired rows for one tenant. The same rows feed the report and the inserts. */
export function buildBootstrapPlan({
  fiscalYear,
  warehouseCode = DEFAULT_WAREHOUSE_CODE,
  warehouseExplicit = false,
}) {
  return {
    warehouse: Object.freeze({
      code: warehouseCode,
      name: warehouseCode === DEFAULT_WAREHOUSE_CODE ? 'Main warehouse' : `Warehouse ${warehouseCode}`,
      explicit: warehouseExplicit,
    }),
    unitAliases: UNIT_ALIASES,
    ledgerAccounts: LEDGER_ACCOUNTS,
    fiscalPeriod: Object.freeze({
      name: `FY ${fiscalYear}`,
      starts_on: `${fiscalYear}-01-01`,
      ends_on: `${fiscalYear}-12-31`,
    }),
    cashAccounts: CASH_ACCOUNTS,
    unitsOfMeasure: UNITS_OF_MEASURE,
    costCodes: COST_CODES,
  }
}

const normalizeName = (value) => value.trim().toLowerCase()

function splitByCode(rows, existingRows) {
  const taken = new Set(existingRows.map((row) => row.code.toLowerCase()))
  const split = { insert: [], present: [] }
  for (const row of rows) {
    if (taken.has(row.code.toLowerCase())) split.present.push({ row, reason: 'code exists' })
    else split.insert.push(row)
  }
  return split
}

/**
 * Splits the plan into rows to insert and rows that already exist, using the
 * same natural keys as the unique indexes (ledger code and system key, fiscal
 * period name and date overlap, cash account name and ledger account, unit and
 * cost code case-insensitive code). Never proposes an update.
 *
 * `existing` shape (all rows of the one tenant):
 *   ledgerAccounts [{ code, system_key }], fiscalPeriods [{ name, starts_on, ends_on }],
 *   cashAccounts [{ name, ledger_code }], unitsOfMeasure [{ code }], costCodes [{ code }],
 *   warehouses [{ code }], unitAliases [{ alias }] (null: the table does not exist yet)
 */
export function diffBootstrapPlan(plan, existing) {
  const conflicts = []

  const codes = new Set(existing.ledgerAccounts.map((row) => row.code))
  const keyOwners = new Map(
    existing.ledgerAccounts
      .filter((row) => row.system_key)
      .map((row) => [row.system_key, row.code])
  )
  const ledger = { insert: [], present: [] }
  for (const row of plan.ledgerAccounts) {
    if (codes.has(row.code)) {
      ledger.present.push({ row, reason: 'code exists' })
    } else if (row.system_key && keyOwners.has(row.system_key)) {
      ledger.present.push({
        row,
        reason: `system key already on account ${keyOwners.get(row.system_key)}`,
      })
    } else {
      ledger.insert.push(row)
    }
  }
  const finalCodes = new Set([...codes, ...ledger.insert.map((row) => row.code)])
  const finalKeys = new Set([
    ...keyOwners.keys(),
    ...ledger.insert.map((row) => row.system_key).filter(Boolean),
  ])
  for (const key of REQUIRED_SYSTEM_KEYS) {
    if (finalKeys.has(key)) continue
    const wanted = plan.ledgerAccounts.find((row) => row.system_key === key)
    conflicts.push(
      `System key "${key}" has no account: code ${wanted?.code ?? '?'} is taken by an account without that key. Resolve by hand; the script never edits existing accounts.`
    )
  }

  const period = plan.fiscalPeriod
  const fiscal = { insert: [], present: [] }
  const sameName = existing.fiscalPeriods.find((row) => row.name === period.name)
  const overlapping = existing.fiscalPeriods.find(
    (row) => period.starts_on <= row.ends_on && period.ends_on >= row.starts_on
  )
  if (sameName) {
    fiscal.present.push({ row: period, reason: 'name exists' })
  } else if (overlapping) {
    fiscal.present.push({
      row: period,
      reason: `overlaps existing period ${overlapping.name}`,
    })
  } else {
    fiscal.insert.push(period)
  }

  const cashNames = new Set(existing.cashAccounts.map((row) => normalizeName(row.name)))
  const cashLedgers = new Set(existing.cashAccounts.map((row) => row.ledger_code))
  const cash = { insert: [], present: [] }
  for (const row of plan.cashAccounts) {
    if (cashNames.has(normalizeName(row.name)) || cashLedgers.has(row.ledger_code)) {
      cash.present.push({ row, reason: 'name or ledger account already has a cash account' })
    } else if (!finalCodes.has(row.ledger_code)) {
      conflicts.push(`Cash account "${row.name}" needs ledger account ${row.ledger_code}, which does not exist.`)
    } else {
      cash.insert.push(row)
    }
  }

  const units = splitByCode(plan.unitsOfMeasure, existing.unitsOfMeasure)

  return {
    ledgerAccounts: ledger,
    fiscalPeriod: fiscal,
    cashAccounts: cash,
    unitsOfMeasure: units,
    unitAliases: diffUnitAliases(plan.unitAliases, existing, units),
    warehouse: diffWarehouse(plan.warehouse, existing.warehouses),
    costCodes: splitByCode(plan.costCodes, existing.costCodes),
    conflicts,
  }
}

/**
 * An alias is only inserted for a unit the tenant will have, never over a unit
 * code (the code is matched first) and never twice. `existing.unitAliases` is
 * null while the unit_aliases table has not been created yet.
 */
function diffUnitAliases(aliases, existing, units) {
  const unitCodes = new Set(
    [...existing.unitsOfMeasure, ...units.insert].map((row) => row.code.toLowerCase())
  )
  const taken = new Set((existing.unitAliases ?? []).map((row) => row.alias.toLowerCase()))
  const split = { insert: [], present: [] }
  for (const row of aliases) {
    const alias = row.alias.toLowerCase()
    let reason = null
    if (existing.unitAliases == null) {
      reason = 'unit_aliases table not created yet; apply migration 20261118100000 first'
    } else if (unitCodes.has(alias)) {
      reason = 'already a unit code'
    } else if (taken.has(alias)) {
      reason = 'alias exists'
    } else if (!unitCodes.has(row.uom_code.toLowerCase())) {
      reason = `unit ${row.uom_code} does not exist`
    }
    if (reason) split.present.push({ row, reason })
    else split.insert.push(row)
  }
  return split
}

/** One warehouse: by code, or (no --warehouse given) only for a tenant with none. */
function diffWarehouse(warehouse, existingWarehouses = []) {
  const split = { insert: [], present: [] }
  if (existingWarehouses.some((row) => row.code.toLowerCase() === warehouse.code.toLowerCase())) {
    split.present.push({ row: warehouse, reason: 'code exists' })
  } else if (!warehouse.explicit && existingWarehouses.length > 0) {
    split.present.push({ row: warehouse, reason: 'tenant already has a warehouse' })
  } else {
    split.insert.push(warehouse)
  }
  return split
}

const SECTIONS = [
  ['ledgerAccounts', 'Ledger accounts', (r) => `${r.code} ${r.name} [${r.account_type}/${r.normal_balance}]${r.system_key ? ` key=${r.system_key}` : ''}`],
  ['fiscalPeriod', 'Fiscal period', (r) => `${r.name} ${r.starts_on}..${r.ends_on} open`],
  ['cashAccounts', 'Cash accounts', (r) => `${r.name} (${r.account_kind}) on ledger ${r.ledger_code}`],
  ['unitsOfMeasure', 'Units of measure', (r) => `${r.code} ${r.name} (${r.decimal_places} dp)`],
  ['unitAliases', 'Unit aliases', (r) => `${r.alias} -> ${r.uom_code}`],
  ['warehouse', 'Warehouse', (r) => `${r.code} ${r.name}`],
  ['costCodes', 'Cost codes', (r) => `${r.code} ${r.name} (${r.category})`],
]

export function formatBootstrapReport(diff, context) {
  const lines = [
    `Tenant:      ${context.tenantName} (${context.tenantId})`,
    `Fiscal year: ${context.fiscalYear}`,
    `Actor:       ${context.actorUserId} (${context.actorSource})`,
    `Mode:        ${context.apply ? 'APPLY' : 'DRY RUN (nothing is written)'}`,
  ]
  for (const [key, title, describe] of SECTIONS) {
    const { insert, present } = diff[key]
    lines.push('', `${title}: insert ${insert.length}, already present ${present.length}`)
    for (const row of insert) lines.push(`  + ${describe(row)}`)
    for (const { row, reason } of present) lines.push(`  = ${describe(row)} (${reason})`)
  }
  if (diff.conflicts.length > 0) {
    lines.push('', `CONFLICTS (${diff.conflicts.length}), apply will refuse:`)
    for (const conflict of diff.conflicts) lines.push(`  ! ${conflict}`)
  }
  return lines
}
