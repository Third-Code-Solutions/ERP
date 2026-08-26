import { createRequire } from 'node:module'
import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const requireFromDatabasePackage = createRequire(
  new URL('../../packages/database/package.json', import.meta.url)
)
const scriptPath = fileURLToPath(import.meta.url)
const repositoryRoot = resolve(join(scriptPath, '..', '..', '..'))

const monetaryNamePattern =
  /(?:cost|price|rate|amount|total|centavos|value)/i
const forbiddenMonetaryTypePattern =
  /\b(?:double\s+precision|real|float(?:\s*\([^)]*\))?)\b/i
const numericTypePattern = /\b(?:numeric|decimal)\b/i
const scaledNumericPattern = /\b(?:numeric|decimal)\s*\(\s*\d+\s*,\s*\d+\s*\)/i
const tableConstraintPattern =
  /^(?:constraint\b|primary\s+key\b|foreign\s+key\b|unique\b|check\b|exclude\b|like\b)/i
const rootGlobalTableNames = new Set(['tenants'])
const approvedPlatformGlobalTableNames = new Set([
  'platform_demo_requests',
  'platform_audit_log',
])
const clientDatabaseRoles = new Set(['public', 'anon', 'authenticated'])

function maskSql(source) {
  let output = ''
  let index = 0
  let state = 'normal'
  let dollarTag = ''

  while (index < source.length) {
    const current = source[index]
    const next = source[index + 1]

    if (state === 'line-comment') {
      output += current === '\n' ? '\n' : ' '
      if (current === '\n') state = 'normal'
      index += 1
      continue
    }

    if (state === 'block-comment') {
      if (current === '*' && next === '/') {
        output += '  '
        index += 2
        state = 'normal'
      } else {
        output += current === '\n' ? '\n' : ' '
        index += 1
      }
      continue
    }

    if (state === 'single-quote') {
      if (current === "'" && next === "'") {
        output += '  '
        index += 2
      } else {
        output += current === '\n' ? '\n' : ' '
        index += 1
        if (current === "'") state = 'normal'
      }
      continue
    }

    if (state === 'dollar-quote') {
      if (source.startsWith(dollarTag, index)) {
        output += ' '.repeat(dollarTag.length)
        index += dollarTag.length
        state = 'normal'
        dollarTag = ''
      } else {
        output += current === '\n' ? '\n' : ' '
        index += 1
      }
      continue
    }

    if (current === '-' && next === '-') {
      output += '  '
      index += 2
      state = 'line-comment'
      continue
    }

    if (current === '/' && next === '*') {
      output += '  '
      index += 2
      state = 'block-comment'
      continue
    }

    if (current === "'") {
      output += ' '
      index += 1
      state = 'single-quote'
      continue
    }

    if (current === '$') {
      const tagMatch = source.slice(index).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/)
      if (tagMatch) {
        dollarTag = tagMatch[0]
        output += ' '.repeat(dollarTag.length)
        index += dollarTag.length
        state = 'dollar-quote'
        continue
      }
    }

    output += current
    index += 1
  }

  return output
}

function splitTopLevel(source) {
  const parts = []
  let start = 0
  let depth = 0
  let inDoubleQuote = false

  for (let index = 0; index < source.length; index += 1) {
    const current = source[index]
    const next = source[index + 1]

    if (inDoubleQuote) {
      if (current === '"' && next === '"') {
        index += 1
      } else if (current === '"') {
        inDoubleQuote = false
      }
      continue
    }

    if (current === '"') {
      inDoubleQuote = true
    } else if (current === '(') {
      depth += 1
    } else if (current === ')') {
      depth -= 1
    } else if (current === ',' && depth === 0) {
      parts.push(source.slice(start, index))
      start = index + 1
    }
  }

  parts.push(source.slice(start))
  return parts
}

function unquoteIdentifier(value) {
  return value.trim().replace(/^"|"$/g, '').replace(/""/g, '"')
}

function extractIdentifier(source) {
  const match = source.match(/^\s*("(?:""|[^"])+"|[A-Za-z_][A-Za-z0-9_$]*)/)
  return match ? { name: unquoteIdentifier(match[1]), end: match[0].length } : null
}

function lineNumber(source, offset) {
  return source.slice(0, offset).split('\n').length
}

function parseColumnDefinition(definition) {
  const identifier = extractIdentifier(definition)
  if (!identifier || tableConstraintPattern.test(definition.trim())) return null

  const remainder = definition.slice(identifier.end).trim()
  const typeMatch = remainder.match(
    /^(?:"(?:""|[^"])+"|[A-Za-z_][A-Za-z0-9_$]*)(?:\s+precision)?(?:\s*\([^)]*\))?/i
  )

  return {
    name: identifier.name,
    definition: remainder,
    type: typeMatch?.[0] ?? '',
    notNull: /\bnot\s+null\b/i.test(remainder),
  }
}

function findMatchingParenthesis(source, openingIndex) {
  let depth = 0
  let inDoubleQuote = false

  for (let index = openingIndex; index < source.length; index += 1) {
    const current = source[index]
    const next = source[index + 1]

    if (inDoubleQuote) {
      if (current === '"' && next === '"') index += 1
      else if (current === '"') inDoubleQuote = false
      continue
    }

    if (current === '"') inDoubleQuote = true
    else if (current === '(') depth += 1
    else if (current === ')') {
      depth -= 1
      if (depth === 0) return index
    }
  }

  return -1
}

function parseCreateTables(source) {
  const masked = maskSql(source)
  const tables = []
  const expression =
    /\bcreate\s+table\s+(?:if\s+not\s+exists\s+)?(?:(?:"(?:""|[^"])+"|[A-Za-z_][A-Za-z0-9_$]*)\s*\.\s*)?("(?:""|[^"])+"|[A-Za-z_][A-Za-z0-9_$]*)\s*\(/gi

  for (const match of masked.matchAll(expression)) {
    const openingIndex = (match.index ?? 0) + match[0].lastIndexOf('(')
    const closingIndex = findMatchingParenthesis(masked, openingIndex)
    if (closingIndex === -1) continue

    const definitionSource = masked.slice(openingIndex + 1, closingIndex)
    const columns = splitTopLevel(definitionSource)
      .map(parseColumnDefinition)
      .filter(Boolean)

    tables.push({
      name: unquoteIdentifier(match[1]),
      columns,
      offset: match.index ?? 0,
    })
  }

  return tables
}

function parseAddedColumns(source) {
  const masked = maskSql(source)
  const columns = []
  const statementExpression = /\balter\s+table\b[\s\S]*?(?:;|$)/gi

  for (const statementMatch of masked.matchAll(statementExpression)) {
    const statement = statementMatch[0]
    const addColumnIndex = statement.search(/\badd\s+column\b/i)
    if (addColumnIndex === -1) continue

    const definitions = splitTopLevel(statement.slice(addColumnIndex))
    for (const definition of definitions) {
      const normalized = definition.replace(
        /^\s*add\s+column\s+(?:if\s+not\s+exists\s+)?/i,
        ''
      )
      if (normalized === definition) continue
      const column = parseColumnDefinition(normalized)
      if (column) {
        columns.push({
          ...column,
          offset: (statementMatch.index ?? 0) + addColumnIndex,
        })
      }
    }
  }

  return columns
}

function escapeRegularExpression(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function tableExpression(tableName) {
  const escapedTableName = escapeRegularExpression(tableName)
  return `(?:public\\s*\\.\\s*)?${escapedTableName}`
}

function statementMentionsClientRole(statement, roleKeyword) {
  const roleMatch = statement.match(
    new RegExp(`\\b${roleKeyword}\\s+([^;]+?)(?:\\s*;)?\\s*$`, 'i')
  )
  if (!roleMatch) return roleKeyword === 'to'

  return roleMatch[1]
    .split(',')
    .map((role) => role.trim().replace(/^"|"$/g, '').toLowerCase())
    .some((role) => clientDatabaseRoles.has(role))
}

function hasRequiredClientRevoke(maskedSource, tableName) {
  const expression = new RegExp(
    `\\brevoke\\s+all(?:\\s+privileges)?\\s+on\\s+table\\s+${tableExpression(tableName)}\\s+from\\s+([^;]+);`,
    'gi'
  )

  for (const match of maskedSource.matchAll(expression)) {
    const roles = new Set(
      match[1]
        .split(',')
        .map((role) => role.trim().replace(/^"|"$/g, '').toLowerCase())
    )
    if ([...clientDatabaseRoles].every((role) => roles.has(role))) return true
  }
  return false
}

function hasClientGrant(maskedSource, tableName) {
  return findClientGrant(maskedSource, tableName) !== null
}

function findClientGrant(maskedSource, tableName) {
  const expression = new RegExp(
    `\\bgrant\\b[\\s\\S]*?\\bon\\s+table\\s+${tableExpression(tableName)}\\s+to\\s+([^;]+);`,
    'gi'
  )
  return [...maskedSource.matchAll(expression)].find((match) =>
    match[1]
      .split(',')
      .map((role) => role.trim().replace(/^"|"$/g, '').toLowerCase())
      .some((role) => clientDatabaseRoles.has(role))
  ) ?? null
}

function hasClientPolicy(maskedSource, tableName) {
  return findClientPolicy(maskedSource, tableName) !== null
}

function findClientPolicy(maskedSource, tableName) {
  const expression = new RegExp(
    `\\bcreate\\s+policy\\b[\\s\\S]*?\\bon\\s+${tableExpression(tableName)}\\b[\\s\\S]*?;`,
    'gi'
  )
  return [...maskedSource.matchAll(expression)].find((match) => {
    const statement = match[0]
    return statementMentionsClientRole(statement, 'to')
  }) ?? null
}

function clientAccessOffset(maskedSource, tableName) {
  const matches = [
    findClientGrant(maskedSource, tableName),
    findClientPolicy(maskedSource, tableName),
  ].filter((match) => match !== null)
  return matches.reduce(
    (first, match) => Math.min(first, match.index ?? Number.MAX_SAFE_INTEGER),
    Number.MAX_SAFE_INTEGER
  )
}

function rlsWeakeningOffset(maskedSource, tableName) {
  const expression = new RegExp(
    `\\balter\\s+table\\s+(?:if\\s+exists\\s+)?(?:only\\s+)?${tableExpression(tableName)}\\s+(?:disable\\s+row\\s+level\\s+security|no\\s+force\\s+row\\s+level\\s+security)\\s*;`,
    'gi'
  )
  return expression.exec(maskedSource)?.index ?? Number.MAX_SAFE_INTEGER
}

function hasEnabledAndForcedRls(maskedSource, tableName) {
  const table = tableExpression(tableName)
  const enable = new RegExp(
    `\\balter\\s+table\\s+${table}\\s+enable\\s+row\\s+level\\s+security\\s*;`,
    'i'
  )
  const force = new RegExp(
    `\\balter\\s+table\\s+${table}\\s+force\\s+row\\s+level\\s+security\\s*;`,
    'i'
  )
  return enable.test(maskedSource) && force.test(maskedSource)
}

function hasRejectingPlatformAuditTrigger(maskedSource, source) {
  const trigger = /\bcreate\s+trigger\s+(?:"[^"]+"|[a-z_][a-z0-9_$]*)\s+before\s+update\s+or\s+delete\s+on\s+(?:public\s*\.\s*)?platform_audit_log\b[\s\S]*?\bexecute\s+function\s+public\s*\.\s*reject_platform_audit_mutation\s*\(\s*\)\s*;/i
  if (!trigger.test(maskedSource)) return false

  const functionBody = /\bcreate\s+(?:or\s+replace\s+)?function\s+public\s*\.\s*reject_platform_audit_mutation\s*\(\s*\)[\s\S]*?returns\s+trigger[\s\S]*?\$\$([\s\S]*?)\$\$/i.exec(source)?.[1]
  return /\braise\s+exception\b/i.test(functionBody ?? '')
}

function validateApprovedPlatformGlobalTable({ table, source, file, maskedSource }) {
  const violations = []
  const tableName = table.name.toLowerCase()

  if (!hasEnabledAndForcedRls(maskedSource, tableName)) {
    violations.push(
      violation({
        file,
        source,
        offset: table.offset,
        rule: 'platform-global-force-rls',
        message: `Approved platform-global table ${table.name} must enable and force RLS`,
        details: { table: table.name },
      })
    )
  }

  if (
    !hasRequiredClientRevoke(maskedSource, tableName) ||
    hasClientGrant(maskedSource, tableName) ||
    hasClientPolicy(maskedSource, tableName)
  ) {
    violations.push(
      violation({
        file,
        source,
        offset: table.offset,
        rule: 'platform-global-client-access',
        message: `Approved platform-global table ${table.name} must deny direct client access`,
        details: { table: table.name },
      })
    )
  }

  if (
    tableName === 'platform_audit_log' &&
    !hasRejectingPlatformAuditTrigger(maskedSource, source)
  ) {
    violations.push(
      violation({
        file,
        source,
        offset: table.offset,
        rule: 'platform-global-audit-append-only',
        message: 'platform_audit_log must reject UPDATE and DELETE with a BEFORE trigger',
        details: { table: table.name },
      })
    )
  }

  return violations
}

function violation({ file, source, offset, rule, message, details = {} }) {
  return {
    file,
    line: lineNumber(source, offset),
    rule,
    message,
    ...details,
  }
}

export function scanMigrationSource(source, file = '<inline>') {
  const violations = []
  const maskedSource = maskSql(source)
  const createdApprovedPlatformGlobalTables = new Set()

  for (const table of parseCreateTables(source)) {
    const tenantColumn = table.columns.find(
      (column) => column.name.toLowerCase() === 'tenant_id'
    )

    const tableName = table.name.toLowerCase()
    if (approvedPlatformGlobalTableNames.has(tableName)) {
      createdApprovedPlatformGlobalTables.add(tableName)
    }
    if (!tenantColumn || !tenantColumn.notNull) {
      if (approvedPlatformGlobalTableNames.has(tableName)) {
        violations.push(
          ...validateApprovedPlatformGlobalTable({
            table,
            source,
            file,
            maskedSource,
          })
        )
      } else if (!rootGlobalTableNames.has(tableName)) {
        violations.push(
          violation({
            file,
            source,
            offset: table.offset,
            rule: 'tenant-id-not-null',
            message: `CREATE TABLE ${table.name} must declare tenant_id NOT NULL`,
            details: { table: table.name },
          })
        )
      }
    }

    for (const column of table.columns) {
      if (!monetaryNamePattern.test(column.name)) continue
      if (
        forbiddenMonetaryTypePattern.test(column.type) ||
        (numericTypePattern.test(column.type) &&
          !scaledNumericPattern.test(column.type))
      ) {
        violations.push(
          violation({
            file,
            source,
            offset: table.offset,
            rule: 'money-precision',
            message: `Monetary column ${table.name}.${column.name} must not use floating point or unscaled numeric`,
            details: { table: table.name, column: column.name, type: column.type },
          })
        )
      }
    }
  }

  // A platform-global table is normally defined by an older migration. Scan
  // standalone follow-up migrations too, so a later client grant or policy
  // cannot evade ADR-028 by omitting CREATE TABLE from its source file.
  for (const tableName of approvedPlatformGlobalTableNames) {
    if (createdApprovedPlatformGlobalTables.has(tableName)) continue
    const clientAccess = clientAccessOffset(maskedSource, tableName)
    if (clientAccess !== Number.MAX_SAFE_INTEGER) {
      violations.push(
        violation({
          file,
          source,
          offset: clientAccess,
          rule: 'platform-global-client-access',
          message: `Approved platform-global table ${tableName} must deny direct client access`,
          details: { table: tableName },
        })
      )
    }

    const rlsWeakening = rlsWeakeningOffset(maskedSource, tableName)
    if (rlsWeakening !== Number.MAX_SAFE_INTEGER) {
      violations.push(
        violation({
          file,
          source,
          offset: rlsWeakening,
          rule: 'platform-global-force-rls',
          message: `Approved platform-global table ${tableName} must enable and force RLS`,
          details: { table: tableName },
        })
      )
    }
  }

  for (const column of parseAddedColumns(source)) {
    if (!monetaryNamePattern.test(column.name)) continue
    if (
      forbiddenMonetaryTypePattern.test(column.type) ||
      (numericTypePattern.test(column.type) &&
        !scaledNumericPattern.test(column.type))
    ) {
      violations.push(
        violation({
          file,
          source,
          offset: column.offset,
          rule: 'money-precision',
          message: `Added monetary column ${column.name} must not use floating point or unscaled numeric`,
          details: { column: column.name, type: column.type },
        })
      )
    }
  }

  return violations
}

export function scanMigrationDirectory(directory) {
  return readdirSync(directory)
    .filter((name) => name.endsWith('.sql'))
    .sort()
    .flatMap((name) => {
      const file = join(directory, name)
      return scanMigrationSource(readFileSync(file, 'utf8'), file)
    })
}

export function findE2EPrefixViolations(rows, demoTenantIds) {
  const demoIds = new Set(demoTenantIds)
  return rows
    .filter(({ tenantId }) => !demoIds.has(tenantId))
    .flatMap(({ tenantId, table, values }) =>
      Object.entries(values)
        .filter(([, value]) => String(value ?? '').startsWith('E2E_'))
        .map(([column]) => ({
          rule: 'e2e-prefix-non-demo',
          table,
          column,
          tenantId,
        }))
    )
}

function parseList(value) {
  return (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function quoteIdentifier(identifier) {
  return `"${identifier.replaceAll('"', '""')}"`
}

async function scanDatabaseForE2EPrefix() {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) throw new Error('DATABASE_URL is required for --database')

  const demoIds = parseList(process.env.BUILD_OPS_DEMO_TENANT_IDS)
  const demoSlugs = parseList(process.env.BUILD_OPS_DEMO_TENANT_SLUGS)
  if (demoIds.length === 0 && demoSlugs.length === 0) {
    throw new Error(
      'Set BUILD_OPS_DEMO_TENANT_IDS or BUILD_OPS_DEMO_TENANT_SLUGS before --database'
    )
  }

  const postgres = requireFromDatabasePackage('postgres')
  const sql = postgres(databaseUrl, { max: 1, idle_timeout: 5 })
  try {
    const tenants = await sql`
      select id::text as id, slug
      from public.tenants
    `
    const allowedIds = new Set(demoIds)
    for (const tenant of tenants) {
      if (demoSlugs.includes(tenant.slug)) allowedIds.add(tenant.id)
    }

    const missingSlugs = demoSlugs.filter(
      (slug) => !tenants.some((tenant) => tenant.slug === slug)
    )
    if (missingSlugs.length > 0) {
      throw new Error(
        `Configured demo tenant slug(s) not found: ${missingSlugs.join(', ')}`
      )
    }

    const columns = await sql`
      select table_name, column_name, data_type, udt_name
      from information_schema.columns
      where table_schema = 'public'
        and table_name <> 'tenants'
        and column_name <> 'tenant_id'
        and data_type in ('text', 'character varying', 'character', 'json', 'jsonb')
      order by table_name, ordinal_position
    `
    const grouped = new Map()
    for (const column of columns) {
      const list = grouped.get(column.table_name) ?? []
      list.push(column.column_name)
      grouped.set(column.table_name, list)
    }
    const tenantTables = await sql`
      select distinct table_name
      from information_schema.columns
      where table_schema = 'public'
        and column_name = 'tenant_id'
    `
    const tenantTableNames = new Set(tenantTables.map((row) => row.table_name))
    const rows = []
    const allowedIdArray = [...allowedIds]

    for (const [table, tableColumns] of grouped) {
      if (!tenantTableNames.has(table) || tableColumns.length === 0) continue
      const predicates = tableColumns
        .map((column) => `${quoteIdentifier(column)}::text like 'E2E\\_%' escape '\\'`)
        .join(' or ')
      const query = `
        select tenant_id::text as tenant_id
        from public.${quoteIdentifier(table)}
        where not (tenant_id::text = any($1::text[]))
          and (${predicates})
        limit 101
      `
      const matches = await sql.unsafe(query, [allowedIdArray])
      if (matches.length > 0) {
        rows.push({
          rule: 'e2e-prefix-non-demo',
          table,
          count: matches.length,
          truncated: matches.length > 100,
        })
      }
    }

    return rows
  } finally {
    await sql.end({ timeout: 5 })
  }
}

function printViolations(violations) {
  for (const item of violations) {
    const location = `${item.file}:${item.line ?? 0}`
    console.error(`${item.rule} ${location} ${item.message}`)
  }
}

function parseArguments(argv) {
  const args = { database: false, filesList: null, migrationsDir: null }
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--database') args.database = true
    else if (argument === '--files-list') args.filesList = argv[++index]
    else if (argument === '--migrations-dir') args.migrationsDir = argv[++index]
    else throw new Error(`Unknown argument: ${argument}`)
  }
  return args
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArguments(argv)
  const staticViolations = []
  if (args.filesList) {
    const files = readFileSync(resolve(args.filesList), 'utf8')
      .split(/\r?\n/)
      .map((file) => file.trim())
      .filter(Boolean)
      .filter((file) => file.endsWith('.sql'))
    for (const file of files) {
      const absoluteFile = resolve(file)
      staticViolations.push(
        ...scanMigrationSource(readFileSync(absoluteFile, 'utf8'), file)
      )
    }
  } else {
    const directory = resolve(
      args.migrationsDir ?? join(repositoryRoot, 'supabase', 'migrations')
    )
    staticViolations.push(...scanMigrationDirectory(directory))
  }

  if (staticViolations.length > 0) {
    printViolations(staticViolations)
  } else {
    console.log('BUILD OPS static invariants: PASS')
  }

  if (args.database) {
    const dataViolations = await scanDatabaseForE2EPrefix()
    if (dataViolations.length > 0) {
      for (const item of dataViolations) {
        console.error(
          `${item.rule} table=${item.table} count=${item.count}${item.truncated ? ' truncated=true' : ''}`
        )
      }
    } else {
      console.log('BUILD OPS E2E data invariant: PASS')
    }
    return staticViolations.length === 0 && dataViolations.length === 0
  }

  return staticViolations.length === 0
}

if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  main().then((passed) => process.exit(passed ? 0 : 1)).catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  })
}
