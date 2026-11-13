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

function isExported(node: ts.Node): boolean {
  return (
    ts.canHaveModifiers(node) &&
    (ts.getModifiers(node) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
  )
}

function bindingNames(name: ts.BindingName): string[] {
  if (ts.isIdentifier(name)) return [name.text]
  return name.elements.flatMap((element) =>
    ts.isOmittedExpression(element) ? [] : bindingNames(element.name)
  )
}

function findIdentityParams(fileName: string, sourceText: string): string[] {
  const sourceFile = ts.createSourceFile(fileName, sourceText, ts.ScriptTarget.Latest, true)
  if (!isUseServerModule(sourceFile)) return []

  const findings: string[] = []
  const check = (exportName: string, params: ts.NodeArray<ts.ParameterDeclaration>) => {
    for (const param of params) {
      for (const name of bindingNames(param.name)) {
        if (IDENTITY_PARAMS.has(name)) findings.push(`${fileName}: ${exportName}(${name})`)
      }
    }
  }

  for (const statement of sourceFile.statements) {
    if (!isExported(statement)) continue
    if (ts.isFunctionDeclaration(statement) && statement.name) {
      check(statement.name.text, statement.parameters)
    } else if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        const init = declaration.initializer
        if (init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init))) {
          check(declaration.name.getText(sourceFile), init.parameters)
        }
      }
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
      'async function internal(tenantId: string) {}',
      'export async function safe(formData: FormData): Promise<{ tenantId?: string }> { return {} }',
    ].join('\n')

    expect(findIdentityParams('fixture.ts', source)).toEqual([
      'fixture.ts: listRows(tenantId)',
      'fixture.ts: load(userId)',
    ])
    expect(
      findIdentityParams('plain.ts', 'export async function read(tenantId: string) {}')
    ).toEqual([])
  })

  it('finds no use-server export that takes identity from the caller', () => {
    const findings = sourceFiles(SRC_DIR).flatMap((path) =>
      findIdentityParams(
        relative(SRC_DIR, path).split('\\').join('/'),
        readFileSync(path, 'utf8')
      )
    )
    expect(findings).toEqual([])
  })
})
