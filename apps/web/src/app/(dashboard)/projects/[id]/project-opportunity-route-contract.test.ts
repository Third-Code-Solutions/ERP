import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { can } from '@third-code-erp/auth'
import { ERP_ROLES } from '@third-code-erp/shared-types'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

const actionsSource = readFileSync(
  fileURLToPath(new URL('./opportunities/actions.ts', import.meta.url)),
  'utf8'
)
const pageSource = readFileSync(
  fileURLToPath(new URL('./page.tsx', import.meta.url)),
  'utf8'
)

const MUTATION_ROLES = new Set(['owner', 'admin', 'sales'])

function sourceFile(name: string, source: string, kind: ts.ScriptKind) {
  return ts.createSourceFile(name, source, ts.ScriptTarget.Latest, true, kind)
}

function descendants<T extends ts.Node>(
  root: ts.Node,
  predicate: (node: ts.Node) => node is T
): T[] {
  const matches: T[] = []
  function visit(node: ts.Node) {
    if (predicate(node)) matches.push(node)
    ts.forEachChild(node, visit)
  }
  visit(root)
  return matches
}

function callName(call: ts.CallExpression): string {
  return call.expression.getText()
}

function reachableCalls(
  file: ts.SourceFile,
  entryPoint: string
): string[] {
  const functions = new Map(
    descendants(file, ts.isFunctionDeclaration)
      .flatMap((declaration) =>
        declaration.name
          ? ([[declaration.name.text, declaration]] as const)
          : []
      )
  )
  const pending = [entryPoint]
  const visited = new Set<string>()
  const calls: string[] = []
  while (pending.length > 0) {
    const functionName = pending.pop()
    if (!functionName || visited.has(functionName)) continue
    visited.add(functionName)
    const declaration = functions.get(functionName)
    if (!declaration) continue
    for (const call of descendants(declaration, ts.isCallExpression)) {
      const name = callName(call)
      calls.push(name)
      if (ts.isIdentifier(call.expression) && functions.has(name)) {
        pending.push(name)
      }
    }
  }
  return calls
}

function expectCapabilityProperty(
  object: ts.ObjectLiteralExpression,
  propertyName: string,
  capability: string
): void {
  const property = object.properties.find(
    (candidate): candidate is ts.PropertyAssignment =>
      ts.isPropertyAssignment(candidate) &&
      candidate.name.getText() === propertyName
  )
  expect(property).toBeDefined()
  if (!property || !ts.isCallExpression(property.initializer)) {
    throw new Error(`Missing ${propertyName} capability call`)
  }
  const call = property.initializer
  expect(callName(call)).toBe('can')
  expect(call.arguments.map((argument) => argument.getText())).toEqual([
    'profile.role',
    `'${capability}'`,
  ])
}

describe('Project Opportunity route contract', () => {
  it.each(ERP_ROLES)('projects exact mutation props for %s', (role) => {
    const expected = MUTATION_ROLES.has(role)
    expect({
      canCreate: can(role, 'opportunity.create'),
      canMutate: can(role, 'opportunity.advance_stage'),
    }).toEqual({ canCreate: expected, canMutate: expected })
  })

  it('passes centrally-derived create and mutate permissions to OpportunityPanel', () => {
    const file = sourceFile('page.tsx', pageSource, ts.ScriptKind.TSX)
    const permissions = descendants(file, ts.isVariableDeclaration).find(
      (declaration) => declaration.name.getText() === 'opportunityPermissions'
    )
    expect(permissions).toBeDefined()
    if (
      !permissions?.initializer ||
      !ts.isObjectLiteralExpression(permissions.initializer)
    ) {
      throw new Error('Missing opportunityPermissions object')
    }
    const permissionObject = permissions.initializer
    expectCapabilityProperty(permissionObject, 'canCreate', 'opportunity.create')
    expectCapabilityProperty(
      permissionObject,
      'canMutate',
      'opportunity.advance_stage'
    )

    const panel = descendants(file, ts.isJsxSelfClosingElement).find(
      (element) => element.tagName.getText() === 'OpportunityPanel'
    )
    const permissionSpread = panel?.attributes.properties.find(
      (attribute): attribute is ts.JsxSpreadAttribute =>
        ts.isJsxSpreadAttribute(attribute) &&
        attribute.expression.getText() === 'opportunityPermissions'
    )
    expect(permissionSpread).toBeDefined()
  })

  it('keeps transitionStage on one selected Core command with no local writer or audit', () => {
    const file = sourceFile('actions.ts', actionsSource, ts.ScriptKind.TS)
    const calls = reachableCalls(file, 'transitionStage')

    expect(
      calls.filter(
        (name) => name === 'transitionOpportunityStageThroughCoreApi'
      )
    ).toHaveLength(1)
    expect(calls).toContain('opportunityStageWritesUseCoreApi')
    expect(calls).not.toContain('db.update')
    expect(calls).not.toContain('writeAuditLog')
    expect(calls).not.toContain('startSlaClock')
    expect(calls).not.toContain('stopSlaClock')
  })
})
