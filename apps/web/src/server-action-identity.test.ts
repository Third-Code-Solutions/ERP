import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

// SEC-10: every export of a 'use server' module is a callable action, so a
// caller can pass any value. Identity must come from the session inside the
// action, never from a parameter.
const IDENTITY_PARAMS = new Set(['tenantId', 'actorId', 'userId', 'role'])
const SRC_DIR = fileURLToPath(new URL('.', import.meta.url))

function isUseServerModule(sourceFile: ts.SourceFile): boolean {
  for (const statement of sourceFile.statements) {
    if (!ts.isExpressionStatement(statement) || !ts.isStringLiteral(statement.expression)) {
      return false
    }
    if (statement.expression.text === 'use server') return true
  }
  return false
}

function hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
  return ts.canHaveModifiers(node) && (ts.getModifiers(node) ?? []).some((m) => m.kind === kind)
}

function bindingNames(name: ts.BindingName): string[] {
  if (ts.isIdentifier(name)) return [name.text]
  return name.elements.flatMap((element) =>
    ts.isOmittedExpression(element) ? [] : bindingNames(element.name)
  )
}

// `export type { … }`, `export { type A }` and `export {}` expose no runtime value.
function exportsValues(statement: ts.ExportDeclaration): boolean {
  const clause = statement.exportClause
  if (statement.isTypeOnly) return false
  return !(clause && ts.isNamedExports(clause) && clause.elements.every((e) => e.isTypeOnly))
}

// Reads the leading string tokens unescaped, so 'use\x20server' is still found.
function hasLeadingUseServer(sourceText: string): boolean {
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, true, ts.LanguageVariant.Standard, sourceText)
  let token = scanner.scan()
  while (token === ts.SyntaxKind.StringLiteral) {
    if (scanner.getTokenValue() === 'use server') return true
    token = scanner.scan()
    if (token === ts.SyntaxKind.SemicolonToken) token = scanner.scan()
  }
  return false
}

// Returns null for modules that are not 'use server', so callers can count what was scanned.
function findIdentityParams(fileName: string, sourceText: string): string[] | null {
  // Cheap token check first: parsing every source file made a cold run take ~50 s.
  if (!hasLeadingUseServer(sourceText)) return null
  const sourceFile = ts.createSourceFile(fileName, sourceText, ts.ScriptTarget.Latest, true)
  if (!isUseServerModule(sourceFile)) return null

  const findings: string[] = []
  const check = (exportName: string, params: ts.NodeArray<ts.ParameterDeclaration>) => {
    for (const param of params) {
      for (const name of bindingNames(param.name)) {
        if (IDENTITY_PARAMS.has(name)) findings.push(`${fileName}: ${exportName}(${name})`)
      }
    }
  }

  for (const statement of sourceFile.statements) {
    // Re-exports and default expressions hide the signature from this scan, so ban them here.
    if ((ts.isExportDeclaration(statement) && exportsValues(statement)) || ts.isExportAssignment(statement)) {
      findings.push(`${fileName}: ${statement.getText(sourceFile)}`)
      continue
    }
    if (!hasModifier(statement, ts.SyntaxKind.ExportKeyword)) continue
    if (ts.isFunctionDeclaration(statement)) {
      check(statement.name?.text ?? 'default', statement.parameters)
    } else if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        const name = declaration.name.getText(sourceFile)
        const init = declaration.initializer
        if (init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init))) {
          check(name, init.parameters)
        } else {
          // An alias or wrapper (`= loadVo`, `= withTrace(fn)`) hides the signature from this scan.
          findings.push(`${fileName}: ${name} is not a function literal`)
        }
      }
    } else if (
      !ts.isInterfaceDeclaration(statement) &&
      !ts.isTypeAliasDeclaration(statement) &&
      !hasModifier(statement, ts.SyntaxKind.DeclareKeyword)
    ) {
      // Allowlist: `export import x = Q.reader` and other forms also become actions.
      findings.push(`${fileName}: export ${ts.SyntaxKind[statement.kind]}`)
    }
  }
  return findings
}

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : sourceFiles(path)
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : []
  })
}

describe('server action identity (SEC-10)', () => {
  it('flags identity parameters on exports of use-server modules only', () => {
    const source = [
      "'use server'",
      'export async function listRows(projectId: string, tenantId: string) {}',
      'export const load = async ({ userId }: { userId: string }) => {}',
      'export const remove = function (id: string, [actorId, role]: string[]) {}',
      'export const traced = withTrace(async (tenantId: string) => {})',
      'async function internal(tenantId: string) {}',
      'export const alias = internal',
      'export { internal }',
      'export default internal',
      'export import aliased = Q.loadVo',
      'export interface Shape { tenantId: string }',
      'export type Scope = { tenantId: string }',
      'export type { Row } from "./types"',
      'export { type Col } from "./types"',
      'export {}',
      'export async function safe(formData: FormData): Promise<{ tenantId?: string }> { return {} }',
    ].join('\n')

    expect(findIdentityParams('fixture.ts', source)).toEqual([
      'fixture.ts: listRows(tenantId)',
      'fixture.ts: load(userId)',
      'fixture.ts: remove(actorId)',
      'fixture.ts: remove(role)',
      'fixture.ts: traced is not a function literal',
      'fixture.ts: alias is not a function literal',
      'fixture.ts: export { internal }',
      'fixture.ts: export default internal',
      'fixture.ts: export ImportEqualsDeclaration',
    ])
    // Passes the token check but is an expression, not a directive.
    expect(
      findIdentityParams('expr.ts', "'use server' + suffix\nexport async function read(tenantId: string) {}")
    ).toBeNull()
    expect(
      findIdentityParams('plain.ts', 'export async function read(tenantId: string) {}')
    ).toBeNull()
    // An escaped directive is still a directive to Next.js.
    expect(
      findIdentityParams('escaped.ts', "// note\n'use\\x20server';\nexport async function read(tenantId: string) {}")
    ).toEqual(['escaped.ts: read(tenantId)'])
  })

  it('finds no use-server export that takes identity from the caller', () => {
    const actionModules = sourceFiles(SRC_DIR).flatMap((path) => {
      const name = relative(SRC_DIR, path).split('\\').join('/')
      const findings = findIdentityParams(name, readFileSync(path, 'utf8'))
      return findings === null ? [] : [{ name, findings }]
    })

    // Guard against a vacuous pass if the walk or the directive check breaks.
    expect(actionModules.map((m) => m.name)).toContain('app/(dashboard)/projects/[id]/vos/actions.ts')
    expect(actionModules.length).toBeGreaterThan(50)
    expect(actionModules.flatMap((m) => m.findings)).toEqual([])
  }, 30_000)
})
