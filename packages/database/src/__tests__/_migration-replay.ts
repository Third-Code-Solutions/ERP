/**
 * Static replay of supabase/migrations, used by tests that must know which
 * public tables the migrations leave behind (client-table-read-privileges).
 *
 * It is a statement-level replay, not a database: comments and dollar-quoted
 * bodies are skipped, `create table`, `drop table` and `alter table ... rename`
 * are applied in filename order, and nothing is executed. Tables are created
 * with plain DDL in this repo (no migration builds table names dynamically),
 * which a test asserts so a future dynamic builder cannot slip past it.
 */
import { readdirSync, readFileSync } from 'node:fs'

const MIGRATIONS_DIR = new URL('../../../../supabase/migrations/', import.meta.url)

export function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith('.sql'))
    .sort()
}

export function readMigration(name: string): string {
  return readFileSync(new URL(name, MIGRATIONS_DIR), 'utf8')
}

/** Remove `--` and block comments outside string literals and dollar quotes. */
export function stripSqlComments(sql: string): string {
  let out = ''
  let index = 0
  let quoted = false
  let dollar: string | null = null
  while (index < sql.length) {
    const rest = sql.slice(index, index + 40)
    if (dollar !== null) {
      if (sql.startsWith(dollar, index)) {
        out += dollar
        index += dollar.length
        dollar = null
      } else {
        out += sql[index++]
      }
      continue
    }
    if (quoted) {
      if (sql[index] === "'" && sql[index + 1] === "'") {
        out += "''"
        index += 2
        continue
      }
      if (sql[index] === "'") quoted = false
      out += sql[index++]
      continue
    }
    if (sql[index] === "'") {
      quoted = true
      out += sql[index++]
      continue
    }
    const tag = /^\$[A-Za-z_]*\$/.exec(rest)
    if (tag) {
      dollar = tag[0]
      out += tag[0]
      index += tag[0].length
      continue
    }
    if (sql[index] === '-' && sql[index + 1] === '-') {
      while (index < sql.length && sql[index] !== '\n') index += 1
      continue
    }
    if (sql[index] === '/' && sql[index + 1] === '*') {
      const end = sql.indexOf('*/', index + 2)
      index = end < 0 ? sql.length : end + 2
      continue
    }
    out += sql[index++]
  }
  return out
}

/** Split on `;` outside string literals and dollar quotes. Input must be comment-free. */
export function splitSqlStatements(sql: string): string[] {
  const statements: string[] = []
  let current = ''
  let index = 0
  let quoted = false
  let dollar: string | null = null
  while (index < sql.length) {
    if (dollar !== null) {
      if (sql.startsWith(dollar, index)) {
        current += dollar
        index += dollar.length
        dollar = null
      } else {
        current += sql[index++]
      }
      continue
    }
    if (quoted) {
      if (sql[index] === "'" && sql[index + 1] === "'") {
        current += "''"
        index += 2
        continue
      }
      if (sql[index] === "'") quoted = false
      current += sql[index++]
      continue
    }
    if (sql[index] === "'") {
      quoted = true
      current += sql[index++]
      continue
    }
    const tag = /^\$[A-Za-z_]*\$/.exec(sql.slice(index, index + 40))
    if (tag) {
      dollar = tag[0]
      current += tag[0]
      index += tag[0].length
      continue
    }
    if (sql[index] === ';') {
      if (current.trim()) statements.push(current.trim())
      current = ''
      index += 1
      continue
    }
    current += sql[index++]
  }
  if (current.trim()) statements.push(current.trim())
  return statements
}

/** `public.name`, `"name"` or `name`: the table name when it is in `public`, else null. */
function publicName(raw: string): string | null {
  const cleaned = raw.replace(/"/g, '').toLowerCase()
  if (!cleaned.includes('.')) return cleaned
  const [schema, name] = cleaned.split('.')
  return schema === 'public' && name ? name : null
}

const TABLE_NAME = '((?:"?[a-z_0-9]+"?\\.)?"?[a-z_0-9]+"?)'
const CREATE_TABLE = new RegExp(`^create table (?:if not exists )?${TABLE_NAME}`, 'i')
const DROP_TABLE = /^drop table (?:if exists )?(.+?)(?: cascade| restrict)?$/i
const RENAME_TABLE = new RegExp(
  `^alter table (?:if exists )?(?:only )?${TABLE_NAME} rename to ("?[a-z_0-9]+"?)$`,
  'i'
)

/**
 * Public tables left by the migrations in filename order, in creation order.
 * `throughFile` stops after that file (inclusive); omit it to replay everything.
 */
export function replayPublicTables(throughFile?: string): string[] {
  const tables = new Set<string>()
  for (const file of migrationFiles()) {
    const statements = splitSqlStatements(stripSqlComments(readMigration(file)))
    for (const statement of statements) {
      const text = statement.replace(/\s+/g, ' ')
      const created = CREATE_TABLE.exec(text)
      if (created) {
        const name = publicName(created[1]!)
        if (name) tables.add(name)
        continue
      }
      const dropped = DROP_TABLE.exec(text)
      if (dropped) {
        for (const piece of dropped[1]!.split(',')) {
          const name = publicName(piece.trim())
          if (name) tables.delete(name)
        }
        continue
      }
      const renamed = RENAME_TABLE.exec(text)
      if (renamed) {
        const from = publicName(renamed[1]!)
        const to = renamed[2]!.replace(/"/g, '').toLowerCase()
        if (from && tables.delete(from)) tables.add(to)
      }
    }
    if (file === throughFile) break
  }
  return [...tables]
}
