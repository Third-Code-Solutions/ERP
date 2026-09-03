import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import ts from 'typescript'
import {
  verifyCoreStageAuthority,
  verifyProjectOpportunityPanelContract,
  verifyProjectOpportunityPermissions,
  verifyProjectStageDelegation,
  verifyWebStageDelegation,
} from './verify-wo-11-kyc-gate.mjs'

const corePath = 'apps/api/src/crm/opportunity-stage-transition.service.ts'
const pipelineActionPath = 'apps/web/src/app/(dashboard)/pipeline/actions.ts'
const projectActionPath =
  'apps/web/src/app/(dashboard)/projects/[id]/opportunities/actions.ts'
const projectPanelPath =
  'apps/web/src/components/opportunities/opportunity-panel.tsx'
const projectPanelModelPath =
  'apps/web/src/components/opportunities/opportunity-panel-model.ts'
const projectPagePath = 'apps/web/src/app/(dashboard)/projects/[id]/page.tsx'
const authorizationPath = 'packages/shared-types/src/authorization.ts'

function read(relativePath) {
  return fs.readFileSync(relativePath, 'utf8')
}

function parse(source, fileName) {
  const kind = fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    kind
  )
  assert.equal(sourceFile.parseDiagnostics.length, 0, `${fileName} must parse`)
  return sourceFile
}

function reprint(source, fileName) {
  return ts.createPrinter().printFile(parse(source, fileName))
}

function expressionPath(node) {
  if (ts.isIdentifier(node)) return node.text
  if (ts.isPropertyAccessExpression(node)) {
    const receiver = expressionPath(node.expression)
    return receiver ? `${receiver}.${node.name.text}` : node.name.text
  }
  return undefined
}

function callName(node) {
  if (!ts.isCallExpression(node)) return undefined
  return ts.isIdentifier(node.expression)
    ? node.expression.text
    : ts.isPropertyAccessExpression(node.expression)
      ? node.expression.name.text
      : undefined
}

function isWithinFunction(node, functionName) {
  let current = node.parent
  while (current) {
    if (
      ts.isFunctionDeclaration(current) &&
      current.name?.text === functionName
    ) {
      return true
    }
    current = current.parent
  }
  return false
}

function mutateFirst(source, fileName, predicate, replacement, label) {
  const sourceFile = parse(source, fileName)
  let mutationCount = 0
  const result = ts.transform(sourceFile, [
    (context) => {
      const visit = (node) => {
        if (mutationCount === 0 && predicate(node, sourceFile)) {
          mutationCount += 1
          return replacement(node, ts.factory)
        }
        return ts.visitEachChild(node, visit, context)
      }
      return (root) => ts.visitNode(root, visit)
    },
  ])
  assert.equal(mutationCount, 1, label)
  const mutated = ts.createPrinter().printFile(result.transformed[0])
  result.dispose()
  return mutated
}

function replaceNamedCall(source, fileName, name, replacementName) {
  return mutateFirst(
    source,
    fileName,
    (node) => ts.isCallExpression(node) && callName(node) === name,
    (node, factory) =>
      factory.updateCallExpression(
        node,
        factory.createIdentifier(replacementName),
        node.typeArguments,
        node.arguments
      ),
    `mutation fixture must replace ${name}`
  )
}

function addCallToFunction(source, fileName, functionName, callExpression, label) {
  return mutateFirst(
    source,
    fileName,
    (node) =>
      ts.isFunctionDeclaration(node) &&
      node.name?.text === functionName &&
      node.body !== undefined,
    (node, factory) =>
      factory.updateFunctionDeclaration(
        node,
        node.modifiers,
        node.asteriskToken,
        node.name,
        node.typeParameters,
        node.parameters,
        node.type,
        factory.updateBlock(node.body, [
          factory.createExpressionStatement(callExpression(factory)),
          ...node.body.statements,
        ])
      ),
    label
  )
}

function addOpportunityUpdate(source, fileName, functionName) {
  return addCallToFunction(
    source,
    fileName,
    functionName,
    (factory) =>
      factory.createCallExpression(
        factory.createPropertyAccessExpression(
          factory.createIdentifier('db'),
          'update'
        ),
        undefined,
        [factory.createIdentifier('opportunities')]
      ),
    `mutation fixture must add a local writer to ${functionName}`
  )
}

test('WO-11 PPRF and every mounted Opportunity stage contract passes', () => {
  const output = execFileSync(
    process.execPath,
    ['scripts/verify-wo-11-kyc-gate.mjs'],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
    }
  )
  assert.match(output, /enumerated Pipeline\/Project Core-only delegation/)
})

test('accepts benign TypeScript printer formatting on every AST-verified surface', () => {
  verifyCoreStageAuthority(reprint(read(corePath), corePath))
  verifyWebStageDelegation(
    reprint(read(pipelineActionPath), pipelineActionPath)
  )
  verifyProjectStageDelegation(
    reprint(read(projectActionPath), projectActionPath)
  )
  verifyProjectOpportunityPanelContract(
    reprint(read(projectPanelPath), projectPanelPath),
    reprint(read(projectPanelModelPath), projectPanelModelPath)
  )
  verifyProjectOpportunityPermissions(
    reprint(read(projectPagePath), projectPagePath),
    reprint(read(authorizationPath), authorizationPath)
  )
})

test('fails if Core downstream KYC enforcement is removed', () => {
  const mutated = mutateFirst(
    read(corePath),
    corePath,
    (node) =>
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      expressionPath(node.expression.expression) === 'KYC_GATED_STAGES' &&
      node.expression.name.text === 'has' &&
      expressionPath(node.arguments[0]) === 'command.newStage',
    (_node, factory) => factory.createFalse(),
    'mutation fixture must alter Core KYC gate'
  )
  assert.throws(
    () => verifyCoreStageAuthority(mutated),
    /Core downstream-stage KYC gate/
  )
})

test('fails if Core linked-Account tenant scoping is removed', () => {
  const mutated = mutateFirst(
    read(corePath),
    corePath,
    (node) =>
      ts.isCallExpression(node) &&
      callName(node) === 'eq' &&
      expressionPath(node.arguments[0]) === 'accounts.tenant_id' &&
      expressionPath(node.arguments[1]) === 'authorizedPrincipal.tenantId',
    (node, factory) =>
      factory.updateCallExpression(node, node.expression, node.typeArguments, [
        factory.createPropertyAccessExpression(
          factory.createIdentifier('accounts'),
          'id'
        ),
        factory.createPropertyAccessExpression(
          factory.createIdentifier('opportunity'),
          'accountId'
        ),
      ]),
    'mutation fixture must alter Account tenant scope'
  )
  assert.throws(
    () => verifyCoreStageAuthority(mutated),
    /linked Account query is tenant scoped/
  )
})

test('fails if Pipeline Core delegation is removed', () => {
  const mutated = replaceNamedCall(
    read(pipelineActionPath),
    pipelineActionPath,
    'transitionOpportunityStageThroughCoreApi',
    'removedCoreDelegate'
  )
  assert.throws(
    () => verifyWebStageDelegation(mutated),
    /Pipeline stage action has one Core delegate/
  )
})

test('fails if Pipeline adds a local Opportunity fallback writer', () => {
  const mutated = addOpportunityUpdate(
    read(pipelineActionPath),
    pipelineActionPath,
    'advanceOpportunityStage'
  )
  assert.throws(
    () => verifyWebStageDelegation(mutated),
    /Pipeline has no Web-local Opportunity stage writer/
  )
})

test('fails if Project detail Core delegation is removed', () => {
  const mutated = replaceNamedCall(
    read(projectActionPath),
    projectActionPath,
    'transitionOpportunityStageThroughCoreApi',
    'removedCoreDelegate'
  )
  assert.throws(
    () => verifyProjectStageDelegation(mutated),
    /Project detail stage action has one Core delegate/
  )
})

test('fails if Project detail adds a local Opportunity writer', () => {
  const mutated = addOpportunityUpdate(
    read(projectActionPath),
    projectActionPath,
    'transitionStage'
  )
  assert.throws(
    () => verifyProjectStageDelegation(mutated),
    /Project detail has no Web-local Opportunity stage writer/
  )
})

test('fails if Project detail adds a separate stage audit fallback', () => {
  const mutated = addCallToFunction(
    read(projectActionPath),
    projectActionPath,
    'transitionStage',
    (factory) =>
      factory.createCallExpression(
        factory.createIdentifier('writeAuditLog'),
        undefined,
        []
      ),
    'mutation fixture must add a Project detail audit fallback'
  )
  assert.throws(
    () => verifyProjectStageDelegation(mutated),
    /Project detail has no Web-local writeAuditLog fallback/
  )
})

test('fails if Project panel duplicates a transition table', () => {
  const mutated = mutateFirst(
    read(projectPanelPath),
    projectPanelPath,
    ts.isSourceFile,
    (node, factory) => {
      const localTransitions = factory.createVariableStatement(
        undefined,
        factory.createVariableDeclarationList(
          [
            factory.createVariableDeclaration(
              'LOCAL_STAGE_TRANSITIONS',
              undefined,
              undefined,
              factory.createObjectLiteralExpression([
                factory.createPropertyAssignment(
                  'negotiation',
                  factory.createArrayLiteralExpression([
                    factory.createStringLiteral('closed_won'),
                  ])
                ),
              ])
            ),
          ],
          ts.NodeFlags.Const
        )
      )
      return factory.updateSourceFile(node, [
        ...node.statements,
        localTransitions,
      ])
    },
    'mutation fixture must add a Project panel transition table'
  )
  assert.throws(
    () =>
      verifyProjectOpportunityPanelContract(
        mutated,
        read(projectPanelModelPath)
      ),
    /Project panel has no duplicate transition table/
  )
})

test('fails if Project panel bypasses shared reason routing', () => {
  const mutated = mutateFirst(
    read(projectPanelPath),
    projectPanelPath,
    (node) =>
      ts.isCallExpression(node) &&
      callName(node) === 'classifyOpportunityPanelDestination' &&
      isWithinFunction(node, 'handleTransition'),
    (_node, factory) => factory.createStringLiteral('submit'),
    'mutation fixture must bypass Project panel reason routing'
  )
  assert.throws(
    () =>
      verifyProjectOpportunityPanelContract(
        mutated,
        read(projectPanelModelPath)
      ),
    /Project panel routes transitions through the shared reason classifier/
  )
})

test('fails if Project route severs permission wiring to the panel', () => {
  const mutated = mutateFirst(
    read(projectPagePath),
    projectPagePath,
    (node) =>
      ts.isJsxSelfClosingElement(node) &&
      node.tagName.getText() === 'OpportunityPanel' &&
      node.attributes.properties.some(
        (attribute) =>
          ts.isJsxSpreadAttribute(attribute) &&
          expressionPath(attribute.expression) === 'opportunityPermissions'
      ),
    (node, factory) =>
      factory.updateJsxSelfClosingElement(
        node,
        node.tagName,
        node.typeArguments,
        factory.updateJsxAttributes(
          node.attributes,
          node.attributes.properties.filter(
            (attribute) =>
              !(
                ts.isJsxSpreadAttribute(attribute) &&
                expressionPath(attribute.expression) ===
                  'opportunityPermissions'
              )
          )
        )
      ),
    'mutation fixture must remove Project panel permission wiring'
  )
  assert.throws(
    () =>
      verifyProjectOpportunityPermissions(
        mutated,
        read(authorizationPath)
      ),
    /Project route passes central Opportunity permissions to the panel/
  )
})

test('fails if Project panel mutation handling loses its permission guard', () => {
  const mutated = mutateFirst(
    read(projectPanelPath),
    projectPanelPath,
    (node) =>
      ts.isPrefixUnaryExpression(node) &&
      node.operator === ts.SyntaxKind.ExclamationToken &&
      expressionPath(node.operand) === 'canMutate' &&
      isWithinFunction(node, 'handleTransition'),
    (_node, factory) => factory.createFalse(),
    'mutation fixture must remove the Project transition permission guard'
  )
  assert.throws(
    () =>
      verifyProjectOpportunityPanelContract(
        mutated,
        read(projectPanelModelPath)
      ),
    /Project panel mutation callers are permission guarded/
  )
})
