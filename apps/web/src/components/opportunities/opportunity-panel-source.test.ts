import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

const sourceText = readFileSync(
  fileURLToPath(new URL('./opportunity-panel.tsx', import.meta.url)),
  'utf8'
)
const sourceFile = ts.createSourceFile(
  'opportunity-panel.tsx',
  sourceText,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX
)

function descendants<T extends ts.Node>(
  root: ts.Node,
  predicate: (node: ts.Node) => node is T
): T[] {
  const matches: T[] = []
  function visit(node: ts.Node): void {
    if (predicate(node)) matches.push(node)
    ts.forEachChild(node, visit)
  }
  visit(root)
  return matches
}

function namedCall(node: ts.Node, name: string): boolean {
  return descendants(node, ts.isCallExpression).some(
    (call) => ts.isIdentifier(call.expression) && call.expression.text === name
  )
}

function nestedFunction(name: string): ts.FunctionDeclaration | undefined {
  return descendants(sourceFile, ts.isFunctionDeclaration).find(
    (declaration) => declaration.name?.text === name
  )
}

function directCallName(statement: ts.Statement): string | null {
  if (
    !ts.isExpressionStatement(statement) ||
    !ts.isCallExpression(statement.expression) ||
    !ts.isIdentifier(statement.expression.expression)
  ) {
    return null
  }
  return statement.expression.expression.text
}

function clearsErrorBeforeTransition(functionName: string): boolean {
  const body = nestedFunction(functionName)?.body
  if (!body) return false
  const calls = body.statements.map((statement) => ({
    statement,
    name: directCallName(statement),
  }))
  const clearIndex = calls.findIndex(({ statement, name }) => {
    if (name !== 'setError' || !ts.isExpressionStatement(statement)) return false
    const argument = (statement.expression as ts.CallExpression).arguments[0]
    return argument?.kind === ts.SyntaxKind.NullKeyword
  })
  const transitionIndex = calls.findIndex(({ name }) => name === 'startTransition')
  return clearIndex >= 0 && transitionIndex > clearIndex
}

function hasSynchronousSubmissionGuard(functionName: string): boolean {
  const declaration = nestedFunction(functionName)
  if (!declaration) return false
  return descendants(declaration, ts.isIfStatement).some(
    (statement) =>
      descendants(statement.expression, ts.isPropertyAccessExpression).some(
        (access) => access.getText(sourceFile) === 'submissionInFlightRef.current'
      ) && descendants(statement.thenStatement, ts.isReturnStatement).length > 0
  )
}

function callCount(name: string): number {
  return descendants(sourceFile, ts.isCallExpression).filter(
    (call) => ts.isIdentifier(call.expression) && call.expression.text === name
  ).length
}

function isWithinProperty(node: ts.Node, propertyName: string): boolean {
  let current: ts.Node | undefined = node.parent
  while (current) {
    if (
      ts.isPropertyAssignment(current) &&
      current.name.getText(sourceFile) === propertyName
    ) {
      return true
    }
    current = current.parent
  }
  return false
}

function jsxBinding(tagName: string, attributeName: string): string | null {
  const element = descendants(sourceFile, ts.isJsxSelfClosingElement).find(
    (candidate) => candidate.tagName.getText(sourceFile) === tagName
  )
  const attribute = element?.attributes.properties.find(
    (candidate): candidate is ts.JsxAttribute =>
      ts.isJsxAttribute(candidate) &&
      candidate.name.getText(sourceFile) === attributeName
  )
  if (
    !attribute?.initializer ||
    !ts.isJsxExpression(attribute.initializer) ||
    !attribute.initializer.expression ||
    !ts.isIdentifier(attribute.initializer.expression)
  ) {
    return null
  }
  return attribute.initializer.expression.text
}

describe('OpportunityPanel mounted caller source contract', () => {
  it('uses shared transition and guarded submission contracts', () => {
    expect(sourceText).not.toContain('VALID_TRANSITIONS')
    expect(sourceText).not.toContain('@third-code-erp/database')
    expect(namedCall(sourceFile, 'getOpportunityPanelDestinations')).toBe(true)
    expect(namedCall(nestedFunction('handleTransition')!, 'classifyOpportunityPanelDestination')).toBe(true)
    expect(namedCall(nestedFunction('submitTransition')!, 'buildOpportunityTransitionFormData')).toBe(true)
    expect(namedCall(sourceFile, 'createStageTransitionSubmitter')).toBe(true)
    expect(namedCall(sourceFile, 'createOpportunityPanelActionSubmitter')).toBe(true)
    expect(callCount('transitionStage')).toBe(1)
    expect(callCount('createOpportunity')).toBe(1)
    expect(hasSynchronousSubmissionGuard('handleCreate')).toBe(true)
    expect(hasSynchronousSubmissionGuard('handleTransition')).toBe(true)
    expect(hasSynchronousSubmissionGuard('submitTransition')).toBe(true)
  })

  it('clears stale alerts urgently before either React transition', () => {
    expect(clearsErrorBeforeTransition('handleCreate')).toBe(true)
    expect(clearsErrorBeforeTransition('submitTransition')).toBe(true)
  })

  it('binds distinct required-reason dialogs and an accessible alert', () => {
    expect(jsxBinding('LostReasonDialog', 'onConfirm')).toBe('confirmLost')
    expect(jsxBinding('RegressionReasonDialog', 'onConfirm')).toBe(
      'confirmRegression'
    )
    expect(sourceText).toContain('role="alert"')
  })

  it('builds creation FormData through the normalized public contract', () => {
    expect(namedCall(nestedFunction('handleCreate')!, 'buildOpportunityCreateFormData')).toBe(true)
  })

  it('keeps mutation surfaces open unless their action reaches onSuccess', () => {
    const createClosers = descendants(sourceFile, ts.isCallExpression).filter(
      (call) =>
        ts.isIdentifier(call.expression) &&
        call.expression.text === 'setShowCreateForm' &&
        call.arguments[0]?.kind === ts.SyntaxKind.FalseKeyword
    )
    const transitionClosers = descendants(sourceFile, ts.isCallExpression).filter(
      (call) =>
        ts.isIdentifier(call.expression) &&
        call.expression.text === 'setStagingOppId' &&
        call.arguments[0]?.kind === ts.SyntaxKind.NullKeyword
    )

    expect(createClosers).toHaveLength(1)
    expect(transitionClosers).toHaveLength(1)
    expect(createClosers.every((call) => isWithinProperty(call, 'onSuccess'))).toBe(true)
    expect(
      transitionClosers.every((call) => isWithinProperty(call, 'onSuccess'))
    ).toBe(true)
  })
})
